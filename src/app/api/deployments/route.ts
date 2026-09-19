import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

import { dynamo } from "@/lib/aws/clients";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

export interface DeploymentRecord {
  owner: string;
  repo: string;
  status: string;
  liveUrl: string;
  timestamp: string;
}

export async function GET(request: NextRequest) {
  const sessionToken = await getToken({ req: request, secret: authOptions.secret });
  if (!sessionToken?.githubAccessToken) {
    return Response.json({ error: "Sign in with GitHub to view deployments." }, { status: 401 });
  }

  const tableName = process.env.DEPLOYMENTS_TABLE || "deployments";
  try {
    const result = await dynamo.send(new ScanCommand({ TableName: tableName }));
    const items = (result.Items ?? []) as DeploymentRecord[];
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return Response.json({ deployments: items });
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch deployments: ${error instanceof Error ? error.message : "unknown error"}` },
      { status: 500 },
    );
  }
}
