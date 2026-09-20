"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatBytes, estimateMonthlyCost, type CostEstimate } from "@/lib/cost/estimate";
import { DeployProgress } from "@/components/DeployProgress";

interface PublicDeployment {
  owner: string;
  repo: string;
  status: string;
  liveUrl: string;
  timestamp: string;
  totalSizeBytes?: number;
  estimatedMonthlyCostUsd?: number;
}

const DEMO_CARDS = [
  {
    repo: "sveltejs/template",
    title: "Svelte 4 App",
    description: "Rollup bundle with HTML/JS/CSS assets",
    tag: "Svelte + Rollup",
    badgeColor: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    buttonLabel: "Deploy Svelte Demo",
  },
  {
    repo: "SafdarJamal/vite-template-react",
    title: "Vite + React SPA",
    description: "Modern Single Page App with fast build pipeline",
    tag: "Vite + React",
    badgeColor: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
    buttonLabel: "Deploy React Demo",
  },
  {
    repo: "asprooo/mon-portfolio",
    title: "Developer Portfolio",
    description: "Clean responsive static HTML5 showcase",
    tag: "Static HTML",
    badgeColor: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    buttonLabel: "Deploy Portfolio Demo",
  },
];

function getStackBadge(repo: string) {
  const lower = repo.toLowerCase();
  if (lower.includes("vite") || lower.includes("react")) {
    return { label: "Vite + React", color: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" };
  }
  if (lower.includes("svelte")) {
    return { label: "Svelte + Rollup", color: "border-orange-500/30 bg-orange-500/10 text-orange-300" };
  }
  if (lower.includes("portfolio") || lower.includes("html")) {
    return { label: "Static HTML/CSS", color: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" };
  }
  return { label: "Static Site", color: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300" };
}

function formatDate(isoString: string) {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Recent";
  }
}

export default function Home() {
  const [deployments, setDeployments] = useState<PublicDeployment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Anonymous demo deployment state
  const [activeDemoRepo, setActiveDemoRepo] = useState<string>("");
  const [isDemoDeploying, setIsDemoDeploying] = useState<boolean>(false);
  const [demoStage, setDemoStage] = useState<string>("");
  const [demoFailedStage, setDemoFailedStage] = useState<string>("");
  const [demoError, setDemoError] = useState<string>("");
  const [demoLiveUrl, setDemoLiveUrl] = useState<string>("");
  const [demoCostEstimate, setDemoCostEstimate] = useState<CostEstimate | null>(null);

  const demoPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  async function loadPublicDeployments() {
    try {
      const res = await fetch("/api/deployments/public");
      if (res.ok) {
        const data = (await res.json()) as { deployments?: PublicDeployment[] };
        if (Array.isArray(data.deployments)) {
          setDeployments(data.deployments);
        }
      }
    } catch {
      // Fallback gracefully
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPublicDeployments();
    return () => {
      if (demoPollIntervalRef.current) clearInterval(demoPollIntervalRef.current);
    };
  }, []);

  async function handleTriggerDemo(repo: string) {
    if (isDemoDeploying) return;
    const startedAt = new Date().toISOString();
    setActiveDemoRepo(repo);
    setIsDemoDeploying(true);
    setDemoStage("analyzing");
    setDemoFailedStage("");
    setDemoError("");
    setDemoLiveUrl("");
    setDemoCostEstimate(null);

    if (demoPollIntervalRef.current) clearInterval(demoPollIntervalRef.current);

    const startTime = Date.now();
    const pollOwnerKey = `demo#${repo}`;

    demoPollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/deploy/status?owner=${encodeURIComponent(pollOwnerKey)}&timestamp=${encodeURIComponent(startedAt)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            status?: string;
            liveUrl?: string;
            errorMessage?: string;
            failedStage?: string;
            totalSizeBytes?: number;
            estimatedMonthlyCostUsd?: number;
            costBreakdown?: CostEstimate;
          };

          if (data.status && data.status !== "pending") {
            setDemoStage(data.status);
            if (data.status === "deployed") {
              if (data.liveUrl) setDemoLiveUrl(data.liveUrl);
              if (data.costBreakdown) {
                setDemoCostEstimate(data.costBreakdown);
              } else if (typeof data.totalSizeBytes === "number") {
                setDemoCostEstimate(estimateMonthlyCost(data.totalSizeBytes));
              }
              if (demoPollIntervalRef.current) clearInterval(demoPollIntervalRef.current);
              setIsDemoDeploying(false);
              loadPublicDeployments();
            } else if (data.status === "failed") {
              if (data.failedStage) setDemoFailedStage(data.failedStage);
              if (data.errorMessage) setDemoError(data.errorMessage);
              if (demoPollIntervalRef.current) clearInterval(demoPollIntervalRef.current);
              setIsDemoDeploying(false);
            }
          }
        }
      } catch {
        // Non-blocking poll
      }

      if (Date.now() - startTime > 120_000) {
        if (demoPollIntervalRef.current) clearInterval(demoPollIntervalRef.current);
        setIsDemoDeploying(false);
        setDemoError("Demo deployment timed out. Please try again.");
      }
    }, 1000);

    try {
      const response = await fetch("/api/demo/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, startedAt }),
      });

      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object" || !("liveUrl" in data) || typeof data.liveUrl !== "string") {
        const msg =
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "Demo deployment failed.";
        const stage =
          data && typeof data === "object" && "stage" in data && typeof data.stage === "string"
            ? data.stage
            : "deploy";

        setDemoError(msg);
        setDemoFailedStage(stage);
        setDemoStage("failed");
        if (demoPollIntervalRef.current) clearInterval(demoPollIntervalRef.current);
        return;
      }

      setDemoLiveUrl(data.liveUrl);
      if ("costBreakdown" in data && data.costBreakdown) {
        setDemoCostEstimate(data.costBreakdown as CostEstimate);
      } else if ("totalSizeBytes" in data && typeof data.totalSizeBytes === "number") {
        setDemoCostEstimate(estimateMonthlyCost(data.totalSizeBytes));
      }
      setDemoStage("deployed");
      loadPublicDeployments();
    } catch {
      setDemoError("Could not reach the demo deploy endpoint.");
      setDemoStage("failed");
    } finally {
      if (demoPollIntervalRef.current) clearInterval(demoPollIntervalRef.current);
      setIsDemoDeploying(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white selection:bg-indigo-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] bg-gradient-to-tr from-indigo-600/20 via-purple-600/10 to-transparent blur-3xl opacity-70 pointer-events-none" />
      </div>

      {/* Navigation Header */}
      <header className="border-b border-zinc-900/80 bg-zinc-950/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-500/20 text-sm">
              ⚓
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Anchor
            </span>
          </div>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-4 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
          >
            Dashboard &rarr;
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-20 pb-16 px-6 text-center max-w-4xl mx-auto space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-medium text-indigo-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Serverless Deployment Engine
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent leading-[1.1]">
          Vercel simplicity, <br />
          powered directly by AWS.
        </h1>

        <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          Point to any GitHub repository. Anchor uses Amazon Bedrock to detect the framework, builds in a secure container, and provisions Amazon S3 + CloudFront edge CDN with zero manual configuration.
        </p>

        <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
          <a
            href="#try-live"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-950 shadow-lg shadow-white/10 transition hover:bg-zinc-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>Try Live Demo</span>
            <span>&darr;</span>
          </a>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-3 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
          >
            Open Dashboard &rarr;
          </Link>
          <a
            href="https://github.com/rishisingh1034/anchor"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-3 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
          >
            <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            GitHub
          </a>
        </div>
      </section>

      {/* Try It Live — No Sign-In Required Section */}
      <section id="try-live" className="max-w-6xl mx-auto px-6 py-8 scroll-mt-20">
        <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-b from-indigo-950/20 via-zinc-900/40 to-zinc-900/20 p-6 sm:p-10 backdrop-blur-md shadow-2xl relative overflow-hidden">
          {/* Subtle glow */}
          <div className="absolute top-0 right-1/4 -z-10 h-48 w-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 border-b border-zinc-800/60">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-400 mb-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                Try It Live — No Sign-In Required
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Experience the AWS Deploy Engine
              </h2>
              <p className="text-sm text-zinc-400 mt-1 max-w-xl">
                Click any allow-listed demo repository below. Anchor will inspect manifests, invoke Amazon Bedrock to determine architecture, execute the build, and provision S3 + CloudFront live.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 bg-zinc-900/80 border border-zinc-800 px-3 py-1.5 rounded-xl font-mono flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-indigo-400" />
                Live CloudFront CDN Output
              </span>
            </div>
          </div>

          {/* 3 Interactive Demo Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-8">
            {DEMO_CARDS.map((card) => {
              const isThisDeploying = isDemoDeploying && activeDemoRepo === card.repo;
              const isThisActive = activeDemoRepo === card.repo;

              return (
                <div
                  key={card.repo}
                  className={`flex flex-col justify-between rounded-2xl border p-6 transition-all ${
                    isThisActive
                      ? "border-indigo-500/60 bg-indigo-950/30 shadow-lg shadow-indigo-500/10"
                      : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/40"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${card.badgeColor}`}>
                        {card.tag}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-500">
                        {card.repo.split("/")[0]}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight">
                        {card.title}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                        {card.description}
                      </p>
                    </div>

                    <div className="pt-1 text-[11px] font-mono text-zinc-500 truncate">
                      github.com/{card.repo}
                    </div>
                  </div>

                  <div className="pt-6 mt-4 border-t border-zinc-900/80">
                    <button
                      type="button"
                      disabled={isDemoDeploying}
                      onClick={() => handleTriggerDemo(card.repo)}
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-semibold transition ${
                        isThisDeploying
                          ? "bg-indigo-600 text-white cursor-wait"
                          : isDemoDeploying
                          ? "bg-zinc-800/50 text-zinc-500 cursor-not-allowed"
                          : "bg-white text-zinc-950 hover:bg-zinc-200 active:scale-[0.98] shadow-md shadow-white/5"
                      }`}
                    >
                      {isThisDeploying ? (
                        <>
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          <span>Deploying…</span>
                        </>
                      ) : (
                        <>
                          <span>{card.buttonLabel}</span>
                          <span>&rarr;</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Real-time Progress Checklist Component for Demo */}
          {Boolean(demoStage) && (
            <div className="mt-8 pt-8 border-t border-zinc-800/80">
              <DeployProgress
                currentDeployStage={demoStage}
                isDeploying={isDemoDeploying}
                failedStage={demoFailedStage}
                deploymentError={demoError}
                liveUrl={demoLiveUrl}
                repository={activeDemoRepo}
                costEstimate={demoCostEstimate}
                onDismiss={() => {
                  setDemoStage("");
                  setActiveDemoRepo("");
                }}
              />
            </div>
          )}
        </div>
      </section>

      {/* Proof of Work / Live Deployments Section */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-8 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/60">
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Live Deployments
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                Real-world repositories auto-provisioned to AWS S3 & CloudFront Edge network.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-md font-mono">
                Proof of Work
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-zinc-500 text-sm">
              <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-white mb-2" />
              <p>Fetching live AWS deployments...</p>
            </div>
          ) : deployments.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 text-sm">
              No live deployments found yet. Be the first to deploy!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-6">
              {deployments.map((dep, idx) => {
                const badge = getStackBadge(dep.repo);
                return (
                  <div
                    key={`${dep.owner}-${dep.repo}-${idx}`}
                    className="group relative flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-950/70 p-5 transition-all hover:border-zinc-700 hover:bg-zinc-900/50 hover:shadow-xl hover:shadow-indigo-500/5"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge.color}`}>
                          {badge.label}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {formatDate(dep.timestamp)}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-semibold text-white text-base tracking-tight group-hover:text-indigo-300 transition truncate">
                          {dep.owner}/{dep.repo}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <div className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span className="text-xs text-emerald-400/90 font-medium">
                              Active on CloudFront
                            </span>
                          </div>
                          {typeof dep.estimatedMonthlyCostUsd === "number" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/80 border border-emerald-800/40 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                              <span>Est. ~${dep.estimatedMonthlyCostUsd < 0.01 ? "<0.01" : dep.estimatedMonthlyCostUsd.toFixed(2)}/mo</span>
                              {dep.totalSizeBytes ? <span className="text-emerald-500">({formatBytes(dep.totalSizeBytes)})</span> : null}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-5 mt-3 border-t border-zinc-900 flex items-center justify-between">
                      <a
                        href={dep.liveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-zinc-800/90 hover:bg-indigo-600 px-3 py-1.5 rounded-lg transition duration-150 w-full justify-center group-hover:bg-indigo-600"
                      >
                        <span>Visit Live Site</span>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Architecture Highlights */}
      <section className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-6 space-y-2">
          <div className="text-indigo-400 font-mono text-sm font-semibold">01. Bedrock Analysis</div>
          <h4 className="text-white font-semibold">AI Stack Detection</h4>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Amazon Bedrock inspects package manifests and build scripts to choose the optimal build pipeline and output directory.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-6 space-y-2">
          <div className="text-indigo-400 font-mono text-sm font-semibold">02. Automated Provisioning</div>
          <h4 className="text-white font-semibold">S3 + CloudFront OAC</h4>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Creates dedicated private S3 buckets and attaches CloudFront distributions with Origin Access Controls and HTTPS certificates.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-6 space-y-2">
          <div className="text-indigo-400 font-mono text-sm font-semibold">03. Serverless Compute</div>
          <h4 className="text-white font-semibold">AWS Amplify SSR</h4>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Anchor is self-hosted on AWS Amplify Hosting using Next.js 15 Web Compute with native IAM execution roles.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-8 text-center text-xs text-zinc-600">
        <p>Anchor — Built for the AWS Hackathon • Self-hosted on AWS Amplify</p>
      </footer>
    </div>
  );
}
