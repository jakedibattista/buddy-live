import Link from "next/link";
import type { FocusDrill } from "@/lib/types";

interface DrillCard {
  drill: FocusDrill;
  title: string;
  tagline: string;
  cue: string;
}

const DRILL_CARDS: DrillCard[] = [
  {
    drill: "wristshot",
    title: "Wristshot",
    tagline: "Quick release, accuracy",
    cue: "Knees bent, puck in the pocket, snap the top hand.",
  },
  {
    drill: "slapshot",
    title: "Slapshot",
    tagline: "Power from the stick flex",
    cue: "Load the stick into the ice, transfer weight through the puck.",
  },
  {
    drill: "backhand",
    title: "Backhand",
    tagline: "Sneaky finish under the glove",
    cue: "Puck off the back heel, follow through up and across.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center gap-12 px-6 py-16">
      <div className="text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-zinc-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Live
        </div>
        <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">
          Buddy <span className="text-emerald-400">Live</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-lg text-zinc-300">
          Pick a shot. Coach Buddy watches your reps through the webcam, breaks them down in
          the background, and tells you exactly what to fix.
        </p>
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
        {DRILL_CARDS.map((card) => (
          <DrillSelectCard key={card.drill} card={card} />
        ))}
      </div>

      <Link
        href="/coach/demo"
        className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10"
      >
        Watch the scripted demo
      </Link>

      <footer className="text-xs text-zinc-500">
        Hackathon build · Google ADK + Gemini · ElevenLabs · Firebase
      </footer>
    </main>
  );
}

function DrillSelectCard({ card }: { card: DrillCard }) {
  return (
    <Link
      href={`/coach?drill=${card.drill}`}
      className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-emerald-400/40 hover:bg-emerald-500/[0.06]"
    >
      <div>
        <div className="text-xs uppercase tracking-widest text-emerald-400">{card.tagline}</div>
        <div className="mt-1 text-2xl font-semibold text-white">{card.title}</div>
      </div>
      <p className="text-sm text-zinc-300">{card.cue}</p>
      <div className="mt-auto pt-3 text-sm font-medium text-emerald-300 opacity-80 group-hover:opacity-100">
        Start {card.title.toLowerCase()} session →
      </div>
    </Link>
  );
}
