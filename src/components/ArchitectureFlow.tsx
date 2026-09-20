"use client";

import { useState } from "react";

export function ArchitectureFlow() {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      number: "01",
      title: "Amazon Bedrock Analysis",
      subtitle: "AI Framework & Manifest Classifier",
      icon: "🧠",
      tag: "LLM Reasoning",
      color: "from-purple-500/20 to-indigo-500/10 border-purple-500/40 text-purple-300",
      description:
        "Anchor reads package.json, vite.config.ts, svelte.config.js, or index.html directly from GitHub API and invokes Amazon Bedrock (Claude 3.5 Sonnet / Nova Lite) to determine framework type, build script, output directory, and required runtime environment.",
      awsServices: ["Amazon Bedrock", "GitHub REST API", "DynamoDB Status Stream"],
      codeSnippet: `// Bedrock prompt inference
const response = await bedrockClient.invokeModel({
  modelId: "amazon.nova-lite-v1:0",
  body: JSON.stringify({
    messages: [{ role: "user", content: manifestSummary }]
  })
});
// Result: { framework: "Vite + React", buildCmd: "npm run build", outDir: "dist" }`,
    },
    {
      number: "02",
      title: "Ephemeral Container Build",
      subtitle: "Secure Isolation & Asset Generation",
      icon: "⚡",
      tag: "Zero-Vulnerability Sandbox",
      color: "from-cyan-500/20 to-blue-500/10 border-cyan-500/40 text-cyan-300",
      description:
        "Dependencies are cached and built in a strictly sandboxed container with Node.js 20 runtime. Build artifacts (HTML, JS bundles, CSS, images) are packaged and verified before S3 upload.",
      awsServices: ["AWS Amplify Web Compute", "Ephemeral Storage", "IAM Least-Privilege"],
      codeSnippet: `// Containerized build execution
const buildResult = await executeSandboxBuild({
  repoZip: await fetchRepoTarball(owner, repo),
  installCmd: "npm install --prefer-offline",
  buildCmd: classification.buildCommand
});
// Captured output size: 726.6 KB`,
    },
    {
      number: "03",
      title: "Private S3 & OAC Isolation",
      subtitle: "Zero Public Buckets • Strict IAM",
      icon: "🛡️",
      tag: "Enterprise Security",
      color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/40 text-emerald-300",
      description:
        "A dedicated Amazon S3 bucket is provisioned with all public access strictly blocked. CloudFront Origin Access Control (OAC) with SigV4 authentication is configured so only verified edge CDN requests can read bucket assets.",
      awsServices: ["Amazon S3", "Origin Access Control (OAC)", "AWS SigV4 Authentication"],
      codeSnippet: `// S3 Bucket Policy with OAC Restriction
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::anchor-site-xyz/*",
    "Condition": {
      "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::137068239266:distribution/E123" }
    }
  }]
}`,
    },
    {
      number: "04",
      title: "Global CloudFront Edge CDN",
      subtitle: "Sub-50ms Latency Across 600+ PoPs",
      icon: "🌐",
      tag: "Global Edge",
      color: "from-amber-500/20 to-orange-500/10 border-amber-500/40 text-amber-300",
      description:
        "CloudFront distribution provisions globally with HTTPS certificates, Gzip/Brotli compression, cache optimization, and custom 404 SPA fallback handling, routing directly to the nearest edge resolver worldwide.",
      awsServices: ["Amazon CloudFront", "Edge DNS", "ACM SSL/TLS", "Route 53 Global"],
      codeSnippet: `// CloudFront Distribution
const distribution = await cloudfrontClient.createDistribution({
  Origins: [{ DomainName: s3BucketDomain, OriginAccessControlId: oacId }],
  DefaultCacheBehavior: { ViewerProtocolPolicy: "redirect-to-https", Compress: true },
  CustomErrorResponses: [{ ErrorCode: 404, ResponsePagePath: "/index.html", ResponseCode: "200" }]
});
// Live URL: https://d28k7uli2muqwt.cloudfront.net`,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/30 p-6 sm:p-10 backdrop-blur-sm space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-0.5 text-xs font-semibold text-indigo-300 mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
              Under The Hood
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Production AWS Architecture Flow
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
              Inspect how Anchor transforms raw GitHub repositories into hardened, globally distributed AWS infrastructure in seconds.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-400 bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-xl">
              4-Stage Pipeline
            </span>
          </div>
        </div>

        {/* Step Selector Pills */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {steps.map((step, idx) => (
            <button
              key={step.number}
              onClick={() => setActiveStep(idx)}
              className={`flex flex-col items-start p-4 rounded-2xl border text-left transition-all ${
                activeStep === idx
                  ? `border-indigo-500/80 bg-zinc-900 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/30`
                  : "border-zinc-800/80 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/40"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <span className="text-base">{step.icon}</span>
                <span className="text-[11px] font-mono text-zinc-500 font-bold">{step.number}</span>
              </div>
              <span className="text-xs font-bold text-white tracking-tight">{step.title}</span>
              <span className="text-[10px] text-zinc-500 mt-0.5 truncate w-full">{step.subtitle}</span>
            </button>
          ))}
        </div>

        {/* Active Step Deep-Dive Card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl p-2.5 rounded-xl bg-zinc-900 border border-zinc-800">
                {steps[activeStep].icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {steps[activeStep].title}
                  </h3>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-zinc-900 ${steps[activeStep].color}`}>
                    {steps[activeStep].tag}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">{steps[activeStep].subtitle}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {steps[activeStep].awsServices.map((srv) => (
                <span
                  key={srv}
                  className="text-[10px] font-mono text-zinc-300 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-md"
                >
                  {srv}
                </span>
              ))}
            </div>
          </div>

          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            {steps[activeStep].description}
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
              <span>AWS SDK / Architecture Implementation</span>
              <span>Node.js 20 • AWS SDK v3</span>
            </div>
            <pre className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/90 overflow-x-auto text-xs font-mono text-indigo-200/90 leading-relaxed">
              <code>{steps[activeStep].codeSnippet}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
