"use client";

import { useState } from "react";
import type { CostEstimate } from "@/lib/cost/estimate";

export interface StepInfo {
  id: string;
  label: string;
  description: string;
}

export const DEPLOY_STEPS: StepInfo[] = [
  { id: "analyzing", label: "Inspect Repository", description: "Fetching manifests and repository tree via GitHub API" },
  { id: "classifying", label: "Analyze Architecture", description: "Detecting framework and build parameters with Amazon Bedrock" },
  { id: "installing", label: "Install Dependencies", description: "Running npm install with cached devDependencies" },
  { id: "building", label: "Build Static Assets", description: "Executing production build command" },
  { id: "uploading", label: "Upload to S3", description: "Provisioning private S3 bucket and uploading build artifacts" },
  { id: "provisioning_cloudfront", label: "Configure CloudFront CDN", description: "Attaching Origin Access Control and global edge distribution" },
  { id: "deployed", label: "Live Deployment", description: "Static site deployed and reachable globally via HTTPS" },
];

export function getStepState(
  stepId: string,
  currentStatus: string,
  failedStage: string,
): "done" | "active" | "failed" | "pending" {
  if (currentStatus === "failed") {
    if (failedStage === stepId) return "failed";
    const failedIndex = DEPLOY_STEPS.findIndex((s) => s.id === failedStage);
    const stepIndex = DEPLOY_STEPS.findIndex((s) => s.id === stepId);
    if (failedIndex !== -1 && stepIndex < failedIndex) return "done";
    return "pending";
  }

  if (currentStatus === "deployed") return "done";

  const currentIndex = DEPLOY_STEPS.findIndex((s) => s.id === currentStatus);
  const stepIndex = DEPLOY_STEPS.findIndex((s) => s.id === stepId);

  if (currentIndex === -1) return "pending";
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

export interface DeployProgressProps {
  currentDeployStage: string;
  isDeploying: boolean;
  failedStage?: string;
  deploymentError?: string;
  liveUrl?: string;
  repository: string;
  costEstimate?: CostEstimate | null;
  onDismiss?: () => void;
}

export function DeployProgress({
  currentDeployStage,
  isDeploying,
  failedStage = "",
  deploymentError = "",
  liveUrl = "",
  repository,
  costEstimate,
  onDismiss,
}: DeployProgressProps) {
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

  if (!currentDeployStage) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-6 space-y-5 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          {isDeploying ? (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500" />
            </span>
          ) : currentDeployStage === "deployed" ? (
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
          ) : (
            <span className="h-3 w-3 rounded-full bg-red-400" />
          )}
          <h3 className="text-sm font-semibold text-white tracking-tight">
            {isDeploying
              ? "Real-time Deployment Pipeline"
              : currentDeployStage === "deployed"
              ? "Deployment Successful"
              : "Deployment Halted"}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-md">
            {repository}
          </span>
          {onDismiss && !isDeploying && (
            <button
              onClick={onDismiss}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition"
              title="Close progress card"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {DEPLOY_STEPS.map((step, idx) => {
          const state = getStepState(step.id, currentDeployStage, failedStage);
          return (
            <div
              key={step.id}
              className={`flex items-start gap-3.5 rounded-lg p-2.5 transition-all ${
                state === "active"
                  ? "bg-indigo-500/10 border border-indigo-500/30"
                  : state === "failed"
                  ? "bg-red-500/10 border border-red-500/30"
                  : state === "done"
                  ? "bg-zinc-900/30 border border-zinc-900"
                  : "opacity-40"
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {state === "done" && (
                  <div className="h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold">
                    ✓
                  </div>
                )}
                {state === "active" && (
                  <div className="h-5 w-5 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                )}
                {state === "failed" && (
                  <div className="h-5 w-5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 flex items-center justify-center text-xs font-bold">
                    ✕
                  </div>
                )}
                {state === "pending" && (
                  <div className="h-5 w-5 rounded-full border border-zinc-800 text-zinc-600 flex items-center justify-center text-[10px]">
                    {idx + 1}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`text-xs font-medium ${
                      state === "active"
                        ? "text-indigo-200 font-semibold"
                        : state === "failed"
                        ? "text-red-300 font-semibold"
                        : state === "done"
                        ? "text-zinc-200"
                        : "text-zinc-500"
                    }`}
                  >
                    {step.label}
                  </p>
                  {state === "active" && (
                    <span className="text-[10px] text-indigo-400 font-mono animate-pulse">
                      In Progress…
                    </span>
                  )}
                  {state === "done" && (
                    <span className="text-[10px] text-emerald-400/80 font-mono">
                      Done
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  {step.description}
                </p>
                {state === "failed" && deploymentError && (
                  <p className="text-xs text-red-400 mt-2 font-mono bg-red-950/60 p-2 rounded border border-red-900/60">
                    Error: {deploymentError}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Success Result Box */}
      {liveUrl && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-5 mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Provisioned on CloudFront Edge CDN
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono text-white underline hover:text-emerald-300 transition break-all"
                >
                  {liveUrl}
                </a>
                {costEstimate && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-900/50 border border-emerald-700/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 font-mono">
                    Est. ~{costEstimate.formattedMonthlyCost}/month (low-traffic estimate)
                  </span>
                )}
              </div>
            </div>
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 transition"
            >
              <span>Visit Live Site</span>
              <span>&rarr;</span>
            </a>
          </div>

          {/* Expandable Cost Breakdown */}
          {costEstimate && (
            <div className="rounded-lg border border-emerald-800/50 bg-zinc-950/70 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-xs font-medium">
                  AWS Cost Estimation Breakdown • {costEstimate.assumptions.totalSizeFormatted} total build output
                </span>
                <button
                  type="button"
                  onClick={() => setShowCostBreakdown(!showCostBreakdown)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-200 underline font-medium"
                >
                  {showCostBreakdown ? "Hide Breakdown ▲" : "View Breakdown ▼"}
                </button>
              </div>

              {showCostBreakdown && (
                <div className="pt-2 border-t border-zinc-800 space-y-2 text-[11px]">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="bg-zinc-900/80 p-2.5 rounded border border-zinc-800">
                      <span className="text-zinc-400 block text-[10px]">S3 Storage (us-east-1):</span>
                      <span className="font-mono text-white font-semibold">${costEstimate.breakdown.s3StorageUsd.toFixed(5)}/mo</span>
                      <span className="text-[10px] text-zinc-500 block mt-0.5">$0.023/GB-month</span>
                    </div>
                    <div className="bg-zinc-900/80 p-2.5 rounded border border-zinc-800">
                      <span className="text-zinc-400 block text-[10px]">CloudFront Transfer (10k visits):</span>
                      <span className="font-mono text-white font-semibold">${costEstimate.breakdown.cloudfrontTransferUsd.toFixed(4)}/mo</span>
                      <span className="text-[10px] text-zinc-500 block mt-0.5">$0.085/GB tier</span>
                    </div>
                    <div className="bg-zinc-900/80 p-2.5 rounded border border-zinc-800">
                      <span className="text-zinc-400 block text-[10px]">CloudFront HTTPS Requests:</span>
                      <span className="font-mono text-white font-semibold">${costEstimate.breakdown.cloudfrontRequestsUsd.toFixed(4)}/mo</span>
                      <span className="text-[10px] text-zinc-500 block mt-0.5">$0.0075 / 10k reqs</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-400 italic pt-1">
                    {costEstimate.assumptions.caveat}
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] text-zinc-400 border-t border-emerald-900/40 pt-2 flex items-center gap-1.5">
            <span>⚡</span>
            <span>
              <strong>DNS Propagation:</strong> Newly provisioned CloudFront URLs take ~60–90s to propagate across global DNS resolvers. If your browser shows <code className="text-zinc-300">NXDOMAIN</code> initially, wait a minute and refresh.
            </span>
          </p>
        </div>
      )}

      {/* General Failure Message */}
      {currentDeployStage === "failed" && !failedStage && deploymentError && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-xs font-mono text-red-300">
          {deploymentError}
        </div>
      )}
    </div>
  );
}
