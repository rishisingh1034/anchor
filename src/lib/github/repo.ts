// Hour 0-5 target: fetch a repo's file tree + key manifest files
// (package.json, Dockerfile, requirements.txt, index.html at root)
// and return a SMALL summary object — not the whole repo — so the
// Bedrock classification prompt stays cheap.
import { Octokit } from "@octokit/rest";

export interface RepoManifest {
  owner: string;
  repo: string;
  hasPackageJson: boolean;
  hasDockerfile: boolean;
  hasRequirementsTxt: boolean;
  hasStaticIndexHtml: boolean;
  packageJsonScripts?: Record<string, string>;
  topLevelFiles: string[];
}

export async function getRepoManifest(
  owner: string,
  repo: string,
  token: string
): Promise<RepoManifest> {
  const octokit = new Octokit({ auth: token });
  // TODO: octokit.repos.getContent({ owner, repo, path: "" })
  // then fetch package.json contents if present to grab `scripts` + deps.
  throw new Error("not implemented yet");
}
