import type { SessionPhase } from "@/lib/types";

const PHASE_LABELS: Record<SessionPhase, string> = {
  warmup: "Warm-up",
  stance_check: "Setup check",
  drill_readiness: "Drill readiness",
  scored_reps: "Scored reps",
  recap: "Recap",
  ended: "Ended",
};

export function humanSessionPhase(phase: SessionPhase | string | undefined | null): string | null {
  if (!phase) return null;
  return PHASE_LABELS[phase as SessionPhase] ?? phase.replace(/_/g, " ");
}
