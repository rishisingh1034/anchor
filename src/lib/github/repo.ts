import { Octokit } from "@octokit/rest";

type DependencyMap = Record<string, string>;

export interface PackageJsonSummary {
  scripts: Record<string, string>;
  dependencies: DependencyMap;
  devDependencies: DependencyMap;
}

export interface RepoManifest {
  owner: string;
  repo: string;
  hasPackageJson: boolean;
  hasDockerfile: boolean;
  hasRequirementsTxt: boolean;
  hasStaticIndexHtml: boolean;
  packageJson?: PackageJsonSummary;
}

export class RepoManifestError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "RepoManifestError";
  }
}

function cleanStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function getTopLevelFileNames(contents: unknown): Set<string> {
  if (!Array.isArray(contents)) throw new RepoManifestError("GitHub returned an unexpected repository listing.");

  return new Set(
    contents
      .filter((item): item is { name: string; type: string } => Boolean(item && typeof item === "object" && "name" in item && "type" in item))
      .filter((item) => item.type === "file")
      .map((item) => item.name),
  );
}

export async function getRepoManifest(
  owner: string,
  repo: string,
  token?: string,
): Promise<RepoManifest> {
  const octokit = new Octokit(token ? { auth: token } : {});

  try {
    const { data: rootContents } = await octokit.rest.repos.getContent({ owner, repo, path: "" });
    const files = getTopLevelFileNames(rootContents);
    const hasPackageJson = files.has("package.json");
    const manifest: RepoManifest = {
      owner, repo, hasPackageJson,
      hasDockerfile: files.has("Dockerfile"),
      hasRequirementsTxt: files.has("requirements.txt"),
      hasStaticIndexHtml: files.has("index.html"),
    };
    if (!hasPackageJson) return manifest;

    const { data: packageFile } = await octokit.rest.repos.getContent({ owner, repo, path: "package.json" });
    if (Array.isArray(packageFile) || packageFile.type !== "file" || !packageFile.content) {
      throw new RepoManifestError("The repository package.json could not be read.");
    }

    let packageJson: unknown;
    try {
      packageJson = JSON.parse(Buffer.from(packageFile.content, "base64").toString("utf8"));
    } catch {
      throw new RepoManifestError("The repository package.json is not valid JSON.");
    }
    const packageData: Record<string, unknown> =
      packageJson && typeof packageJson === "object" && !Array.isArray(packageJson)
        ? (packageJson as Record<string, unknown>) : {};
    manifest.packageJson = {
      scripts: cleanStringMap(packageData.scripts),
      dependencies: cleanStringMap(packageData.dependencies),
      devDependencies: cleanStringMap(packageData.devDependencies),
    };
    return manifest;
  } catch (error) {
    if (error instanceof RepoManifestError) throw error;
    const status = typeof error === "object" && error && "status" in error && typeof error.status === "number" ? error.status : undefined;
    throw new RepoManifestError("Unable to read this repository from GitHub.", status);
  }
}
