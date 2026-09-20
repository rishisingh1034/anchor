"use client";

import { useEffect, useState } from "react";
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
  isDnsReady: boolean = true,
): "done" | "active" | "failed" | "pending" {
  if (currentStatus === "failed") {
    if (failedStage === stepId) return "failed";
    const failedIndex = DEPLOY_STEPS.findIndex((s) => s.id === failedStage);
    const stepIndex = DEPLOY_STEPS.findIndex((s) => s.id === stepId);
    if (failedIndex !== -1 && stepIndex < failedIndex) return "done";
    return "pending";
  }

  if (currentStatus === "deployed") {
    if (stepId === "deployed") {
      return isDnsReady ? "done" : "active";
    }
    return "done";
  }

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
  const [isDnsReady, setIsDnsReady] = useState(false);
  const [dnsSeconds, setDnsSeconds] = useState(0);

  useEffect(() => {
    if (!liveUrl) {
      setIsDnsReady(false);
      setDnsSeconds(0);
      return;
    }

    let isMounted = true;
    let timer: NodeJS.Timeout | null = null;
    let probeTimer: NodeJS.Timeout | null = null;

    setIsDnsReady(false);
    setDnsSeconds(0);

    const checkDns = async () => {
      // 1. Try server-side DNS resolution endpoint
      try {
        const res = await fetch(`/api/dns-check?url=${encodeURIComponent(liveUrl)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { ready?: boolean };
          if (data.ready && isMounted) {
            setIsDnsReady(true);
            if (probeTimer) clearInterval(probeTimer);
            return;
          }
        }
      } catch {
        // Fallback to client probe
      }

      // 2. Try direct client fetch (resolves when DNS is ready and TCP/TLS handshake succeeds)
      try {
        await fetch(`${liveUrl}?_probe=${Date.now()}`, {
          mode: "no-cors",
          cache: "no-store",
        });
        if (isMounted) {
          setIsDnsReady(true);
          if (probeTimer) clearInterval(probeTimer);
        }
      } catch {
        // DNS still propagating (NXDOMAIN)
      }
    };

    // Initial check and periodic polling every 2.5s
    checkDns();
    probeTimer = setInterval(checkDns, 2500);

    timer = setInterval(() => {
      setDnsSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
      if (probeTimer) clearInterval(probeTimer);
    };
  }, [liveUrl]);

  if (!currentDeployStage) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-6 space-y-5 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          {isDeploying || (currentDeployStage === "deployed" && !isDnsReady) ? (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
            </span>
          ) : currentDeployStage === "deployed" ? (
            <span className="h-3 w-3 rounded-full bg-emerald-400" />
          ) : (
            <span className="h-3 w-3 rounded-full bg-red-400" />
          )}
          <h3 className="text-sm font-semibold text-white tracking-tight">
            {isDeploying
              ? "Real-time Deployment Pipeline"
              : currentDeployStage === "deployed" && !isDnsReady
              ? "Warming CloudFront Edge DNS…"
              : currentDeployStage === "deployed"
              ? "Deployment Verified & Live"
              : "Deployment Halted"}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-md">
            {repository}
          </span>
          {onDismiss && !isDeploying && isDnsReady && (
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
          const state = getStepState(step.id, currentDeployStage, failedStage, isDnsReady);
          return (
            <div
              key={step.id}
              className={`flex items-start gap-3.5 rounded-lg p-2.5 transition-all ${
                state === "active"
                  ? step.id === "deployed"
                    ? "bg-amber-500/10 border border-amber-500/30"
                    : "bg-indigo-500/10 border border-indigo-500/30"
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
                  <div
                    className={`h-5 w-5 rounded-full border-2 border-t-transparent animate-spin ${
                      step.id === "deployed" ? "border-amber-400" : "border-indigo-400"
                    }`}
                  />
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
                        ? step.id === "deployed"
                          ? "text-amber-200 font-semibold"
                          : "text-indigo-200 font-semibold"
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
                    <span
                      className={`text-[10px] font-mono animate-pulse ${
                        step.id === "deployed" ? "text-amber-400" : "text-indigo-400"
                      }`}
                    >
                      {step.id === "deployed" ? "Warming DNS…" : "In Progress…"}
                    </span>
                  )}
                  {state === "done" && (
                    <span className="text-[10px] text-emerald-400/80 font-mono">
                      Done
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  {step.id === "deployed" && !isDnsReady && currentDeployStage === "deployed"
                    ? "Propagating DNS across CloudFront edge locations before opening site"
                    : step.description}
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

      {/* Success / Warming Result Box with DNS Resolution Health-Check */}
      {liveUrl && (
        <div
          className={`rounded-xl border p-5 mt-4 space-y-4 transition-all duration-300 ${
            isDnsReady
              ? "border-emerald-500/40 bg-emerald-950/30 shadow-lg shadow-emerald-950/40"
              : "border-amber-500/40 bg-amber-950/20 shadow-lg shadow-amber-950/30"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold">
                {isDnsReady ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-emerald-400">Verified Active on CloudFront Edge CDN</span>
                  </>
                ) : (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                    <span className="text-amber-300">
                      Propagating Global DNS (~{Math.max(0, 45 - dnsSeconds)}s remaining)…
                    </span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-mono text-white break-all">
                  {liveUrl}
                </span>
                {!isDnsReady && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/80 border border-amber-700/60 px-2.5 py-0.5 text-xs font-medium text-amber-300 font-mono animate-pulse">
                    <span>Probing edge resolvers ({dnsSeconds}s)</span>
                  </span>
                )}
                {costEstimate && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-900/50 border border-emerald-700/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 font-mono">
                    Est. ~{costEstimate.formattedMonthlyCost}/month (low-traffic estimate)
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-1.5">
              {isDnsReady ? (
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold bg-emerald-500 text-zinc-950 hover:bg-emerald-400 active:scale-[0.98] shadow-md transition"
                >
                  <span>Visit Live Site</span>
                  <span>&rarr;</span>
                </a>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <button
                    disabled
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-wait shadow-sm"
                  >
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
                    <span>Warming Edge DNS ({dnsSeconds}s)…</span>
                  </button>
                  <a
                    href={liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-zinc-400 hover:text-zinc-200 underline font-mono"
                    title="Bypass probe check and open URL directly"
                  >
                    Open anyway &rarr;
                  </a>
                </div>
              )}
            </div>
          </div>

          {!isDnsReady && (
            <div className="rounded-lg border border-amber-800/40 bg-zinc-950/70 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-200 font-medium flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                  <span>CloudFront distribution provisioned — warming global edge DNS</span>
                </span>
                <span className="text-[11px] font-mono text-amber-400/80">{dnsSeconds}s elapsed</span>
              </div>
              <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full transition-all duration-1000 ease-out"
                  style={{ width: `${Math.min(100, Math.max(10, (dnsSeconds / 45) * 100))}%` }}
                />
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Brand-new CloudFront distributions take ~30–60s for global DNS resolvers to propagate. This card probes resolution continuously and turns green automatically the second the edge answers.
              </p>
            </div>
          )}

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
              <strong>Edge CDN Status:</strong> {isDnsReady ? "Global DNS active and verified." : "Resolving edge DNS routes in the background..."}
            </span>
          </p>
        </div>
      )}

      {/* General Failure Message */}
      {currentDeployStage === "failed" && deploymentError && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/50 p-4 text-xs font-mono text-red-200 flex items-start gap-2.5">
          <span className="text-red-400 font-bold text-sm leading-none">⚠️</span>
          <div className="flex-1">
            <span className="font-semibold block text-red-300 mb-0.5">Deployment Notice:</span>
            <span>{deploymentError}</span>
          </div>
        </div>
      )}
    </div>
  );
}
