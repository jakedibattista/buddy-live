import { Award, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const SCORE_METRICS = [
  { label: "Wrist snap", value: 8.2, tone: "strong" as const },
  { label: "Follow through", value: 7.6, tone: "mid" as const },
  { label: "Weight transfer", value: 5.8, tone: "weak" as const },
  { label: "Front knee bend", value: 7.1, tone: "mid" as const },
];

function metricBarClass(value: number) {
  if (value >= 7) return "bg-emerald-500";
  if (value >= 5) return "bg-amber-400";
  return "bg-red-500";
}

function metricTextClass(value: number) {
  if (value >= 7) return "text-emerald-400";
  if (value >= 5) return "text-amber-300";
  return "text-red-400";
}

function MiniRinkDiagram() {
  return (
    <svg viewBox="0 0 100 56" className="h-full w-full" aria-hidden>
      <rect x="1" y="1" width="98" height="54" rx="6" fill="#fbfcfd" stroke="#94a3b8" strokeWidth="0.8" />
      <line x1="8" y1="10" x2="92" y2="10" stroke="#ef4444" strokeWidth="0.7" />
      <line x1="1" y1="42" x2="99" y2="42" stroke="#2563eb" strokeWidth="1.1" />
      <circle cx="50" cy="10" r="4" fill="#eff6ff" stroke="#2563eb" strokeWidth="0.8" />
      <circle cx="72" cy="28" r="3.5" fill="#fef2f2" stroke="#dc2626" strokeWidth="0.9" />
      <circle cx="38" cy="24" r="3" fill="#eff6ff" stroke="#2563eb" strokeWidth="0.9" />
      <line
        x1="38"
        y1="24"
        x2="50"
        y2="14"
        stroke="#1e293b"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
    </svg>
  );
}

export function LandingSessionPreview() {
  return (
    <div
      className="landing-preview relative mx-auto grid w-full gap-3 lg:grid-cols-2 lg:gap-4"
      aria-hidden
    >
      {/* Shooting path — matches in-session RepScorecard */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/90 p-4 text-left text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-5">
        <div className="flex items-start justify-between border-b border-zinc-800/50 pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-brand">
              Wristshot
            </span>
            <div className="mt-0.5 text-[10px] text-zinc-500">After your scored rep</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-mono text-xs font-bold text-emerald-400">
              Avg: 7.2
            </div>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
              Scored
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          {SCORE_METRICS.map(({ label, value, tone }) => (
            <div
              key={label}
              className={cn(
                "flex flex-col gap-1 rounded-lg border bg-zinc-900/30 p-2",
                tone === "weak" && "border-red-500/10 bg-red-500/[0.02]",
                tone === "strong" && "border-emerald-500/10 bg-emerald-500/[0.02]",
                tone === "mid" && "border-transparent",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "truncate font-medium capitalize",
                    tone === "weak" && "text-red-300/90",
                    tone === "strong" && "text-emerald-300/90",
                    tone === "mid" && "text-zinc-400",
                  )}
                >
                  {label}
                </span>
                <span className={cn("font-mono font-bold", metricTextClass(value))}>
                  {value.toFixed(1)}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-zinc-800/60">
                <div
                  className={cn("h-full rounded-full", metricBarClass(value))}
                  style={{ width: `${Math.min(100, value * 10)}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-2 border-t border-zinc-800/50 pt-3">
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.02] p-2.5 text-xs">
            <Award className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <span className="font-semibold text-emerald-300">Strongest cue:</span>{" "}
              <span className="text-zinc-200">Wrist snap</span>
              <span className="font-mono font-bold text-emerald-400"> (8.2)</span>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-red-500/10 bg-red-500/[0.02] p-2.5 text-xs">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div>
              <span className="font-semibold text-red-300">Focus area:</span>{" "}
              <span className="text-zinc-200">Weight transfer</span>
              <span className="font-mono font-bold text-red-400"> (5.8)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hockey IQ path — matches in-session IqVisualCard */}
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
          Breakaway — the goalie is way out. Do you shoot fast, or skate around them?
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
