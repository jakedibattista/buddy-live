export type DrillId = "wristshot" | "snapshot" | "slapshot_form" | "backhand" | "skating";

export type FocusDrill = "wristshot" | "slapshot" | "backhand";

export type SessionPhase =
  | "warmup"
  | "stance_check"
  | "drill_readiness"
  | "wristshots"
  | "snapshots"
  | "skating"
  | "recap"
  | "ended";

export interface LiveSessionDoc {
  session_id: string;
  user_id: string;
  startedAt: string;
  currentPhase?: SessionPhase;
  focus_drill?: FocusDrill;
  focus_drill_set_at?: string;
  peek_url?: string;
  peek_updated_at?: string;
  last_peek_person_visible?: boolean;
  last_peek_stick_visible?: boolean;
  last_peek_full_body_in_frame?: boolean;
  last_peek_facing_camera?: boolean;
  last_peek_setup?: string;
  setup_framing_passed?: boolean;
  peek_fail_streak?: number;
  camera_hint?: string;
  peek_status_updated_at?: string;
  last_warmup_exercise?: string;
  last_warmup_form?: "good" | "adjust" | "unclear";
  last_warmup_moving?: boolean;
  last_warmup_setup?: string;
  warmup_moves_checked?: number;
  warmup_peek_updated_at?: string;
  results_ready_at?: string;
  ended_at?: string;
}

export interface RepDoc {
  rep_id: string;
  drill_id: DrillId | string;
  hint?: string;
  status:
    | "pending_capture"
    | "capturing"
    | "awaiting_clip"
    | "uploaded"
    | "analyzing"
    | "completed"
    | "failed"
    | "stub_queued"
    | "analyze_error";
  storage_path?: string;
  storage_url?: string;
  job_id?: string;
  queued_at?: string;
  created_at?: string;
  error?: string;
  results?: RepResults;
}

export interface RepResults {
  structured_shots?: Array<{
    metrics?: Record<string, number>;
    timestamp?: string;
    confidenceScore?: number;
  }>;
  scores?: Record<string, number>;
  coach_summary?: string;
  session_insights?: {
    metric_averages?: Record<string, number>;
    lowest_metric?: string;
  };
}

export interface CoachCommandBase {
  id: string;
  created_at: string;
  handled?: boolean;
}

export interface CaptureCommand extends CoachCommandBase {
  type: "start_capture" | "stop_capture";
  rep_id: string;
  drill_id: DrillId | string;
  hint?: string;
}

export interface WarmupTimerCommand extends CoachCommandBase {
  type: "start_warmup_timer";
  exercise: string;
  label: string;
  duration_seconds: number;
}

export type CoachCommand = CaptureCommand | WarmupTimerCommand;

export function parseCoachCommand(id: string, data: Record<string, unknown>): CoachCommand | null {
  const created_at = typeof data.created_at === "string" ? data.created_at : "";
  const handled = data.handled === true ? true : undefined;
  const type = data.type;

  if (type === "start_warmup_timer") {
    const exercise = typeof data.exercise === "string" ? data.exercise : "";
    const label = typeof data.label === "string" ? data.label : exercise;
    const duration_seconds =
      typeof data.duration_seconds === "number" ? data.duration_seconds : 30;
    if (!exercise) return null;
    return { id, type, exercise, label, duration_seconds, created_at, handled };
  }

  if (type === "start_capture" || type === "stop_capture") {
    const rep_id = typeof data.rep_id === "string" ? data.rep_id : "";
    const drill_id = typeof data.drill_id === "string" ? data.drill_id : "";
    const hint = typeof data.hint === "string" ? data.hint : undefined;
    if (!rep_id) return null;
    return { id, type, rep_id, drill_id, hint, created_at, handled };
  }

  return null;
}

export type TranscriptKind =
  | "info"
  | "recording"
  | "upload"
  | "analysis"
  | "connection"
  | "peek"
  | "error";

export interface TranscriptEntry {
  id: string;
  role: "user" | "coach" | "system";
  kind?: TranscriptKind;
  text: string;
  ts: number;
}
