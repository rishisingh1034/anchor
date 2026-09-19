import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { z } from "zod";

import { bedrock } from "@/lib/aws/clients";
import type { RepoManifest } from "@/lib/github/repo";

export type ProjectType = "static-frontend" | "unsupported";

export interface Classification {
  type: ProjectType;
  reason: string;
  suggestedStack: string[];
  buildCommand: string;
  buildOutputDir: string;
}

const classificationSchema = z.object({
  type: z.enum(["static-frontend", "unsupported"]),
  reason: z.string().min(1),
  suggestedStack: z.array(z.string()).max(10),
  buildCommand: z.string(),
  buildOutputDir: z.string(),
});

function frontendSignals(manifest: RepoManifest) {
  const packageJson = manifest.packageJson;
  const dependencies = Object.keys({ ...packageJson?.dependencies, ...packageJson?.devDependencies });
  const scripts = packageJson?.scripts ?? {};
  const frontendDependencies = ["vite", "react", "react-dom", "vue", "@angular/core", "svelte", "astro", "gatsby", "react-scripts"];
  return {
    hasFrontendDependency: dependencies.some((name) => frontendDependencies.includes(name)),
    hasBuildScript: typeof scripts.build === "string",
  };
}

function clearlyBackendOnly(manifest: RepoManifest): Classification | null {
  const { hasFrontendDependency, hasBuildScript } = frontendSignals(manifest);
  const noFrontendSignal = !manifest.hasStaticIndexHtml && !hasFrontendDependency;
  if (manifest.hasRequirementsTxt && noFrontendSignal) {
    return { type: "unsupported", reason: "This repository appears to be a Python/backend-only project with no static frontend build output.", suggestedStack: [], buildCommand: "", buildOutputDir: "" };
  }
  if (noFrontendSignal && (!manifest.hasPackageJson || !hasBuildScript)) {
    return { type: "unsupported", reason: "This repository has no recognizable static frontend entry point or build script.", suggestedStack: [], buildCommand: "", buildOutputDir: "" };
  }
  return null;
}

function buildPrompt(manifest: RepoManifest) {
  const summary = {
    files: { packageJson: manifest.hasPackageJson, dockerfile: manifest.hasDockerfile, requirementsTxt: manifest.hasRequirementsTxt, indexHtml: manifest.hasStaticIndexHtml },
    packageJson: manifest.packageJson ?? null,
  };
  return `You classify repositories for a deployment product that ONLY supports static frontend sites hosted on S3 and CloudFront.\n\nAnalyze this compact repository manifest:\n${JSON.stringify(summary)}\n\nReturn ONLY a JSON object with exactly this shape:\n{"type":"static-frontend"|"unsupported","reason":"string","suggestedStack":["string"],"buildCommand":"string","buildOutputDir":"string"}\n\nRules:\n- For static sites with no build step (e.g. plain HTML/CSS), set buildCommand to "" and buildOutputDir to ".".\n- For frontend framework sites (React, Vue, Vite, Next static, etc.), set buildCommand to the npm command (e.g. "npm run build") and buildOutputDir to the output directory (e.g. "dist", "build", or "out").\n- Choose unsupported for backend-only, server-rendered, API, Docker-only, or ambiguous repositories.\n- For unsupported, set buildCommand and buildOutputDir to empty strings.\n- Do not suggest Lambda, API Gateway, or any backend deployment.`;
}

function extractJson(text: string): unknown {
  const withoutFences = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model response did not contain a JSON object.");
  try { return JSON.parse(withoutFences.slice(start, end + 1)); }
  catch { return JSON.parse(text); }
}

export async function classifyRepo(
  manifest: RepoManifest,
): Promise<Classification> {
  const earlyClassification = clearlyBackendOnly(manifest);
  if (earlyClassification) return earlyClassification;

  if (manifest.hasStaticIndexHtml && !manifest.hasPackageJson) {
    return {
      type: "static-frontend",
      reason: "Plain static HTML/CSS/JS repository with root index.html (no build step required).",
      suggestedStack: ["HTML", "S3", "CloudFront"],
      buildCommand: "",
      buildOutputDir: ".",
    };
  }

  const modelId = process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";

  let responseText: string;
  try {
    const response = await bedrock.send(new ConverseCommand({
      modelId,
      messages: [{ role: "user", content: [{ text: buildPrompt(manifest) }] }],
      inferenceConfig: { temperature: 0, maxTokens: 500 },
    }));
    const messageContent = response.output?.message?.content;
    responseText = messageContent?.[0]?.text ?? "";
  } catch (error) {
    throw new Error(`Bedrock classification request failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const result = classificationSchema.safeParse(extractJson(responseText));
  if (!result.success) throw new Error(`Bedrock returned JSON that does not match the deployment classification schema: ${result.error.message}`);
  return result.data;
}
