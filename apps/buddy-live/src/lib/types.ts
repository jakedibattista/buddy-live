export type DrillId = "wristshot" | "snapshot" | "slapshot_form" | "backhand" | "skating";

export type FocusDrill = "wristshot" | "slapshot" | "backhand";

export type SessionPhase =
  | "warmup"
  | "stance_check"
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
  peek_url?: string;
  peek_updated_at?: string;
  ended_at?: string;
}

export interface RepDoc {
  rep_id: string;
  drill_id: DrillId | string;
  hint?: string;
  status:
    | "pending_capture"
    | "capturing"
    | "uploaded"
    | "analyzing"
    | "completed"
    | "failed"
    | "stub_queued"
    | "analyze_error";
  storage_path?: string;
  storagePath?: string;
  storage_url?: string;
  job_id?: string;
  jobId?: string;
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

export interface CoachCommand {
  id: string;
  type: "start_capture" | "stop_capture";
  rep_id: string;
  drill_id: DrillId | string;
  hint?: string;
  created_at: string;
  handled?: boolean;
}

export interface TranscriptEntry {
  id: string;
  role: "user" | "coach";
  text: string;
  ts: number;
}
