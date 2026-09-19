"use client";

import { SessionProvider, signIn, signOut, useSession } from "next-auth/react";
import { type FormEvent, useState } from "react";

function DashboardContent() {
  const { data: session, status } = useSession();
  const [repository, setRepository] = useState("");
  const [result, setResult] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [canDeploy, setCanDeploy] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [liveUrl, setLiveUrl] = useState("");
  const [deploymentError, setDeploymentError] = useState("");

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [owner, repo, ...extra] = repository.trim().split("/");
    if (!owner || !repo || extra.length > 0) {
      setResult(JSON.stringify({ error: "Enter a repository as owner/repo." }, null, 2));
      return;
    }
    setIsAnalyzing(true); setResult(""); setCanDeploy(false); setLiveUrl(""); setDeploymentError("");
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner, repo }) });
      const data: unknown = await response.json();
      setResult(JSON.stringify(data, null, 2));
      setCanDeploy(response.ok);
    } catch {
      setResult(JSON.stringify({ error: "Could not reach the analyze endpoint." }, null, 2));
    } finally { setIsAnalyzing(false); }
  }

  async function handleDeploy() {
    const [owner, repo] = repository.trim().split("/");
    setIsDeploying(true); setDeploymentError(""); setLiveUrl("");
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
    } catch {
      setDeploymentError("Could not reach the deploy endpoint.");
    } finally { setIsDeploying(false); }
  }

  if (status === "loading") return <main className="p-8">Loading session…</main>;
  if (!session) return <main className="p-8"><h1 className="text-2xl font-semibold">Anchor dashboard</h1><button className="mt-4 rounded bg-black px-4 py-2 text-white" onClick={() => signIn("github")}>Sign in with GitHub</button></main>;

  return (
    <main className="p-8">
      <div className="flex items-center gap-4"><h1 className="text-2xl font-semibold">Anchor dashboard</h1><button className="rounded border px-3 py-1" onClick={() => signOut()}>Sign out</button></div>
      <p className="mt-2">Signed in as {session.user?.name ?? session.user?.email ?? "GitHub user"}.</p>
      <form className="mt-6 flex gap-2" onSubmit={handleAnalyze}>
        <label className="sr-only" htmlFor="repository">GitHub repository</label>
        <input className="rounded border px-3 py-2" id="repository" onChange={(event) => setRepository(event.target.value)} placeholder="owner/repo" required value={repository} />
        <button className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" disabled={isAnalyzing}>{isAnalyzing ? "Analyzing…" : "Analyze"}</button>
      </form>
      {canDeploy && <button className="mt-4 rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-50" disabled={isDeploying} onClick={handleDeploy}>{isDeploying ? "Deploying…" : "Deploy"}</button>}
      {deploymentError && <p className="mt-4 text-red-700">{deploymentError}</p>}
      {liveUrl && <p className="mt-4">Deployment is provisioning at <a className="underline" href={liveUrl} rel="noreferrer" target="_blank">{liveUrl}</a></p>}
      {result && <pre className="mt-6 overflow-auto rounded bg-zinc-100 p-4 text-sm">{result}</pre>}
    </main>
  );
}

export default function DashboardPage() {
  return <SessionProvider><DashboardContent /></SessionProvider>;
}
