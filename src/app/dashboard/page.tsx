"use client";

import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";
import { type FormEvent, useEffect, useState } from "react";

interface DeploymentItem {
  owner: string;
  repo: string;
  status: string;
  liveUrl: string;
  timestamp: string;
}

function DashboardContent() {
  const { data: session, status } = useSession();
  const [repository, setRepository] = useState("");
  const [result, setResult] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [canDeploy, setCanDeploy] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [liveUrl, setLiveUrl] = useState("");
  const [deploymentError, setDeploymentError] = useState("");
  const [deployments, setDeployments] = useState<DeploymentItem[]>([]);
  const [isLoadingDeployments, setIsLoadingDeployments] = useState(false);

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
    setDeploymentError("");
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
    setIsDeploying(true);
    setDeploymentError("");
    setLiveUrl("");
    try {
      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object" || !("liveUrl" in data) || typeof data.liveUrl !== "string") {
        const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
          ? data.error : "Deployment failed.";
        setDeploymentError(message);
        return;
      }
      setLiveUrl(data.liveUrl);
      fetchDeployments();
    } catch {
      setDeploymentError("Could not reach the deploy endpoint.");
    } finally {
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
      <header className="border-b border-zinc-800/80 bg-zinc-900/50 backdrop-blur">
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
            <p className="text-sm text-zinc-400">Enter a public or private GitHub repository to analyze and deploy.</p>
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
              disabled={isAnalyzing}
            >
              {isAnalyzing ? "Analyzing…" : "Analyze"}
            </button>
          </form>

          {canDeploy && (
            <div className="flex items-center gap-3 pt-2">
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                disabled={isDeploying}
                onClick={handleDeploy}
              >
                {isDeploying ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-white" />
                    Deploying to AWS (S3 + CloudFront)…
                  </>
                ) : (
                  "Deploy to AWS"
                )}
              </button>
            </div>
          )}

          {deploymentError && (
            <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-300">
              {deploymentError}
            </div>
          )}

          {liveUrl && (
            <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/40 p-4 text-sm text-emerald-300 flex items-center justify-between">
              <div>
                <span className="font-semibold">Live deployment provisioned:</span>{" "}
                <a className="underline font-mono" href={liveUrl} rel="noreferrer" target="_blank">
                  {liveUrl}
                </a>
              </div>
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                Open &rarr;
              </a>
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Analysis Manifest</span>
              <pre className="overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs font-mono text-zinc-300">
                {result}
              </pre>
            </div>
          )}
        </section>

        {/* Deployment History Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Deployment History</h2>
              <p className="text-sm text-zinc-400">Past deployments provisioned to AWS.</p>
            </div>
            <button
              onClick={fetchDeployments}
              className="text-xs text-zinc-400 hover:text-white transition flex items-center gap-1.5"
            >
              <span>↻ Refresh</span>
            </button>
          </div>

          {isLoadingDeployments && deployments.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-500">Loading deployment history…</div>
          ) : deployments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
              No deployments yet. Enter a repository above to deploy your first site.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase text-zinc-400">
                  <tr>
                    <th className="px-6 py-3.5">Repository</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Live URL</th>
                    <th className="px-6 py-3.5">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {deployments.map((d, index) => (
                    <tr key={`${d.owner}/${d.repo}-${d.timestamp}-${index}`} className="hover:bg-zinc-800/30 transition">
                      <td className="px-6 py-4 font-medium text-white">
                        <span className="text-zinc-400">{d.owner}/</span>{d.repo}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950 px-2.5 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-800/40">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          {d.status || "deployed"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {d.liveUrl ? (
                          <a
                            href={d.liveUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-sky-400 hover:text-sky-300 underline"
                          >
                            {d.liveUrl}
                          </a>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-zinc-400">
                        {d.timestamp ? new Date(d.timestamp).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <SessionProvider>
      <DashboardContent />
    </SessionProvider>
  );
}

