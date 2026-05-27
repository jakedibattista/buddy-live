import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-between px-6 py-20 text-center bg-black">
      {/* Spacer to push content down to center */}
      <div />

      <div className="flex flex-col items-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/40 px-3.5 py-1 text-xs font-semibold tracking-widest text-zinc-400 uppercase">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Live
        </div>
        
        <h1 className="text-6xl font-semibold tracking-tight text-white sm:text-8xl select-none">
          Buddy <span className="text-zinc-500">Live.</span>
        </h1>
        
        <p className="mx-auto mt-6 max-w-lg text-balance text-lg sm:text-xl font-light leading-relaxed text-zinc-400">
          Real-time hockey coaching, through your webcam. Talk to Coach Buddy and we&apos;ll sharpen your reads and reps together.
        </p>

        <div className="mt-10">
          <Link
            href="/coach"
            className="group relative inline-flex items-center gap-3 rounded-full bg-white px-8 py-4 text-base font-semibold text-black transition-all hover:bg-zinc-200 hover:scale-[1.01] active:scale-[0.99] shadow-md"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-950/30" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-zinc-950" />
            </span>
            Talk to Coach Buddy
          </Link>
        </div>
      </div>

      <footer className="text-[11px] font-medium uppercase tracking-widest text-zinc-600 select-none">
        Hackathon build · Google ADK + Gemini · ElevenLabs · Firebase
      </footer>
    </main>
  );
}
