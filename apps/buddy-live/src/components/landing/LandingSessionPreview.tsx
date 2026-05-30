import Image from "next/image";
import type { CSSProperties } from "react";

const SCORE_METRICS = [
  { label: "Wrist snap", value: 8.2 },
  { label: "Follow through", value: 7.6 },
  { label: "Weight transfer", value: 5.8 },
  { label: "Front knee bend", value: 7.1 },
];

function MiniRinkDiagram() {
  return (
    <svg viewBox="0 0 100 56" className="h-full w-full" aria-hidden>
      <rect x="1" y="1" width="98" height="54" rx="6" fill="#fbfcfd" stroke="#94a3b8" strokeWidth="0.8" />
      <line x1="8" y1="10" x2="92" y2="10" stroke="#ef4444" strokeWidth="0.7" />
      <line x1="1" y1="42" x2="99" y2="42" stroke="#2563eb" strokeWidth="1.1" />
      <circle cx="50" cy="10" r="4" fill="#eff6ff" stroke="#2563eb" strokeWidth="0.8" />
      <circle cx="72" cy="28" r="3.5" fill="#fef2f2" stroke="#dc2626" strokeWidth="0.9" />
      <circle cx="38" cy="24" r="3" fill="#eff6ff" stroke="#2563eb" strokeWidth="0.9" />
      <line x1="38" y1="24" x2="50" y2="14" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  );
}

export function LandingSessionPreview() {
  return (
    <div
      className="landing-preview relative mx-auto grid w-full gap-3 lg:grid-cols-2 lg:gap-4"
      aria-hidden
    >
      <div className="landing-preview-frame overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="relative aspect-[4/3] bg-black">
          <video
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            poster="/landing/demo-rep-poster.jpg"
          >
            <source src="/landing/demo-rep.webm" type="video/webm" />
            <source src="/landing/demo-rep.mp4" type="video/mp4" />
          </video>

          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30" />

          <div className="absolute left-4 top-4 flex items-center gap-2">
            <span className="rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
              Rec
            </span>
            <span className="font-mono text-xs tabular-nums text-white/80">0:42</span>
          </div>

          <div className="absolute bottom-4 left-4 rounded-full bg-black/50 px-3 py-1 text-xs text-zinc-300 backdrop-blur-sm">
            Slapshot
          </div>

          <div className="absolute bottom-3 left-3 opacity-90 sm:bottom-4 sm:left-4">
            <div className="animate-puck-hover motion-reduce:animate-none">
              <Image
                src="/mascot/coach-puck.png"
                alt=""
                width={128}
                height={128}
                className="h-12 w-12 object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)] sm:h-14 sm:w-14"
              />
            </div>
          </div>

          <div className="absolute inset-y-0 right-0 flex w-[42%] flex-col border-l border-white/[0.06] bg-black/55 p-3 backdrop-blur-md sm:w-[38%] sm:p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand">
                  Slapshot
                </span>
                <div className="mt-0.5 text-[9px] text-zinc-500 sm:text-[10px]">Scored rep</div>
              </div>
              <span className="badge-brand shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide sm:text-[10px]">
                Scored
              </span>
            </div>

            <div className="mt-2 rounded-lg border border-white/[0.06] bg-zinc-900/50 px-2 py-1 font-mono text-[10px] font-bold text-brand sm:text-xs">
              Avg 7.2
            </div>

            <div className="mt-2 flex-1 space-y-2 overflow-hidden">
              {SCORE_METRICS.map((metric, index) => (
                <div key={metric.label}>
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 sm:text-[11px]">
                    <span className="truncate pr-2">{metric.label}</span>
                    <span className="shrink-0 font-mono tabular-nums text-zinc-200">
                      {metric.value.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-800/80">
                    <div
                      className="landing-preview-bar h-full rounded-full bg-[var(--brand-blue)]"
                      style={
                        {
                          "--bar-width": `${metric.value * 10}%`,
                          animationDelay: `${index * 0.35}s`,
                        } as CSSProperties
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-2 text-[10px] leading-snug text-zinc-400 sm:text-[11px]">
              <p>
                <span className="text-zinc-300">Strongest:</span> Wrist snap{" "}
                <span className="font-mono text-brand">8.2</span>
              </p>
              <p>
                <span className="text-zinc-300">Focus:</span> Weight transfer{" "}
                <span className="font-mono text-brand">5.8</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/90 p-4 text-left text-white shadow-[0_16px_48px_rgba(0,0,0,0.4)] sm:p-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Hockey IQ practice
        </div>
        <div className="mt-2 overflow-hidden rounded-xl border-4 border-zinc-400/80 bg-[#fbfcfd] shadow-lg">
          <div className="h-28 sm:h-32">
            <MiniRinkDiagram />
          </div>
        </div>
        <p className="mt-3 text-sm font-medium leading-snug text-white/90 sm:text-base">
          Breakaway. The goalie is way out. Do you shoot fast, or skate around them?
        </p>
        <div className="mt-3 flex flex-col gap-1.5 text-sm">
          {["Shoot fast", "Skate around"].map((option, i) => (
            <div
              key={option}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-zinc-200"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">
                {String.fromCharCode(65 + i)}
              </span>
              <span className="font-medium">{option}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
