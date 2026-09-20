import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { dynamo } from "@/lib/aws/clients";
import { classifyRepo } from "@/lib/bedrock/classify";
import { authOptions } from "@/lib/auth";
import { deployStaticSite, StaticDeploymentError } from "@/lib/deploy/static";
import { getRepoManifest, RepoManifestError } from "@/lib/github/repo";

export const runtime = "nodejs";

const deployRequestSchema = z.object({
  owner: z.string().trim().min(1).max(100),
  repo: z.string().trim().min(1).max(100),
});

// Verified demo repositories allowed for automated deployment in the public live environment
const ALLOWED_DEMO_REPOS = [
  "asprooo/mon-portfolio",
  "safdarjamal/vite-template-react",
  "sveltejs/template",
];

const MAX_DAILY_DEPLOYMENTS = 5;

function isRepoAllowed(owner: string, repo: string): boolean {
  if (process.env.ALLOW_ANY_REPO === "true" || process.env.NODE_ENV !== "production") {
    return true;
  }
  const fullName = `${owner}/${repo}`.toLowerCase();
  const customAllowed = process.env.ALLOWED_REPOS
    ? process.env.ALLOWED_REPOS.split(",").map((r) => r.trim().toLowerCase())
    : [];
  return ALLOWED_DEMO_REPOS.includes(fullName) || customAllowed.includes(fullName);
}

export async function POST(request: NextRequest) {
  const sessionToken = await getToken({ req: request, secret: authOptions.secret });
  const githubToken = sessionToken?.githubAccessToken;
  if (!githubToken) return Response.json({ error: "Sign in with GitHub to deploy a repository." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }

  const parsedRequest = deployRequestSchema.safeParse(body);
  if (!parsedRequest.success) return Response.json({ error: "Provide a valid repository owner and name." }, { status: 400 });

  const { owner, repo } = parsedRequest.data;

  // 1. Repo Allow-list check (Production safety)
  if (!isRepoAllowed(owner, repo)) {
    return Response.json(
      {
        error: "This repository is not in the public demo allow-list. Clone Anchor locally to deploy arbitrary repositories.",
      },
      { status: 403 },
    );
  }

  const tableName = process.env.DEPLOYMENTS_TABLE || "deployments";
  const userId = String(
    sessionToken.githubUser || sessionToken.name || sessionToken.email || sessionToken.sub || "user",
  ).toLowerCase().replace(/[^a-z0-9_-]/g, "");

  // 2. Rolling 24-hour rate limit check
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const rateCheck = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#owner = :userKey AND #ts >= :oneDayAgo",
        ExpressionAttributeNames: {
          "#owner": "owner",
          "#ts": "timestamp",
        },
        ExpressionAttributeValues: {
          ":userKey": `user#${userId}`,
          ":oneDayAgo": oneDayAgo,
        },
      }),
    );

    const deploymentCount = rateCheck.Count ?? 0;
    if (deploymentCount >= MAX_DAILY_DEPLOYMENTS) {
      return Response.json(
        {
          error: `Deployment rate limit exceeded (${MAX_DAILY_DEPLOYMENTS} deployments per 24 hours). Please try again later or clone Anchor locally for unlimited deploys.`,
        },
        { status: 429 },
      );
    }
  } catch (error) {
    console.warn("Rate limit check warning:", error);
    // Non-blocking fallback if rate-limit query encounters temporary AWS issue
  }

  // 3. Fetch repo manifest from GitHub
  let manifest;
  try {
    manifest = await getRepoManifest(owner, repo, githubToken);
  } catch (error) {
    const message = error instanceof RepoManifestError && error.status === 404
      ? "Repository not found or you do not have access to it."
      : "Unable to read this repository from GitHub.";
    return Response.json({ error: message }, { status: 502 });
  }

  // 4. Classify stack using Bedrock
  let classification;
  try {
    classification = await classifyRepo(manifest);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Repository classification failed." }, { status: 502 });
  }
  if (classification.type === "unsupported") return Response.json({ error: classification.reason, classification }, { status: 422 });

  // 5. Deploy static site to S3 + CloudFront
  try {
    const deployment = await deployStaticSite(manifest, classification, owner, repo, githubToken);
    const nowIso = new Date().toISOString();

    const deploymentRecord = {
      owner,
      repo,
      status: "deployed",
      liveUrl: deployment.liveUrl,
      timestamp: nowIso,
      deployedBy: userId,
    };

    const rateLimitRecord = {
      owner: `user#${userId}`,
      timestamp: nowIso,
      repo: `${owner}/${repo}`,
      status: "deployed",
      liveUrl: deployment.liveUrl,
    };

    // Store deployment history and increment rate-limit ledger
    await Promise.all([
      dynamo.send(new PutCommand({ TableName: tableName, Item: deploymentRecord })),
      dynamo.send(new PutCommand({ TableName: tableName, Item: rateLimitRecord })),
    ]);

    return Response.json(deploymentRecord, { status: 201 });
  } catch (error) {
    if (error instanceof StaticDeploymentError) return Response.json({ error: error.message, stage: error.stage }, { status: 502 });
    return Response.json({ error: error instanceof Error ? error.message : "Deployment could not be recorded." }, { status: 502 });
  }
}
