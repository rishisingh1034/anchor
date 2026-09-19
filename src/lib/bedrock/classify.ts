// Hour 5-13 target: send the RepoManifest summary to Bedrock and get back
// a structured classification. Ask for JSON output so it's easy to parse.
import type { RepoManifest } from "@/lib/github/repo";

export type ProjectType = "static-frontend" | "unsupported";
// Note: "node-api" intentionally left out of the MVP type union.
// Add it back only if you reach the stretch-goal Lambda path.

export interface Classification {
  type: ProjectType;
  reason: string;
  suggestedStack: string[]; // e.g. ["S3", "CloudFront"]
}

export async function classifyRepo(
  manifest: RepoManifest
): Promise<Classification> {
  // TODO: build prompt from manifest, call bedrock.send(InvokeModelCommand),
  // parse JSON response into Classification.
  throw new Error("not implemented yet");
}
