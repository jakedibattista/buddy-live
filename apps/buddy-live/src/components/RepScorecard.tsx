"use client";

import { cn, formatScore, humanMetric } from "@/lib/utils";
import type { RepDoc } from "@/lib/types";
import { Target, Award, Sparkles, AlertCircle } from "lucide-react";

interface Props {
  rep: RepDoc;
}

function extractMetrics(rep: RepDoc): Record<string, number> {
  const out: Record<string, number> = {};
  const shots = rep.results?.structured_shots ?? [];
  if (shots.length > 0) {
    const m = shots[0]?.metrics ?? {};
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === "number") out[k] = v;
    }
    return out;
  }
  const flat = rep.results?.scores ?? {};
  for (const [k, v] of Object.entries(flat)) {
    if (typeof v === "number") out[k] = v;
  }
  return out;
}

function statusLabel(rep: RepDoc): string {
  switch (rep.status) {
    case "pending_capture":
      return "Get ready";
    case "capturing":
      return "Recording…";
    case "uploaded":
      return "Uploaded";
    case "analyzing":
      return "Analyzing…";
    case "completed":
      return "Scored";
    case "failed":
    case "analyze_error":
      return "Failed";
    case "stub_queued":
      return "Queued";
    default:
      return rep.status ?? "Pending";
  }
}

export function RepScorecard({ rep }: Props) {
  const metrics = extractMetrics(rep);
  const entries = Object.entries(metrics).sort((a, b) => a[1] - b[1]);
  const weakest = entries[0];
  const strongest = entries[entries.length - 1];

  const total = entries.reduce((acc, cur) => acc + cur[1], 0);
  const avgScore = entries.length > 0 ? total / entries.length : null;

  const formattedDrill = (rep.drill_id ?? "rep")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="rounded-2xl border border-zinc-850 bg-zinc-950/90 p-5 text-white shadow-lg backdrop-blur-md transition-all duration-300 hover:border-zinc-700/50">
      {/* Top Header */}
      <div className="flex items-start justify-between pb-3 border-b border-zinc-800/50">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#2997ff]">
            {formattedDrill}
          </span>
          <div className="font-mono text-[10px] text-zinc-500 mt-0.5">
            ID: {rep.rep_id}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {rep.status === "completed" && avgScore !== null && (
            <div className={cn(
              "flex items-center justify-center rounded-lg px-2 py-1 font-mono text-xs font-bold",
              avgScore >= 7
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : avgScore >= 5
                  ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
            )}>
              Avg: {formatScore(avgScore)}
            </div>
          )}
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
              rep.status === "completed" && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
              rep.status === "analyzing" && "bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 animate-pulse",
              rep.status === "failed" && "bg-red-500/10 text-red-400 border border-red-500/20",
              !["completed", "analyzing", "failed"].includes(rep.status ?? "") &&
                "bg-zinc-800 text-zinc-300 border border-zinc-700",
            )}
          >
            {statusLabel(rep)}
          </span>
        </div>
      </div>

      {/* Metrics Section */}
      {entries.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
          {entries.map(([k, v]) => {
            const isWeakest = weakest && weakest[0] === k;
            const isStrongest = strongest && strongest[0] === k;
            return (
              <div
                key={k}
                className={cn(
                  "flex flex-col gap-1 rounded-lg bg-zinc-900/30 p-2 border transition-colors",
                  isWeakest
                    ? "border-red-500/10 bg-red-500/[0.01]"
                    : isStrongest
                      ? "border-emerald-500/10 bg-emerald-500/[0.01]"
                      : "border-transparent"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "capitalize truncate font-medium",
                    isWeakest
                      ? "text-red-300/90"
                      : isStrongest
                        ? "text-emerald-300/90"
                        : "text-zinc-400"
                  )}>
                    {humanMetric(k)}
                  </span>
                  <span
                    className={cn(
                      "font-mono font-bold",
                      v >= 7 ? "text-emerald-400" : v >= 5 ? "text-amber-300" : "text-red-400",
                    )}
                  >
                    {formatScore(v)}
                  </span>
                </div>

                {/* Modern visual bar */}
                <div className="h-1 w-full bg-zinc-800/60 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      v >= 7 ? "bg-emerald-500" : v >= 5 ? "bg-amber-400" : "bg-red-500",
                    )}
                    style={{ width: `${Math.min(100, Math.max(0, v * 10))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        rep.status === "analyzing" && (
          <div className="mt-4 py-6 text-center text-xs text-zinc-400 flex flex-col items-center justify-center gap-2">
            <div className="h-4 w-4 border-2 border-t-transparent border-yellow-400 rounded-full animate-spin" />
            <span>Analyzing your mechanics — this takes about 30–90 seconds.</span>
          </div>
        )
      )}

      {/* Strengths & Focus areas */}
      {weakest && strongest && entries.length > 1 && (
        <div className="mt-4 border-t border-zinc-800/50 pt-3 space-y-2">
          <div className="flex items-start gap-2 text-xs bg-emerald-500/[0.02] border border-emerald-500/10 p-2.5 rounded-xl">
            <Award className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-emerald-300">Strongest cue:</span>{" "}
              <span className="capitalize text-zinc-200">{humanMetric(strongest[0])}</span> (
              <span className="font-mono text-emerald-400 font-bold">{formatScore(strongest[1])}</span>)
              <p className="text-[10px] text-zinc-400 mt-0.5">Great job with your wind-up mechanics!</p>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs bg-red-500/[0.02] border border-red-500/10 p-2.5 rounded-xl">
            <Target className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-red-300">Focus area:</span>{" "}
              <span className="capitalize text-zinc-200">{humanMetric(weakest[0])}</span> (
              <span className="font-mono text-red-400 font-bold">{formatScore(weakest[1])}</span>)
              <p className="text-[10px] text-zinc-400 mt-0.5">Listen to Coach Buddy on how to improve this metric.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
