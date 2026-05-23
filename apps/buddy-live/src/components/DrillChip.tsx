"use client";

import { cn } from "@/lib/utils";

interface DrillChipProps {
  drillId: string | null;
  hint?: string | null;
  recording: boolean;
}

const DRILL_LABEL: Record<string, string> = {
  wristshot: "Wristshot",
  snapshot: "Snapshot",
  slapshot_form: "Slapshot",
  backhand: "Backhand",
  skating: "Skating Stride",
};

export function DrillChip({ drillId, hint, recording }: DrillChipProps) {
  if (!drillId) return null;
  const label = DRILL_LABEL[drillId] ?? drillId;
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-white shadow-xl backdrop-blur",
        recording && "ring-2 ring-red-500/80",
      )}
    >
      <div className="text-xs uppercase tracking-widest text-zinc-400">
        {recording ? "Now capturing" : "Up next"}
      </div>
      <div className="text-xl font-semibold">{label}</div>
      {hint && <div className="mt-1 text-sm text-zinc-300">{hint}</div>}
    </div>
  );
}
