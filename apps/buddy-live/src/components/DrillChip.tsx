"use client";

import { cn } from "@/lib/utils";

interface DrillChipProps {
  drillId: string | null;
  hint?: string | null;
  recording: boolean;
  /** Overrides the default "Up next" / "Now capturing" headline. */
  headline?: string | null;
}

const DRILL_LABEL: Record<string, string> = {
  wristshot: "Wristshot",
  snapshot: "Snapshot",
  slapshot: "Slapshot",
  slapshot_form: "Slapshot",
  backhand: "Backhand",
  skating: "Skating Stride",
};

export function DrillChip({ drillId, hint, recording, headline }: DrillChipProps) {
  if (!drillId) return null;
  const label = DRILL_LABEL[drillId] ?? drillId;
  const topLine = headline ?? (recording ? "Now capturing" : "Up next");
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-white shadow-xl backdrop-blur",
        recording && "ring-2 ring-red-500/80",
        !recording && headline === "Rep armed" && "ring-2 ring-emerald-500/50",
      )}
    >
      <div className="text-xs uppercase tracking-widest text-zinc-400">{topLine}</div>
      <div className="text-xl font-semibold">{label}</div>
      {hint && <div className="mt-1 text-sm text-zinc-300">{hint}</div>}
    </div>
  );
}
