import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-6 py-16 text-center">
      <div>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-zinc-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Live
        </div>
        <h1 className="text-6xl font-semibold tracking-tight sm:text-8xl">
          Buddy <span className="text-emerald-400">Live</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-zinc-300">
          Real-time hockey coaching, through your webcam. Talk to Coach Buddy
          and we&apos;ll pick a drill together.
        </p>
      </div>

      <Link
        href="/coach"
        className="group relative inline-flex items-center gap-3 rounded-full bg-emerald-500 px-10 py-5 text-lg font-semibold text-zinc-950 shadow-[0_0_60px_-10px_rgba(16,185,129,0.6)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-950/40" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-zinc-950" />
        </span>
        Talk to Coach Buddy
      </Link>

      <Link
        href="/coach/demo"
        className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/10"
      >
        Watch the scripted demo
      </Link>

      <footer className="mt-4 text-xs text-zinc-500">
        Hackathon build · Google ADK + Gemini · ElevenLabs · Firebase
      </footer>
    </main>
  );
}
