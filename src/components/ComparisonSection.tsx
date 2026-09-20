"use client";

export function ComparisonSection() {
  const rows = [
    {
      feature: "Infrastructure Setup",
      traditional: "300+ lines Terraform / CloudFormation, manual VPCs, IAM policies, ACM certs",
      anchor: "1-click automatic detection & zero-config provisioning",
      anchorBetter: true,
    },
    {
      feature: "Framework Detection",
      traditional: "Manual build scripts, directory path configs, build matrix maintenance",
      anchor: "Amazon Bedrock AI inspects manifests and configures optimal parameters",
      anchorBetter: true,
    },
    {
      feature: "S3 & Security Isolation",
      traditional: "Common risk of public bucket misconfiguration and IAM privilege creep",
      anchor: "100% private S3 buckets locked with Origin Access Control (OAC) + SigV4",
      anchorBetter: true,
    },
    {
      feature: "Global CDN Delivery",
      traditional: "Manual CloudFront distribution setup, cache behaviors, custom 404 SPAs",
      anchor: "Pre-configured global edge CDN with automated compression & SSL",
      anchorBetter: true,
    },
    {
      feature: "Cost Model",
      traditional: "Fixed monthly NAT gateway / compute overhead ($30–$70/mo base)",
      anchor: "Pure serverless pay-per-request model (fractions of a cent per site)",
      anchorBetter: true,
    },
    {
      feature: "Deployment Velocity",
      traditional: "10–25 minutes for stack templates and manual DNS verification",
      anchor: "~20 seconds build & push with live DNS warming health-checks",
      anchorBetter: true,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/30 p-6 sm:p-10 backdrop-blur-sm space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-0.5 text-xs font-semibold text-indigo-300">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            Comparison Matrix
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Why Anchor on AWS?
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400">
            All the simplicity and developer experience of modern PaaS platforms, directly deployed onto your own AWS infrastructure.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-950/60 shadow-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/80">
                <th className="p-4 font-semibold text-zinc-300 w-1/4">Capability</th>
                <th className="p-4 font-semibold text-zinc-400 w-3/8">Traditional AWS Setup</th>
                <th className="p-4 font-semibold text-emerald-300 w-3/8 bg-emerald-950/20 border-l border-emerald-900/30">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">⚓</span>
                    <span>Anchor Deployment Engine</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-zinc-900/30 transition">
                  <td className="p-4 font-medium text-white">{row.feature}</td>
                  <td className="p-4 text-zinc-400 leading-relaxed">{row.traditional}</td>
                  <td className="p-4 text-emerald-200 font-medium bg-emerald-950/10 border-l border-emerald-900/20 leading-relaxed">
                    <span className="mr-1.5 text-emerald-400">✓</span>
                    {row.anchor}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
