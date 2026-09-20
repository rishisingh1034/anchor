import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { dynamo } from "@/lib/aws/clients";
import { classifyRepo } from "@/lib/bedrock/classify";
import { authOptions } from "@/lib/auth";
import { estimateMonthlyCost, type CostEstimate } from "@/lib/cost/estimate";
import { deployStaticSite, StaticDeploymentError } from "@/lib/deploy/static";
import { getRepoManifest, RepoManifestError } from "@/lib/github/repo";

export const runtime = "nodejs";

const deployRequestSchema = z.object({
  owner: z.string().trim().min(1).max(100),
  repo: z.string().trim().min(1).max(100),
  startedAt: z.string().datetime().optional(),
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

  const { owner, repo, startedAt } = parsedRequest.data;
  const timestamp = startedAt || new Date().toISOString();

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
  }

  // 3. Helper to update live progress state in DynamoDB
  const updateStatus = async (
    status: string,
    extra?: {
      liveUrl?: string;
      errorMessage?: string;
      failedStage?: string;
      totalSizeBytes?: number;
      estimatedMonthlyCostUsd?: number;
      costBreakdown?: CostEstimate;
    },
  ) => {
    try {
      const updateExprParts: string[] = ["#status = :status", "#updatedAt = :updatedAt"];
      const exprAttrNames: Record<string, string> = {
        "#status": "status",
        "#updatedAt": "updatedAt",
      };
      const exprAttrValues: Record<string, unknown> = {
        ":status": status,
        ":updatedAt": new Date().toISOString(),
      };

      if (extra?.liveUrl) {
        updateExprParts.push("#liveUrl = :liveUrl");
        exprAttrNames["#liveUrl"] = "liveUrl";
        exprAttrValues[":liveUrl"] = extra.liveUrl;
      }
      if (typeof extra?.totalSizeBytes === "number") {
        updateExprParts.push("#totalSizeBytes = :totalSizeBytes");
        exprAttrNames["#totalSizeBytes"] = "totalSizeBytes";
        exprAttrValues[":totalSizeBytes"] = extra.totalSizeBytes;
      }
      if (typeof extra?.estimatedMonthlyCostUsd === "number") {
        updateExprParts.push("#estimatedMonthlyCostUsd = :estimatedMonthlyCostUsd");
        exprAttrNames["#estimatedMonthlyCostUsd"] = "estimatedMonthlyCostUsd";
        exprAttrValues[":estimatedMonthlyCostUsd"] = extra.estimatedMonthlyCostUsd;
      }
      if (extra?.costBreakdown) {
        updateExprParts.push("#costBreakdown = :costBreakdown");
        exprAttrNames["#costBreakdown"] = "costBreakdown";
        exprAttrValues[":costBreakdown"] = extra.costBreakdown;
      }
      if (extra?.errorMessage) {
        updateExprParts.push("#errorMessage = :errorMessage");
        exprAttrNames["#errorMessage"] = "errorMessage";
        exprAttrValues[":errorMessage"] = extra.errorMessage;
      }
      if (extra?.failedStage) {
        updateExprParts.push("#failedStage = :failedStage");
        exprAttrNames["#failedStage"] = "failedStage";
        exprAttrValues[":failedStage"] = extra.failedStage;
      }

      await dynamo.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { owner, timestamp },
          UpdateExpression: `SET ${updateExprParts.join(", ")}`,
          ExpressionAttributeNames: exprAttrNames,
          ExpressionAttributeValues: exprAttrValues,
        }),
      );
    } catch (err) {
      console.warn("Failed to update deployment status in DynamoDB:", err);
    }
  };

  // 4. Immediately record the initial "analyzing" status
  try {
    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          owner,
          repo,
          timestamp,
          status: "analyzing",
          updatedAt: new Date().toISOString(),
          deployedBy: userId,
        },
      }),
    );
  } catch (err) {
    console.warn("Failed to create initial deployment record:", err);
  }

  // 5. Stage: Analyzing (Manifest inspection)
  let manifest;
  try {
    manifest = await getRepoManifest(owner, repo, githubToken);
  } catch (error) {
    const message = error instanceof RepoManifestError && error.status === 404
      ? "Repository not found or you do not have access to it."
      : "Unable to read this repository from GitHub.";
    await updateStatus("failed", { errorMessage: message, failedStage: "analyzing" });
    return Response.json({ error: message }, { status: 502 });
  }

  // 6. Stage: Classifying (Amazon Bedrock LLM)
  await updateStatus("classifying");
  let classification;
  try {
    classification = await classifyRepo(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Repository classification failed.";
    await updateStatus("failed", { errorMessage: message, failedStage: "classifying" });
    return Response.json({ error: message }, { status: 502 });
  }

  if (classification.type === "unsupported") {
    await updateStatus("failed", { errorMessage: classification.reason, failedStage: "classifying" });
    return Response.json({ error: classification.reason, classification }, { status: 422 });
  }

  // 7. Stages: Installing, Building, Uploading, Provisioning CloudFront
  try {
    const deployment = await deployStaticSite(
      manifest,
      classification,
      owner,
      repo,
      githubToken,
      async (stage) => {
        await updateStatus(stage);
      },
    );

    const costEstimate = estimateMonthlyCost(deployment.totalSizeBytes);

    await updateStatus("deployed", {
      liveUrl: deployment.liveUrl,
      totalSizeBytes: deployment.totalSizeBytes,
      estimatedMonthlyCostUsd: costEstimate.totalMonthlyCostUsd,
      costBreakdown: costEstimate,
    });

    // Record user rate-limit ledger item
    const rateLimitRecord = {
      owner: `user#${userId}`,
      timestamp,
      repo: `${owner}/${repo}`,
      status: "deployed",
      liveUrl: deployment.liveUrl,
    };
    await dynamo.send(new PutCommand({ TableName: tableName, Item: rateLimitRecord })).catch(() => {});

    const finalRecord = {
      owner,
      repo,
      status: "deployed",
      liveUrl: deployment.liveUrl,
      timestamp,
      deployedBy: userId,
      totalSizeBytes: deployment.totalSizeBytes,
      estimatedMonthlyCostUsd: costEstimate.totalMonthlyCostUsd,
      costBreakdown: costEstimate,
    };

    return Response.json(finalRecord, { status: 201 });
  } catch (error) {
    const failedStage = error instanceof StaticDeploymentError ? error.stage : "deploy";
    const errorMessage = error instanceof Error ? error.message : "Deployment failed.";
    await updateStatus("failed", { errorMessage, failedStage });

    if (error instanceof StaticDeploymentError) {
      return Response.json({ error: error.message, stage: error.stage }, { status: 502 });
    }
    return Response.json({ error: errorMessage }, { status: 502 });
  }
}
