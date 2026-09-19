import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import AdmZip from "adm-zip";
import { Octokit } from "@octokit/rest";
import { BucketLocationConstraint, CreateBucketCommand, PutBucketPolicyCommand, PutObjectCommand, PutPublicAccessBlockCommand } from "@aws-sdk/client-s3";
import { CreateDistributionCommand, CreateOriginAccessControlCommand } from "@aws-sdk/client-cloudfront";

import { cloudfront, s3 } from "@/lib/aws/clients";
import type { Classification } from "@/lib/bedrock/classify";
import type { RepoManifest } from "@/lib/github/repo";

const execFileAsync = promisify(execFile);

export interface StaticDeployment {
  liveUrl: string;
  bucketName: string;
  distributionId: string;
}

export class StaticDeploymentError extends Error {
  constructor(public readonly stage: "clone" | "build" | "upload" | "distribution", message: string) {
    super(message);
    this.name = "StaticDeploymentError";
  }
}

function safeBucketName(prefix: string) {
  const normalized = prefix.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "") || "anchor-site";
  return `${normalized.slice(0, 35)}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

async function downloadAndExtractRepo(owner: string, repo: string, destination: string, token?: string) {
  const octokit = new Octokit(token ? { auth: token } : {});
  let response;
  try {
    response = await octokit.rest.repos.downloadZipballArchive({ owner, repo, ref: "HEAD" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown GitHub error";
    throw new StaticDeploymentError("clone", `Unable to download repository archive from GitHub: ${message}`);
  }

  const zip = new AdmZip(Buffer.from(response.data as ArrayBuffer));
  const entries = zip.getEntries();
  for (const entry of entries) {
    const parts = entry.entryName.split("/").filter(Boolean);
    if (parts.length <= 1 && entry.isDirectory) continue;
    const relativePath = parts.slice(1).join("/");
    if (!relativePath) continue;
    const destPath = path.join(destination, relativePath);
    if (entry.isDirectory) {
      await mkdir(destPath, { recursive: true });
    } else {
      await mkdir(path.dirname(destPath), { recursive: true });
      await writeFile(destPath, entry.getData());
    }
  }
}

function buildCommandArguments(command: string) {
  const parts = command.trim().split(/\s+/);
  if (!parts[0] || !new Set(["npm", "pnpm", "yarn"]).has(parts[0]) || /[;&|`$()<>]/.test(command)) {
    throw new StaticDeploymentError("build", "The classifier returned an unsafe or unsupported build command.");
  }
  return { executable: parts[0], args: parts.slice(1) };
}

function contentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return ({ ".css": "text/css; charset=utf-8", ".gif": "image/gif", ".html": "text/html; charset=utf-8", ".ico": "image/x-icon", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2" })[extension] ?? "application/octet-stream";
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.name !== ".git")
      .map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return listFiles(filePath);
        return entry.isFile() ? [filePath] : [];
      }),
  );
  return nested.flat();
}

async function uploadDirectory(bucketName: string, outputDirectory: string) {
  const files = await listFiles(outputDirectory);
  if (!files.length) throw new StaticDeploymentError("upload", "The build output directory is empty.");
  try {
    await Promise.all(files.map(async (filePath) => {
      const key = path.relative(outputDirectory, filePath).split(path.sep).join("/");
      await s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: await readFile(filePath),
        ContentType: contentType(filePath),
        CacheControl: key === "index.html" ? "no-cache" : "public, max-age=31536000, immutable",
      }));
    }));
  } catch (error) {
    throw new StaticDeploymentError("upload", `Failed to upload the static build output: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

export async function deployStaticSite(
  _manifest: RepoManifest,
  classification: Classification,
  owner: string,
  repo: string,
  githubToken?: string,
): Promise<StaticDeployment> {
  if (classification.type !== "static-frontend") throw new StaticDeploymentError("build", "Only static frontend repositories can be deployed.");

  const workspace = await mkdtemp(path.join(tmpdir(), "anchor-deploy-"));
  const repositoryDirectory = path.join(workspace, "repository");
  const region = process.env.AWS_REGION ?? "us-east-1";
  const bucketName = safeBucketName(process.env.DEPLOY_BUCKET_PREFIX ?? "anchor-site");
  try {
    await downloadAndExtractRepo(owner, repo, repositoryDirectory, githubToken);

    const buildCmd = classification.buildCommand?.trim() ?? "";
    if (buildCmd) {
      const npmCacheDir = path.join(workspace, ".npm-cache");
      const cleanEnv: Record<string, string | undefined> = {
        ...process.env,
        npm_config_cache: npmCacheDir,
        npm_config_update_notifier: "false",
        npm_config_audit: "false",
        npm_config_fund: "false",
        HOME: workspace,
      };
      delete cleanEnv.NODE_OPTIONS;

      if (_manifest.hasPackageJson) {
        try {
          await execFileAsync("npm", ["install", "--include=dev", "--no-audit", "--no-fund", "--cache", npmCacheDir], {
            cwd: repositoryDirectory,
            env: { ...cleanEnv, NODE_ENV: "development" } as NodeJS.ProcessEnv,
            maxBuffer: 10 * 1024 * 1024,
          });
        } catch (error) {
          throw new StaticDeploymentError("build", `Dependency installation failed: ${error instanceof Error ? error.message.slice(0, 1_000) : "unknown error"}`);
        }
      }

      const { executable, args } = buildCommandArguments(buildCmd);
      try {
        await execFileAsync(executable, args, {
          cwd: repositoryDirectory,
          env: { ...cleanEnv, NODE_ENV: "production" } as NodeJS.ProcessEnv,
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch (error) {
        throw new StaticDeploymentError("build", `The build command failed: ${error instanceof Error ? error.message.slice(0, 1_000) : "unknown error"}`);
      }
    }

    const relOutputDir = classification.buildOutputDir?.trim() || ".";
    const outputDirectory = path.resolve(repositoryDirectory, relOutputDir);
    let outputIsDirectory = false;
    try {
      outputIsDirectory = (outputDirectory === repositoryDirectory || outputDirectory.startsWith(`${repositoryDirectory}${path.sep}`)) && (await stat(outputDirectory)).isDirectory();
    } catch {
      outputIsDirectory = false;
    }
    if (!outputIsDirectory) {
      throw new StaticDeploymentError("build", `Build output directory "${classification.buildOutputDir}" was not created.`);
    }

    try {
      await s3.send(new CreateBucketCommand({ Bucket: bucketName, ...(region === "us-east-1" ? {} : { CreateBucketConfiguration: { LocationConstraint: region as BucketLocationConstraint } }) }));
      await s3.send(new PutPublicAccessBlockCommand({
        Bucket: bucketName,
        PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      }));
      await uploadDirectory(bucketName, outputDirectory);
    } catch (error) {
      if (error instanceof StaticDeploymentError) throw error;
      throw new StaticDeploymentError("upload", `Unable to create or configure the S3 deployment bucket: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    try {
      const originAccessControl = await cloudfront.send(new CreateOriginAccessControlCommand({
        OriginAccessControlConfig: { Name: `anchor-${bucketName}`, Description: "Anchor static site origin access control", OriginAccessControlOriginType: "s3", SigningBehavior: "always", SigningProtocol: "sigv4" },
      }));
      const distribution = await cloudfront.send(new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: randomUUID(), Comment: `Anchor deployment for ${owner}/${repo}`, Enabled: true, DefaultRootObject: "index.html", PriceClass: "PriceClass_100",
          Origins: { Quantity: 1, Items: [{ Id: "s3-origin", DomainName: `${bucketName}.s3.${region}.amazonaws.com`, OriginAccessControlId: originAccessControl.OriginAccessControl?.Id, S3OriginConfig: { OriginAccessIdentity: "" } }] },
          DefaultCacheBehavior: {
            TargetOriginId: "s3-origin", ViewerProtocolPolicy: "redirect-to-https", Compress: true,
            AllowedMethods: { Quantity: 2, Items: ["GET", "HEAD"], CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] } },
            ForwardedValues: { QueryString: false, Cookies: { Forward: "none" } }, MinTTL: 0,
          },
        },
      }));
      const created = distribution.Distribution;
      if (!created?.Id || !created.DomainName || !created.ARN) throw new Error("CloudFront did not return distribution details.");
      await s3.send(new PutBucketPolicyCommand({
        Bucket: bucketName,
        Policy: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "cloudfront.amazonaws.com" }, Action: "s3:GetObject", Resource: `arn:aws:s3:::${bucketName}/*`, Condition: { StringEquals: { "AWS:SourceArn": created.ARN } } }] }),
      }));
      return { liveUrl: `https://${created.DomainName}`, bucketName, distributionId: created.Id };
    } catch (error) {
      throw new StaticDeploymentError("distribution", `Unable to create or configure the CloudFront distribution: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
