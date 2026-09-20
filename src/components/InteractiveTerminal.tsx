"use client";

import { useState } from "react";

export function InteractiveTerminal() {
  const [activeTab, setActiveTab] = useState<"curl" | "github" | "cli">("curl");
  const [copied, setCopied] = useState(false);

  const snippets = {
    curl: `curl -X POST https://anchor.aws/api/demo/deploy \\
  -H "Content-Type: application/json" \\
  -d '{"repo": "gabrielecirulli/2048"}'`,
    github: `name: Deploy to Anchor AWS
on: [push]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Anchor Deploy
        run: |
          curl -X POST \${{ secrets.ANCHOR_API_URL }}/api/deploy \\
            -H "Authorization: Bearer \${{ secrets.ANCHOR_TOKEN }}" \\
            -d '{"owner":"\${{ github.repository_owner }}","repo":"\${{ github.event.repository.name }}"}'`,
    cli: `# Deploy any public repo instantly with zero AWS config
npx anchor deploy facebook/react --region us-east-1

# Output:
# [1/5] Analyzing repository with Amazon Bedrock... (Vite + React)
# [2/5] Compiling production build container...
# [3/5] Uploading artifacts to isolated private S3 bucket...
# [4/5] Provisioning CloudFront OAC distribution...
# [5/5] Live URL: https://d28k7uli2muqwt.cloudfront.net`,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6 sm:p-8 backdrop-blur-md shadow-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-0.5 text-xs font-semibold text-indigo-300 mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
              Developer API & CLI
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Deploy from any terminal, CI/CD, or webhook
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Anchor provides a clean RESTful interface that bridges GitHub repositories directly to AWS infrastructure.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab("curl")}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                activeTab === "curl"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              cURL API
            </button>
            <button
              onClick={() => setActiveTab("github")}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                activeTab === "github"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              GitHub Action
            </button>
            <button
              onClick={() => setActiveTab("cli")}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                activeTab === "cli"
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              CLI Simulation
            </button>
          </div>
        </div>

        <div className="relative rounded-2xl border border-zinc-800/90 bg-zinc-950 overflow-hidden font-mono text-xs shadow-inner">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/60">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500/80 inline-block" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/80 inline-block" />
              <span className="h-3 w-3 rounded-full bg-green-500/80 inline-block" />
              <span className="text-[11px] text-zinc-500 ml-2">
                {activeTab === "curl" ? "bash — curl" : activeTab === "github" ? ".github/workflows/deploy.yml" : "terminal — npx"}
              </span>
            </div>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 text-[11px] font-sans font-medium px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
            >
              {copied ? (
                <>
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span className="text-emerald-300">Copied!</span>
                </>
              ) : (
                <>
                  <span>📋</span>
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-5 overflow-x-auto text-zinc-300 leading-relaxed text-[12px] selection:bg-indigo-600">
            <code>{snippets[activeTab]}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
