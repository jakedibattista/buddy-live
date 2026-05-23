"use client";

import { cn, formatScore, humanMetric } from "@/lib/utils";
import type { RepDoc } from "@/lib/types";

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
      return "Analyzing";
    case "completed":
      return "Done";
    case "failed":
    case "analyze_error":
      return "Failed";
    case "stub_queued":
      return "Queued (stub)";
    default:
      return rep.status ?? "Pending";
  }
}

export function RepScorecard({ rep }: Props) {
  const metrics = extractMetrics(rep);
  const entries = Object.entries(metrics).sort((a, b) => a[1] - b[1]);
  const weakest = entries[0];
  const strongest = entries[entries.length - 1];
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4 text-white shadow-xl backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-zinc-400">
            {rep.drill_id ?? "rep"}
          </div>
          <div className="font-mono text-sm text-zinc-300">{rep.rep_id}</div>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold",
            rep.status === "completed" && "bg-emerald-500/20 text-emerald-300",
            rep.status === "analyzing" && "bg-yellow-500/20 text-yellow-200 animate-pulse",
            rep.status === "failed" && "bg-red-500/20 text-red-300",
            !["completed", "analyzing", "failed"].includes(rep.status ?? "") &&
              "bg-white/10 text-zinc-200",
          )}
        >
          {statusLabel(rep)}
        </span>
      </div>
      {entries.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between">
              <span className="capitalize text-zinc-400">{humanMetric(k)}</span>
              <span
                className={cn(
                  "font-mono",
                  v >= 7 ? "text-emerald-400" : v >= 5 ? "text-yellow-300" : "text-red-400",
                )}
              >
                {formatScore(v)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        rep.status === "analyzing" && (
          <div className="mt-3 text-xs text-zinc-400">
            Cooking the scorecard… typically 30–90 seconds.
          </div>
        )
      )}
      {weakest && strongest && entries.length > 1 && (
        <div className="mt-3 border-t border-white/10 pt-2 text-xs text-zinc-300">
          Focus: <span className="capitalize text-red-300">{humanMetric(weakest[0])}</span>. Loved
          your <span className="capitalize text-emerald-300">{humanMetric(strongest[0])}</span>.
        </div>
      )}
    </div>
  );
}
