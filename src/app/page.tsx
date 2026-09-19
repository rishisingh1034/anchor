import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-white">
      <div className="max-w-2xl space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-4 py-1.5 text-xs font-medium text-zinc-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Vercel for AWS
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl bg-gradient-to-b from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
          Anchor
        </h1>
        <p className="text-lg text-zinc-400 sm:text-xl">
          Deploy any GitHub repo straight to AWS — auto-detected, auto-provisioned.
        </p>
        <div className="pt-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
          >
            Get Started &rarr;
          </Link>
        </div>
      </div>
    </main>
  );
}
