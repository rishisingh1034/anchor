import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { dynamo } from "@/lib/aws/clients";
import { classifyRepo } from "@/lib/bedrock/classify";
import { estimateMonthlyCost, type CostEstimate } from "@/lib/cost/estimate";
import { deployStaticSite, StaticDeploymentError } from "@/lib/deploy/static";
import { getRepoManifest, RepoManifestError } from "@/lib/github/repo";

export const runtime = "nodejs";

const demoDeployRequestSchema = z.object({
  owner: z.string().trim().optional(),
  repo: z.string().trim().min(1).max(100),
  startedAt: z.string().datetime().optional(),
});

// Strict allow-list for anonymous 1-click demo deployments
const ALLOWED_DEMO_REPOS = [
  "asprooo/mon-portfolio",
  "safdarjamal/vite-template-react",
  "sveltejs/template",
  "gabrielecirulli/2048",
  "victorqribeiro/isocity",
  "jakesgordon/javascript-tetris",
];

const MAX_HOURLY_DEMO_DEPLOYMENTS = 10;

function parseRepo(ownerInput?: string, repoInput?: string): { owner: string; repo: string; fullName: string } {
  let owner = (ownerInput || "").trim();
  let repo = (repoInput || "").trim();

  if (repo.includes("/")) {
    const parts = repo.split("/");
    owner = parts[0];
    repo = parts.slice(1).join("/");
  }

  const fullName = `${owner}/${repo}`.toLowerCase();
  return { owner, repo, fullName };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsedRequest = demoDeployRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return Response.json({ error: "Provide a valid repository selection." }, { status: 400 });
  }

  const { owner: rawOwner, repo: rawRepo, startedAt } = parsedRequest.data;
  const { owner, repo, fullName } = parseRepo(rawOwner, rawRepo);
  const timestamp = startedAt || new Date().toISOString();

  // 1. Fixed allow-list verification (No arbitrary repo execution)
  if (!owner || !repo || !ALLOWED_DEMO_REPOS.includes(fullName)) {
    return Response.json(
      {
        error: "This repository is not available in the anonymous demo. Select one of the 3 featured demo repositories or sign in to deploy custom repositories.",
      },
      { status: 403 },
    );
  }

  const tableName = process.env.DEPLOYMENTS_TABLE || "deployments";
  const ownerKey = `demo#${owner}/${repo}`;

  // 2. Global rolling 1-hour rate limit check across all anonymous demo visitors
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  try {
    const rateCheck = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#owner = :rateKey AND #ts >= :oneHourAgo",
        ExpressionAttributeNames: {
          "#owner": "owner",
          "#ts": "timestamp",
        },
        ExpressionAttributeValues: {
          ":rateKey": "demo#ratelimit",
          ":oneHourAgo": oneHourAgo,
        },
      }),
    );

    const hourlyCount = rateCheck.Count ?? 0;
    if (hourlyCount >= MAX_HOURLY_DEMO_DEPLOYMENTS) {
      return Response.json(
        {
          error: "The anonymous demo is currently busy (limit: 10 deploys/hour across all visitors). Please try again shortly or sign in on the dashboard for dedicated capacity.",
        },
        { status: 429 },
      );
    }
  } catch (error) {
    console.warn("Demo rate limit check warning:", error);
  }

  // Record rate limit consumption item
  await dynamo.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        owner: "demo#ratelimit",
        timestamp,
        repo: fullName,
      },
    }),
  ).catch((err) => console.warn("Failed to record demo rate limit item:", err));

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
          Key: { owner: ownerKey, timestamp },
          UpdateExpression: `SET ${updateExprParts.join(", ")}`,
          ExpressionAttributeNames: exprAttrNames,
          ExpressionAttributeValues: exprAttrValues,
        }),
      );
    } catch (err) {
      console.warn("Failed to update demo deployment status in DynamoDB:", err);
    }
  };

  // 4. Immediately record the initial "analyzing" status
  try {
    await dynamo.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          owner: ownerKey,
          repo,
          timestamp,
          status: "analyzing",
          updatedAt: new Date().toISOString(),
          deployedBy: "anonymous-demo",
        },
      }),
    );
  } catch (err) {
    console.warn("Failed to create initial demo deployment record:", err);
  }

  // 5. Stage: Analyzing (Manifest inspection)
  const githubToken = process.env.DEMO_GITHUB_TOKEN || process.env.GITHUB_TOKEN || undefined;

  let manifest;
  try {
    manifest = await getRepoManifest(owner, repo, githubToken);
  } catch (error) {
    const message = error instanceof RepoManifestError && error.status === 404
      ? "Repository not found or access was denied by GitHub."
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

    const finalRecord = {
      owner: ownerKey,
      repo,
      status: "deployed",
      liveUrl: deployment.liveUrl,
      timestamp,
      deployedBy: "anonymous-demo",
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
