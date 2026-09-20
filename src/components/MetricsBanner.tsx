"use client";

export function MetricsBanner() {
  const metrics = [
    {
      value: "< 25s",
      label: "Average Deploy Time",
      desc: "Containerized builds & S3 sync",
      badge: "Fast",
      badgeColor: "text-cyan-400 bg-cyan-950/60 border-cyan-800/40",
    },
    {
      value: "600+",
      label: "CloudFront Edge PoPs",
      desc: "Worldwide sub-50ms latency",
      badge: "Global",
      badgeColor: "text-indigo-400 bg-indigo-950/60 border-indigo-800/40",
    },
    {
      value: "100%",
      label: "Origin Access Control",
      desc: "Zero public S3 buckets",
      badge: "Secure",
      badgeColor: "text-emerald-400 bg-emerald-950/60 border-emerald-800/40",
    },
    {
      value: "$0.00",
      label: "Base Idle Cost",
      desc: "Pay only for requests & storage",
      badge: "Cost Efficient",
      badgeColor: "text-amber-400 bg-amber-950/60 border-amber-800/40",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 max-w-6xl mx-auto px-6 py-6">
      {metrics.map((item) => (
        <div
          key={item.label}
          className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-5 backdrop-blur-sm transition-all hover:border-zinc-700 hover:bg-zinc-900/50 hover:shadow-lg hover:shadow-indigo-500/5"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-2xl sm:text-3xl font-black tracking-tight text-white font-mono">
              {item.value}
            </span>
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${item.badgeColor}`}>
              {item.badge}
            </span>
          </div>
          <div className="text-xs font-semibold text-zinc-200">{item.label}</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">{item.desc}</div>
        </div>
      ))}
    </div>
  );
}
