"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraPeekNudge } from "@/components/CameraPeekNudge";
import { CameraView } from "@/components/CameraView";
import { CoachConversation, CoachVoiceShell } from "@/components/CoachConversation";
import { CoachPuckAvatar } from "@/components/CoachPuckAvatar";
import { DrillChip } from "@/components/DrillChip";
import { FramingIndicator } from "@/components/FramingIndicator";
import { IqVisualCard } from "@/components/IqVisualCard";
import { MicVUMeter } from "@/components/MicVUMeter";
import { NextTurnCue } from "@/components/NextTurnCue";
import { RepScorecard } from "@/components/RepScorecard";
import { RecordingTimer } from "@/components/RecordingTimer";
import { WarmupTimerBridge } from "@/components/WarmupTimerBridge";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { VoiceQuickPrompts } from "@/components/VoiceQuickPrompts";
import { useLiveSession } from "@/hooks/useLiveSession";
import { usePeekFrameUploader } from "@/hooks/usePeekFrameUploader";
import { useRepCapture } from "@/hooks/useRepCapture";
import { useRepResultsPolling } from "@/hooks/useRepResultsPolling";
import { humanSessionPhase } from "@/lib/phases";
import { SCORED_REP_TARGET } from "@/lib/recording";
import { systemTranscript } from "@/lib/transcript";
import type { TranscriptEntry } from "@/lib/types";
import type { IqVisualCommand } from "@/lib/types";
import type { VoiceResumeContext } from "@/lib/hiddenAgentMessages";

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

export default function CoachPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [coachStatus, setCoachStatus] = useState<string>("idle");
  const [celebratePuck, setCelebratePuck] = useState(false);
  const [warmupTimerActive, setWarmupTimerActive] = useState(false);
  const [warmupTimerLabel, setWarmupTimerLabel] = useState<string | null>(null);

  const live = useLiveSession();
  const capture = useRepCapture({
    sessionId: live.sessionId,
    stream,
    commands: live.commands,
  });

  usePeekFrameUploader({
    sessionId: live.sessionId,
    videoRef,
    enabled: Boolean(live.sessionId && stream),
    warmupActive: warmupTimerActive,
  });

  useRepResultsPolling({ sessionId: live.sessionId, reps: live.reps });

  const appendSystem = useCallback((text: string, kind: TranscriptEntry["kind"] = "info") => {
    setTranscript((cur) => [...cur, systemTranscript(text, kind)].slice(-40));
  }, []);

  const requestMedia = useCallback(async () => {
    setPermissionError(null);
    try {
      stream?.getTracks().forEach((t) => t.stop());
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      setStream(ms);
    } catch (e) {
      setPermissionError(e instanceof Error ? e.message : String(e));
    }
  }, [stream]);

  useEffect(() => {
    void requestMedia();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTranscript = useCallback((entry: TranscriptEntry) => {
    setTranscript((cur) => [...cur, entry].slice(-40));
  }, []);

  const reps = useMemo(
    () =>
      Object.values(live.reps).sort((a, b) =>
        (a.created_at ?? "").localeCompare(b.created_at ?? ""),
      ),
    [live.reps],
  );

  const analyzingCount = useMemo(
    () => reps.filter((r) => r.status === "analyzing" || r.status === "uploaded").length,
    [reps],
  );

  const latestIqVisual = useMemo<IqVisualCommand | null>(() => {
    const iqCommands = live.commands.filter(
      (c): c is IqVisualCommand => c.type === "show_iq_visual",
    );
    return iqCommands.length > 0 ? iqCommands[iqCommands.length - 1] : null;
  }, [live.commands]);

  const focusDrill = live.session?.focus_drill ?? null;
  const setupFramingPassed = live.session?.setup_framing_passed === true;
  const resultsReady = Boolean(live.session?.results_ready_at);
  const currentPhase = live.session?.currentPhase;

  // Track whether the player has EVER cleared the setup framing check this
  // session. Once true, stays true — so the soft FramingIndicator can light
  // up mid-drill if a later peek sees them drift out, without flashing during
  // the initial setup phase.
  const framingPassedOnceRef = useRef(false);
  if (setupFramingPassed) framingPassedOnceRef.current = true;
  const connected = coachStatus === "connected" || coachStatus === "wrapping up";
  const phaseLabel = humanSessionPhase(live.session?.currentPhase);
  const sessionStartMs = live.session?.startedAt
    ? new Date(live.session.startedAt).getTime()
    : undefined;

  const voiceResumeContext = useMemo<VoiceResumeContext>(
    () => ({
      focusDrill,
      currentPhase,
      repCount: reps.length,
      setupFramingPassed,
    }),
    [focusDrill, currentPhase, reps.length, setupFramingPassed],
  );

  // Only show the framing banner when the agent is actively in the setup
  // check phase and has emitted a real camera_hint. We deliberately do NOT
  // fall back on `reps.length === 0` (that fired the banner before any peek
  // ran) and we hide it the moment setup_framing_passed flips true.
  const cameraHint = live.session?.camera_hint;
  const showSetupBanner =
    connected &&
    !capture.recording &&
    focusDrill != null &&
    currentPhase === "stance_check" &&
    !setupFramingPassed &&
    Boolean(cameraHint);

  const setupBannerText =
    cameraHint ??
    "Step back — Coach Buddy needs to see you from head to toes, facing the camera.";

  const displayedDrillId = capture.activeDrillId ?? focusDrill;
  const nextRepNumber = Math.min(reps.length + 1, SCORED_REP_TARGET);
  const inDrillReadiness =
    currentPhase === "drill_readiness" && setupFramingPassed && reps.length === 0;

  const displayedHeadline = capture.recording
    ? "Now capturing"
    : inDrillReadiness
      ? "Rep armed"
      : null;

  const displayedHint = capture.activeDrillId
    ? capture.hint
    : focusDrill && setupFramingPassed && reps.length === 0
      ? `Rep 1 of ${SCORED_REP_TARGET} — say ready to start recording`
      : focusDrill && setupFramingPassed && !capture.recording && reps.length > 0
        ? `Rep ${nextRepNumber} of ${SCORED_REP_TARGET} — say ready`
        : focusDrill
          ? `Today: ${SCORED_REP_TARGET} ${focusDrill}s, one at a time.`
          : null;

  const handleWarmupTimerActiveChange = useCallback((active: boolean, label: string | null) => {
    setWarmupTimerActive(active);
    setWarmupTimerLabel(label);
  }, []);

  const prevRecordingRef = useRef(false);
  useEffect(() => {
    if (capture.recording && !prevRecordingRef.current) {
      appendSystem("Recording started — perform your rep, then Stop & upload.", "recording");
    }
    if (!capture.recording && prevRecordingRef.current) {
      appendSystem("Recording stopped — uploading clip…", "upload");
    }
    prevRecordingRef.current = capture.recording;
  }, [capture.recording, appendSystem]);

  const prevUploadRef = useRef(capture.lastUpload);
  useEffect(() => {
    const cur = capture.lastUpload;
    const prev = prevUploadRef.current;
    if (cur && cur !== prev) {
      if (cur.status === "uploaded") {
        appendSystem("Clip uploaded — analysis queued.", "upload");
      } else if (cur.status === "error") {
        appendSystem(cur.error ?? "Clip didn't upload — try again.", "error");
      }
    }
    prevUploadRef.current = cur;
  }, [capture.lastUpload, appendSystem]);

  const prevPeekAtRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const at = live.session?.peek_status_updated_at;
    if (!at || at === prevPeekAtRef.current) return;
    prevPeekAtRef.current = at;

    if (live.session?.setup_framing_passed) {
      appendSystem(
        "Camera framing looks good — ask for drill help or a practice rep, then say ready.",
        "peek",
      );
    } else if (live.session?.camera_hint) {
      appendSystem(live.session.camera_hint, "peek");
    }
  }, [
    live.session?.peek_status_updated_at,
    live.session?.setup_framing_passed,
    live.session?.camera_hint,
    appendSystem,
  ]);

  const prevWarmupPeekRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const at = live.session?.warmup_peek_updated_at;
    if (!at || at === prevWarmupPeekRef.current) return;
    prevWarmupPeekRef.current = at;

    const form = live.session?.last_warmup_form;
    if (form === "good") {
      appendSystem("Warm-up move looked good.", "peek");
    } else if (form === "adjust") {
      appendSystem("Coach Buddy spotted something to adjust — listen for his cue.", "peek");
    } else {
      appendSystem("Coach Buddy checked your move — keep going.", "peek");
    }
  }, [live.session?.warmup_peek_updated_at, live.session?.last_warmup_form, appendSystem]);

  const prevCoachStatusRef = useRef(coachStatus);
  useEffect(() => {
    if (coachStatus.startsWith("error:") && !prevCoachStatusRef.current.startsWith("error:")) {
      appendSystem("Connection to Coach Buddy failed.", "connection");
    }
    if (coachStatus === "connected" && prevCoachStatusRef.current !== "connected") {
      appendSystem("Connected to Coach Buddy.", "connection");
    }
    prevCoachStatusRef.current = coachStatus;
  }, [coachStatus, appendSystem]);

  const prevResultsReadyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const at = live.session?.results_ready_at;
    if (!at || at === prevResultsReadyRef.current) return;
    prevResultsReadyRef.current = at;
    appendSystem("Scorecard ready — tap Wrap up when you're set.", "analysis");
  }, [live.session?.results_ready_at, appendSystem]);

  const prevRepStatusRef = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const rep of reps) {
      const id = rep.rep_id;
      if (!id) continue;
      const prev = prevRepStatusRef.current[id];
      if (prev !== "completed" && rep.status === "completed") {
        appendSystem("Rep scored — check your scorecard below.", "analysis");
        setCelebratePuck(true);
        window.setTimeout(() => setCelebratePuck(false), 1400);
      }
      prevRepStatusRef.current[id] = rep.status ?? "";
    }
  }, [reps, appendSystem]);

  return (
    <main className="relative flex min-h-screen flex-col bg-zinc-950 text-white">
      <CoachVoiceShell>
        <div className="relative mx-auto grid w-full max-w-7xl flex-1 gap-6 p-4 lg:grid-cols-[1fr_360px] lg:p-6">
          {/* Camera column */}
          <section className="relative flex h-[60vh] w-full flex-col gap-4 lg:h-[calc(100vh-3rem)]">
            <div className="relative flex-1">
              <CameraView ref={videoRef} stream={stream} recording={capture.recording} />
              {permissionError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center">
                  <div className="max-w-sm">
                    <div className="mb-1 text-lg font-semibold">Camera + mic required</div>
                    <div className="mb-4 text-sm text-zinc-400">{permissionError}</div>
                    <button
                      type="button"
                      onClick={() => void requestMedia()}
                      className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
              {showSetupBanner && (
                <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[55%] sm:max-w-sm">
                  <div className="rounded-xl border border-amber-400/40 bg-amber-500/25 px-4 py-2 text-xs leading-snug text-amber-50 shadow-md backdrop-blur-md sm:text-sm">
                    {setupBannerText}
                  </div>
                </div>
              )}
              <div className="pointer-events-none absolute right-4 top-4 z-30 flex max-w-[45%] flex-col items-end gap-1.5 [&>*]:pointer-events-auto">
                <DrillChip
                  drillId={displayedDrillId}
                  hint={displayedHint}
                  headline={displayedHeadline}
                  recording={capture.recording}
                />
                <FramingIndicator
                  framingPassedOnce={framingPassedOnceRef.current}
                  lastFullBodyInFrame={live.session?.last_peek_full_body_in_frame}
                  inSetupPhase={currentPhase === "stance_check"}
                />
              </div>
              <CameraPeekNudge
                currentPhase={currentPhase}
                setupFramingPassed={setupFramingPassed}
                peekStatusUpdatedAt={live.session?.peek_status_updated_at}
                onNudge={() => appendSystem("Asked Coach to re-check framing.", "peek")}
              />
              <CoachPuckAvatar
                recording={capture.recording}
                celebrate={celebratePuck}
                className="absolute bottom-24 left-4 z-20"
              />
              <div className="absolute bottom-4 left-1/2 z-10 flex w-full max-w-lg -translate-x-1/2 flex-col items-center gap-2 px-4">
                <VoiceQuickPrompts
                  recording={capture.recording}
                  setupFramingPassed={setupFramingPassed}
                  repCount={reps.length}
                  resultsReady={resultsReady}
                />
                <CoachConversation
                  sessionId={live.sessionId}
                  agentId={AGENT_ID}
                  sessionReady={!live.loading}
                  resumeContext={voiceResumeContext}
                  onTranscript={handleTranscript}
                  onStatusChange={setCoachStatus}
                />
              </div>
              <RecordingTimer recording={capture.recording} onStop={capture.stopRecording} />
              <WarmupTimerBridge
                sessionId={live.sessionId}
                commands={live.commands}
                onTranscript={handleTranscript}
                onActiveChange={handleWarmupTimerActiveChange}
              />
              <div className="absolute bottom-4 right-4">
                <MicVUMeter stream={stream} />
              </div>
            </div>
          </section>

          {/* Side panel */}
          <aside className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-zinc-400">Session</div>
                  <div className="font-mono text-xs text-zinc-200">
                    {live.loading ? "Starting…" : (live.sessionId ?? "…")}
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
                      ? "rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300"
                      : coachStatus === "reconnecting"
                        ? "rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300"
                        : coachStatus === "wrapping up"
                          ? "rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300"
                          : coachStatus === "ended" || live.session?.ended_at
                          ? "rounded-full bg-zinc-500/20 px-2 py-0.5 text-xs text-zinc-300"
                          : live.loading
                            ? "rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-400"
                            : "rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-300"
                  }
                >
                  {live.loading ? "loading" : live.session?.ended_at ? "ended" : coachStatus}
                </span>
              </div>
              <NextTurnCue
                className="mt-3"
                coachStatus={coachStatus}
                recording={capture.recording}
                analyzingCount={analyzingCount}
                setupFramingPassed={setupFramingPassed}
                focusDrill={focusDrill}
                currentPhase={currentPhase}
                lastWarmupExercise={live.session?.last_warmup_exercise}
                lastWarmupForm={live.session?.last_warmup_form}
                warmupMovesChecked={live.session?.warmup_moves_checked}
                warmupTimerActive={warmupTimerActive}
                warmupTimerLabel={warmupTimerLabel}
                repCount={reps.length}
                resultsReady={resultsReady}
                connected={connected}
              />
              {live.error && (
                <div className="mt-2 text-xs text-red-400">{live.error}</div>
              )}
              {live.session?.warmup_peek_updated_at && currentPhase === "warmup" && (
                <div className="mt-2 text-xs text-zinc-500">
                  Warm-up checked{" "}
                  {new Date(live.session.warmup_peek_updated_at).toLocaleTimeString()}
                  {live.session.warmup_moves_checked != null &&
                    ` · ${live.session.warmup_moves_checked} move${live.session.warmup_moves_checked === 1 ? "" : "s"} reviewed`}
                </div>
              )}
              {live.session?.peek_updated_at && (
                <div className="mt-2 text-xs text-zinc-500">
                  Camera frame updated{" "}
                  {new Date(live.session.peek_updated_at).toLocaleTimeString()}
                </div>
              )}
              {capture.lastUpload && (
                <div className="mt-2 text-xs text-zinc-400">
                  Last clip: <span className="text-zinc-200">{capture.lastUpload.repId}</span> ·{" "}
                  <span
                    className={
                      capture.lastUpload.status === "uploaded"
                        ? "text-emerald-300"
                        : capture.lastUpload.status === "error"
                          ? "text-red-300"
                          : "text-yellow-300"
                    }
                  >
                    {capture.lastUpload.status}
                  </span>
                </div>
              )}
            </div>

            <TranscriptPanel entries={transcript} sessionStartMs={sessionStartMs} />

            {currentPhase === "iq_practice" && (
              <IqVisualCard command={latestIqVisual} />
            )}

            <div className="flex flex-col gap-3">
              <div className="px-1 text-xs uppercase tracking-widest text-zinc-400">
                Reps ({reps.length})
              </div>
              {reps.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">
                  Reps will appear here as Coach Buddy guides you through the drills.
                </div>
              )}
              {reps.map((rep) => (
                <RepScorecard key={rep.rep_id} rep={rep} />
              ))}
            </div>
          </aside>
        </div>
      </CoachVoiceShell>
    </main>
  );
}
