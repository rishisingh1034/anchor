import { PutCommand } from "@aws-sdk/lib-dynamodb";
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
  let manifest;
  try {
    manifest = await getRepoManifest(owner, repo, githubToken);
  } catch (error) {
    const message = error instanceof RepoManifestError && error.status === 404
      ? "Repository not found or you do not have access to it."
      : "Unable to read this repository from GitHub.";
    return Response.json({ error: message }, { status: 502 });
  }

  let classification;
  try {
    classification = await classifyRepo(manifest);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Repository classification failed." }, { status: 502 });
  }
  if (classification.type === "unsupported") return Response.json({ error: classification.reason, classification }, { status: 422 });

  try {
    const deployment = await deployStaticSite(manifest, classification, owner, repo, githubToken);
    const tableName = process.env.DEPLOYMENTS_TABLE || "deployments";
    const record = { owner, repo, status: "deployed", liveUrl: deployment.liveUrl, timestamp: new Date().toISOString() };
    await dynamo.send(new PutCommand({ TableName: tableName, Item: record }));
    return Response.json(record, { status: 201 });
  } catch (error) {
    if (error instanceof StaticDeploymentError) return Response.json({ error: error.message, stage: error.stage }, { status: 502 });
    return Response.json({ error: error instanceof Error ? error.message : "Deployment could not be recorded." }, { status: 502 });
  }
}
