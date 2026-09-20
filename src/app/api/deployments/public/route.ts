import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo } from "@/lib/aws/clients";
import { estimateMonthlyCost } from "@/lib/cost/estimate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface PublicDeploymentRecord {
  owner: string;
  repo: string;
  status: string;
  liveUrl: string;
  timestamp: string;
  totalSizeBytes?: number;
  estimatedMonthlyCostUsd?: number;
}

export async function GET() {
  const tableName = process.env.DEPLOYMENTS_TABLE || "deployments";

  try {
    const result = await dynamo.send(new ScanCommand({ TableName: tableName }));
    const rawItems = (result.Items ?? []) as Record<string, unknown>[];

    // Filter and sanitize: non-sensitive public fields only
    const deployments: PublicDeploymentRecord[] = rawItems
      .filter((item) => item.status === "deployed" && typeof item.liveUrl === "string" && item.liveUrl.length > 0 && !String(item.owner).startsWith("user#"))
      .map((item) => {
        const totalSizeBytes = typeof item.totalSizeBytes === "number" ? item.totalSizeBytes : undefined;
        let estimatedMonthlyCostUsd = typeof item.estimatedMonthlyCostUsd === "number" ? item.estimatedMonthlyCostUsd : undefined;
        if (typeof totalSizeBytes === "number" && !estimatedMonthlyCostUsd) {
          estimatedMonthlyCostUsd = estimateMonthlyCost(totalSizeBytes).totalMonthlyCostUsd;
        }
        return {
          owner: String(item.owner || "unknown"),
          repo: String(item.repo || "unknown"),
          status: String(item.status || "deployed"),
          liveUrl: String(item.liveUrl),
          timestamp: String(item.timestamp || new Date().toISOString()),
          totalSizeBytes,
          estimatedMonthlyCostUsd,
        };
      })
      // Deduplicate by repo if multiple deployments of the same repo exist, keeping newest
      .reduce<PublicDeploymentRecord[]>((acc, current) => {
        const existingIndex = acc.findIndex((item) => item.owner === current.owner && item.repo === current.repo);
        if (existingIndex === -1) {
          acc.push(current);
        } else if (new Date(current.timestamp).getTime() > new Date(acc[existingIndex].timestamp).getTime()) {
          acc[existingIndex] = current;
        }
        return acc;
      }, [])
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return Response.json(
      { deployments },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        deployments: [],
        error: error instanceof Error ? error.message : "Failed to load public deployments",
      },
      { status: 500 },
    );
  }
}
