"use client";

import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { estimateMonthlyCost, formatBytes, type CostEstimate } from "@/lib/cost/estimate";

interface DeploymentItem {
  owner: string;
  repo: string;
  status: string;
  liveUrl: string;
  timestamp: string;
  totalSizeBytes?: number;
  estimatedMonthlyCostUsd?: number;
  costBreakdown?: CostEstimate;
}

interface StepInfo {
  id: string;
  label: string;
  description: string;
}

const DEPLOY_STEPS: StepInfo[] = [
  { id: "analyzing", label: "Inspect Repository", description: "Fetching manifests and repository tree via GitHub API" },
  { id: "classifying", label: "Analyze Architecture", description: "Detecting framework and build parameters with Amazon Bedrock" },
  { id: "installing", label: "Install Dependencies", description: "Running npm install with cached devDependencies" },
  { id: "building", label: "Build Static Assets", description: "Executing production build command" },
  { id: "uploading", label: "Upload to S3", description: "Provisioning private S3 bucket and uploading build artifacts" },
  { id: "provisioning_cloudfront", label: "Configure CloudFront CDN", description: "Attaching Origin Access Control and global edge distribution" },
  { id: "deployed", label: "Live Deployment", description: "Static site deployed and reachable globally via HTTPS" },
];

function getStepState(
  stepId: string,
  currentStatus: string,
  failedStage: string,
): "done" | "active" | "failed" | "pending" {
  if (currentStatus === "failed") {
    if (failedStage === stepId) return "failed";
    // If failed in a later step, prior steps were completed
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

function DashboardContent() {
  const { data: session, status } = useSession();
  const [repository, setRepository] = useState("");
  const [result, setResult] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [canDeploy, setCanDeploy] = useState(false);

  // Real-time deployment pipeline state
  const [isDeploying, setIsDeploying] = useState(false);
  const [currentDeployStage, setCurrentDeployStage] = useState<string>("");
  const [failedStage, setFailedStage] = useState<string>("");
  const [deploymentError, setDeploymentError] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

  const [deployments, setDeployments] = useState<DeploymentItem[]>([]);
  const [isLoadingDeployments, setIsLoadingDeployments] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  async function fetchDeployments() {
    setIsLoadingDeployments(true);
    try {
      const res = await fetch("/api/deployments");
      if (res.ok) {
        const data = (await res.json()) as { deployments?: DeploymentItem[] };
        if (Array.isArray(data.deployments)) {
          setDeployments(data.deployments);
        }
      }
    } catch {
      // Non-blocking
    } finally {
      setIsLoadingDeployments(false);
    }
  }

  useEffect(() => {
    if (session) {
      fetchDeployments();
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [session]);

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [owner, repo, ...extra] = repository.trim().split("/");
    if (!owner || !repo || extra.length > 0) {
      setResult(JSON.stringify({ error: "Enter a repository as owner/repo (e.g. facebook/react)." }, null, 2));
      return;
    }
    setIsAnalyzing(true);
    setResult("");
    setCanDeploy(false);
    setLiveUrl("");
    setCostEstimate(null);
    setShowCostBreakdown(false);
    setDeploymentError("");
    setCurrentDeployStage("");
    setFailedStage("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });
      const data: unknown = await response.json();
      setResult(JSON.stringify(data, null, 2));
      setCanDeploy(response.ok);
    } catch {
      setResult(JSON.stringify({ error: "Could not reach the analyze endpoint." }, null, 2));
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleDeploy() {
    const [owner, repo] = repository.trim().split("/");
    if (!owner || !repo) return;

    const startedAt = new Date().toISOString();
    setIsDeploying(true);
    setCurrentDeployStage("analyzing");
    setFailedStage("");
    setDeploymentError("");
    setLiveUrl("");
    setCostEstimate(null);
    setShowCostBreakdown(false);

    // Clear any previous interval
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    const startTime = Date.now();

    // Start real-time DynamoDB status polling every 1 second
    pollIntervalRef.current = setInterval(async () => {
      try {
        const statusRes = await fetch(
          `/api/deploy/status?owner=${encodeURIComponent(owner)}&timestamp=${encodeURIComponent(startedAt)}`,
          { cache: "no-store" },
        );
        if (statusRes.ok) {
          const statusData = (await statusRes.json()) as {
            status?: string;
            liveUrl?: string;
            errorMessage?: string;
            failedStage?: string;
            totalSizeBytes?: number;
            estimatedMonthlyCostUsd?: number;
            costBreakdown?: CostEstimate;
          };

          if (statusData.status && statusData.status !== "pending") {
            setCurrentDeployStage(statusData.status);

            if (statusData.status === "deployed") {
              if (statusData.liveUrl) setLiveUrl(statusData.liveUrl);
              if (statusData.costBreakdown) {
                setCostEstimate(statusData.costBreakdown);
              } else if (typeof statusData.totalSizeBytes === "number") {
                setCostEstimate(estimateMonthlyCost(statusData.totalSizeBytes));
              }
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              setIsDeploying(false);
              fetchDeployments();
            } else if (statusData.status === "failed") {
              if (statusData.failedStage) setFailedStage(statusData.failedStage);
              if (statusData.errorMessage) setDeploymentError(statusData.errorMessage);
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              setIsDeploying(false);
            }
          }
        }
      } catch {
        // Non-blocking poll attempt
      }

      // Safety timeout: 2 minutes max
      if (Date.now() - startTime > 120_000) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        setIsDeploying(false);
        setDeploymentError("Deployment process timed out. Check deployment history below.");
      }
    }, 1000);

    // Concurrently trigger server-side deploy pipeline
    try {
      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, startedAt }),
      });

      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object" || !("liveUrl" in data) || typeof data.liveUrl !== "string") {
        const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
          ? data.error
          : "Deployment failed.";
        const stage = data && typeof data === "object" && "stage" in data && typeof data.stage === "string"
          ? data.stage
          : "deploy";

        setDeploymentError(message);
        setFailedStage(stage);
        setCurrentDeployStage("failed");
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        return;
      }

      setLiveUrl(data.liveUrl);
      if ("costBreakdown" in data && data.costBreakdown) {
        setCostEstimate(data.costBreakdown as CostEstimate);
      } else if ("totalSizeBytes" in data && typeof data.totalSizeBytes === "number") {
        setCostEstimate(estimateMonthlyCost(data.totalSizeBytes));
      }
      setCurrentDeployStage("deployed");
      fetchDeployments();
    } catch {
      setDeploymentError("Could not reach the deploy endpoint.");
      setCurrentDeployStage("failed");
    } finally {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      setIsDeploying(false);
    }
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <div className="flex items-center gap-3 text-zinc-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
          <span>Loading session…</span>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-white">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center shadow-xl backdrop-blur">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Anchor Dashboard</h1>
            <p className="text-sm text-zinc-400">Connect your GitHub account to analyze and deploy repositories.</p>
          </div>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
            onClick={() => signIn("github")}
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            Sign in with GitHub
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Top Navigation */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/50 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              Anchor
            </span>
            <span className="rounded-full bg-emerald-950 px-2.5 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-800/50">
              AWS Engine
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-zinc-400">
              {session.user?.name ?? session.user?.email ?? "GitHub User"}
            </span>
            <button
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-zinc-700 hover:text-white"
              onClick={() => signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8 space-y-10">
        {/* Deploy Form Section */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Deploy a Repository</h2>
            <p className="text-sm text-zinc-400">Enter a public GitHub repository to analyze with Bedrock and provision to AWS S3 & CloudFront.</p>
          </div>

          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleAnalyze}>
            <label className="sr-only" htmlFor="repository">
              GitHub repository
            </label>
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-3.5 flex items-center text-zinc-500 text-sm">
                github.com/
              </span>
              <input
                className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950 pl-28 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-white focus:outline-none"
                id="repository"
                onChange={(e) => setRepository(e.target.value)}
                placeholder="owner/repo"
                required
                value={repository}
              />
            </div>
            <button
              className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
              disabled={isAnalyzing || isDeploying}
            >
              {isAnalyzing ? "Analyzing…" : "Analyze"}
            </button>
          </form>

          {/* Quick Demo Repos */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="text-zinc-500 font-medium">Demo Allow-list:</span>
            {[
              "asprooo/mon-portfolio",
              "SafdarJamal/vite-template-react",
              "sveltejs/template",
            ].map((demoRepo) => (
              <button
                key={demoRepo}
                type="button"
                onClick={() => setRepository(demoRepo)}
                disabled={isDeploying}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50"
              >
                {demoRepo}
              </button>
            ))}
          </div>

          {canDeploy && !isDeploying && !currentDeployStage && (
            <div className="flex items-center gap-3 pt-2">
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                onClick={handleDeploy}
              >
                Deploy to AWS &rarr;
              </button>
            </div>
          )}

          {/* Real-time Step-by-Step Progress Pipeline */}
          {Boolean(currentDeployStage) && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
                <div className="flex items-center gap-2.5">
                  {isDeploying ? (
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
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
                <span className="text-xs font-mono text-zinc-500">
                  {repository}
                </span>
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
          )}

          {/* Analysis JSON viewer */}
          {result && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-300">Analysis Result (Bedrock)</h3>
              <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-300">
                {result}
              </pre>
            </div>
          )}
        </section>

        {/* Deployments History List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Deployment History</h2>
            <button
              className="text-xs text-zinc-400 hover:text-white transition"
              disabled={isLoadingDeployments}
              onClick={fetchDeployments}
            >
              {isLoadingDeployments ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {isLoadingDeployments && deployments.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/20 p-8 text-center text-sm text-zinc-500">
              Loading deployment history…
            </div>
          ) : deployments.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/20 p-8 text-center text-sm text-zinc-500">
              No deployments recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/80 rounded-2xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
              {deployments.map((item, idx) => (
                <div
                  key={`${item.owner}-${item.repo}-${item.timestamp || idx}`}
                  className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between hover:bg-zinc-900/50 transition"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-sm text-white">
                        {item.owner}/{item.repo}
                      </p>
                      {typeof item.estimatedMonthlyCostUsd === "number" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/80 border border-emerald-800/50 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                          <span>Est. ~${item.estimatedMonthlyCostUsd < 0.01 ? "<0.01" : item.estimatedMonthlyCostUsd.toFixed(2)}/mo</span>
                          {item.totalSizeBytes ? <span className="text-emerald-500">({formatBytes(item.totalSizeBytes)})</span> : null}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500">
                      {item.timestamp ? new Date(item.timestamp).toLocaleString() : "Recent"}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        item.status === "deployed"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          item.status === "deployed" ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
                        }`}
                      />
                      {item.status}
                    </span>
                    {item.liveUrl ? (
                      <a
                        className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 underline font-mono"
                        href={item.liveUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Visit Site &rarr;
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function Dashboard() {
  return (
    <SessionProvider>
      <DashboardContent />
    </SessionProvider>
  );
}
