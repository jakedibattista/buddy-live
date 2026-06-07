/**
 * Canonical drill id sent to the modelforpuckbuddy `/api/analyze-video`
 * endpoint. The voice agent talks in user-facing FocusDrill names (see below)
 * User-facing focus names map via `lib/drills.ts` (frontend) and
 * `rep_capture._normalize_drill` (backend).
 */
export type DrillId = "wristshot" | "slapshot_form" | "backhand";

/** What the voice agent says out loud and what the UI displays. */
export type FocusDrill = "wristshot" | "slapshot" | "backhand";

export type SessionPhase =
  | "intro"
  | "warmup"
  | "stance_check"
  | "drill_readiness"
  | "scored_reps"
  | "iq_practice"
  | "recap"
  | "ended";

export interface LiveSessionDoc {
  session_id: string;
  user_id: string;
  startedAt: string;
  currentPhase?: SessionPhase;
  focus_drill?: FocusDrill;
  focus_drill_set_at?: string;
  setup_framing_passed?: boolean;
  results_ready_at?: string;
  ended_at?: string;
  iq_question_goal?: number;
  iq_score_correct?: number;
  iq_score_total?: number;
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

export interface IqVisualCommand extends CoachCommandBase {
  type: "show_iq_visual";
  scenario: string;
  options: string[];
  diagram: string;
}

export interface IqAnswerCommand extends CoachCommandBase {
  type: "mark_iq_answer";
  player_choice: string;
  correct_choice: string;
  was_correct: boolean;
}

export type CoachCommand =
  | CaptureCommand
  | WarmupTimerCommand
  | IqVisualCommand
  | IqAnswerCommand;

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

  if (type === "show_iq_visual") {
    const scenario = typeof data.scenario === "string" ? data.scenario : "";
    const options = Array.isArray(data.options)
      ? (data.options as unknown[]).filter((o): o is string => typeof o === "string")
      : [];
    const diagram = typeof data.diagram === "string" ? data.diagram : "";
    if (!scenario) return null;
    return { id, type, scenario, options, diagram, created_at, handled };
  }

  if (type === "mark_iq_answer") {
    const player_choice =
      typeof data.player_choice === "string" ? data.player_choice.toUpperCase() : "";
    const correct_choice =
      typeof data.correct_choice === "string" ? data.correct_choice.toUpperCase() : "";
    if (!player_choice || !correct_choice) return null;
    const was_correct =
      typeof data.was_correct === "boolean"
        ? data.was_correct
        : player_choice === correct_choice;
    return {
      id,
      type,
      player_choice,
      correct_choice,
      was_correct,
      created_at,
      handled,
    };
  }

  return null;
}

export type TranscriptKind =
  | "info"
  | "recording"
  | "upload"
  | "analysis"
  | "connection"
  | "error";

export interface TranscriptEntry {
  id: string;
  role: "user" | "coach" | "system";
  kind?: TranscriptKind;
  text: string;
  ts: number;
}
