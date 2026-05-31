"use client";

import { NextTurnCue } from "@/components/coach/NextTurnCue";
import { RepScorecard } from "@/components/coach/RepScorecard";
import type { FocusDrill, LiveSessionDoc, RepDoc, SessionPhase } from "@/lib/types";

interface CoachSessionPanelProps {
  loading: boolean;
  sessionId: string | null;
  session: LiveSessionDoc | null;
  phaseLabel: string | null;
  coachStatus: string;
  coachError: string | null;
  captureLastUpload: { repId: string; status: string } | null;
  recording: boolean;
  analyzingCount: number;
  setupFramingPassed: boolean;
  focusDrill: FocusDrill | null;
  currentPhase: SessionPhase | undefined;
  warmupTimerActive: boolean;
  warmupTimerLabel: string | null;
  repCount: number;
  resultsReady: boolean;
  connected: boolean;
  reps: RepDoc[];
  showScorecards?: boolean;
  className?: string;
}

export function CoachSessionPanel({
  loading,
  sessionId,
  session,
  phaseLabel,
  coachStatus,
  coachError,
  captureLastUpload,
  recording,
  analyzingCount,
  setupFramingPassed,
  focusDrill,
  currentPhase,
  warmupTimerActive,
  warmupTimerLabel,
  repCount,
  resultsReady,
  connected,
  reps,
  showScorecards = false,
  className = "",
}: CoachSessionPanelProps) {
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className="panel-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-zinc-400">Session</div>
            <div className="font-mono text-xs text-zinc-200">
              {loading ? "Starting…" : (sessionId ?? "…")}
            </div>
            {phaseLabel && (
              <div className="mt-1 text-xs text-zinc-400">
                Phase: <span className="text-zinc-200">{phaseLabel}</span>
              </div>
            )}
          </div>
          <span
            className={
              coachStatus === "connected"
                ? "badge-brand rounded-full px-2.5 py-0.5 text-xs font-semibold"
                : coachStatus === "reconnecting"
                  ? "rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400 animate-pulse"
                  : coachStatus === "wrapping up"
                    ? "rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400"
                    : coachStatus === "ended" || session?.ended_at
                      ? "rounded-full border border-zinc-800 bg-zinc-900/40 px-2.5 py-0.5 text-xs font-semibold text-zinc-400"
                      : loading
                        ? "rounded-full border border-zinc-800 bg-zinc-900/40 px-2.5 py-0.5 text-xs font-semibold text-zinc-500"
                        : "rounded-full border border-zinc-800 bg-zinc-900/40 px-2.5 py-0.5 text-xs font-semibold text-zinc-400"
            }
          >
            {loading ? "loading" : session?.ended_at ? "ended" : coachStatus}
          </span>
        </div>
        <NextTurnCue
          className="mt-3"
          coachStatus={coachStatus}
          recording={recording}
          analyzingCount={analyzingCount}
          setupFramingPassed={setupFramingPassed}
          focusDrill={focusDrill}
          currentPhase={currentPhase}
          lastWarmupExercise={session?.last_warmup_exercise}
          lastWarmupForm={session?.last_warmup_form}
          warmupMovesChecked={session?.warmup_moves_checked}
          warmupTimerActive={warmupTimerActive}
          warmupTimerLabel={warmupTimerLabel}
          repCount={repCount}
          resultsReady={resultsReady}
          connected={connected}
        />
        {coachError && <div className="mt-2 text-xs text-red-400">{coachError}</div>}
        {session?.warmup_peek_updated_at && currentPhase === "warmup" && (
          <div className="mt-2 text-xs text-zinc-500">
            Warm-up checked {new Date(session.warmup_peek_updated_at).toLocaleTimeString()}
            {session.warmup_moves_checked != null &&
              ` · ${session.warmup_moves_checked} move${session.warmup_moves_checked === 1 ? "" : "s"} reviewed`}
          </div>
        )}
        {captureLastUpload && (
          <div className="mt-2 text-xs text-zinc-400">
            Last clip: <span className="text-zinc-200">{captureLastUpload.repId}</span> ·{" "}
            <span
              className={
                captureLastUpload.status === "uploaded"
                  ? "text-brand"
                  : captureLastUpload.status === "error"
                    ? "text-red-300"
                    : "text-yellow-300"
              }
            >
              {captureLastUpload.status}
            </span>
          </div>
        )}
      </div>

      {showScorecards && reps.length > 0 && (
        <div className="space-y-4">
          {reps.map((rep) => (
            <RepScorecard key={rep.rep_id} rep={rep} />
          ))}
        </div>
      )}
    </div>
  );
}
