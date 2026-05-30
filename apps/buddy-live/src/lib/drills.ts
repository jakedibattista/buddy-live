import type { DrillId } from "@/lib/types";

/**
 * Canonical drill ids for modelforpuckbuddy `/api/analyze-video`.
 * Voice/agent uses user-facing names ("slapshot"); map here before analyze.
 * Keep in sync with `services/buddy-live-adk/app/tools/rep_capture._normalize_drill`.
 */
const DRILL_ID_MAP: Record<string, DrillId> = {
  wristshot: "wristshot",
  wrist_shot: "wristshot",
  slapshot: "slapshot_form",
  slap: "slapshot_form",
  slapshot_form: "slapshot_form",
  backhand: "backhand",
};

export function normalizeDrillId(drillId: string): DrillId {
  const key = (drillId || "").toLowerCase().trim();
  return DRILL_ID_MAP[key] ?? "wristshot";
}
