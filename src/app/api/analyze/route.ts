import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getRepoManifest, RepoManifestError } from "@/lib/github/repo";

const analyzeRequestSchema = z.object({
  owner: z.string().trim().min(1, "Repository owner is required.").max(100),
  repo: z.string().trim().min(1, "Repository name is required.").max(100),
});

export async function POST(request: NextRequest) {
  const sessionToken = await getToken({ req: request, secret: authOptions.secret });
  const token = sessionToken?.githubAccessToken;
  if (!token) return Response.json({ error: "Sign in with GitHub to analyze a repository." }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }

  const parsedRequest = analyzeRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return Response.json(
      { error: "Provide a valid repository owner and name.", details: parsedRequest.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const manifest = await getRepoManifest(parsedRequest.data.owner, parsedRequest.data.repo, token);
    return Response.json(manifest);
  } catch (error) {
    if (error instanceof RepoManifestError) {
      const status = error.status === 404 ? 404 : 502;
      const message = error.status === 404 ? "Repository not found or you do not have access to it." : error.message;
      return Response.json({ error: message }, { status });
    }
    return Response.json({ error: "Repository analysis failed unexpectedly." }, { status: 500 });
  }
}
