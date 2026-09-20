import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { NextRequest } from "next/server";

import { dynamo } from "@/lib/aws/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const timestamp = searchParams.get("timestamp");

  if (!owner || !timestamp) {
    return Response.json(
      { error: "Query parameters 'owner' and 'timestamp' are required." },
      { status: 400 },
    );
  }

  const tableName = process.env.DEPLOYMENTS_TABLE || "deployments";

  try {
    const result = await dynamo.send(
      new GetCommand({
        TableName: tableName,
        Key: { owner, timestamp },
      }),
    );

    const item = result.Item;
    if (!item) {
      return Response.json({ status: "pending" }, { status: 200 });
    }

    return Response.json(
      {
        status: String(item.status || "pending"),
        liveUrl: item.liveUrl ? String(item.liveUrl) : undefined,
        errorMessage: item.errorMessage ? String(item.errorMessage) : undefined,
        failedStage: item.failedStage ? String(item.failedStage) : undefined,
        repo: item.repo ? String(item.repo) : undefined,
        updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
        totalSizeBytes: typeof item.totalSizeBytes === "number" ? item.totalSizeBytes : undefined,
        estimatedMonthlyCostUsd: typeof item.estimatedMonthlyCostUsd === "number" ? item.estimatedMonthlyCostUsd : undefined,
        costBreakdown: item.costBreakdown ? item.costBreakdown : undefined,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        status: "unknown",
        error: error instanceof Error ? error.message : "Failed to fetch deployment status",
      },
      { status: 500 },
    );
  }
}
