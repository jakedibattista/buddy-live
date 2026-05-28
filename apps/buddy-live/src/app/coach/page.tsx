"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraPeekNudge } from "@/components/CameraPeekNudge";
import { CameraView } from "@/components/CameraView";
import { CoachConversation, CoachVoiceShell } from "@/components/CoachConversation";
import { CoachPuckAvatar } from "@/components/CoachPuckAvatar";
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
import type { IqAnswerCommand, IqVisualCommand } from "@/lib/types";
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
    enabled: Boolean(live.sessionId && stream && live.session?.currentPhase !== "iq_practice"),
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

  const iqCommandsCount = useMemo(() => {
    return live.commands.filter((c) => c.type === "show_iq_visual").length;
  }, [live.commands]);

  const latestIqVisual = useMemo<IqVisualCommand | null>(() => {
    const iqCommands = live.commands.filter(
      (c): c is IqVisualCommand => c.type === "show_iq_visual",
    );
    return iqCommands.length > 0 ? iqCommands[iqCommands.length - 1] : null;
  }, [live.commands]);

  // Pair the latest answer mark with the current scenario, but only if the
  // mark came AFTER the scenario was shown — otherwise a stale mark from a
  // previous scenario would bleed through onto the next card.
  const latestIqAnswer = useMemo<IqAnswerCommand | null>(() => {
    if (!latestIqVisual) return null;
    const answers = live.commands.filter(
      (c): c is IqAnswerCommand => c.type === "mark_iq_answer",
    );
    if (answers.length === 0) return null;
    const last = answers[answers.length - 1];
    return last.created_at > latestIqVisual.created_at ? last : null;
  }, [live.commands, latestIqVisual]);

  const inIqPractice = live.session?.currentPhase === "iq_practice";

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
      : currentPhase === "warmup"
        ? "Warm-up"
        : (currentPhase === "stance_check" || currentPhase === "drill_readiness" || currentPhase === "scored_reps") && focusDrill
          ? `${focusDrill.charAt(0).toUpperCase() + focusDrill.slice(1)} practice`
          : currentPhase === "recap" || currentPhase === "ended"
            ? "Cooldown & review"
            : currentPhase === "iq_practice"
              ? "Hockey IQ"
              : null;

  const displayedHint = capture.activeDrillId
    ? capture.hint
    : focusDrill && setupFramingPassed && reps.length === 0
      ? `Rep 1 — say ready to start recording`
      : focusDrill && setupFramingPassed && !capture.recording && reps.length > 0
        ? `Rep ${nextRepNumber} — say ready`
        : focusDrill
          ? `Focus drill: ${focusDrill.charAt(0).toUpperCase() + focusDrill.slice(1)}.`
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
    <main className="relative flex min-h-screen flex-col bg-black text-white">
      <CoachVoiceShell>
        <div className="relative mx-auto grid w-full max-w-7xl flex-1 gap-6 p-4 lg:grid-cols-[1fr_360px] lg:p-6">
          {/* Camera column (or large IQ overlay during Hockey IQ practice) */}
          <section className="relative flex h-[60vh] w-full flex-col gap-4 lg:h-[calc(100vh-3rem)]">
            <div className="relative flex-1">
              {inIqPractice ? (
                <div className="absolute inset-0 flex items-center justify-center overflow-y-auto rounded-2xl bg-black p-4 sm:p-6">
                  {latestIqVisual ? (
                    <IqVisualCard
                      command={latestIqVisual}
                      answer={latestIqAnswer}
                      size="lg"
                      className="w-full max-w-2xl"
                      questionIndex={iqCommandsCount}
                      totalQuestions={8}
                    />
                  ) : (
                    <div className="max-w-md text-center text-zinc-300">
                      <div className="mb-3 text-3xl">🧠</div>
                      <div className="text-lg font-semibold text-white">
                        Hockey IQ Practice
                      </div>
                      <div className="mt-2 text-sm text-zinc-400">
                        Coach Buddy is lining up your first scenario — listen for
                        the question and watch this space.
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative h-full w-full rounded-2xl overflow-hidden bg-black">
                  {/* Performance dashboard when in recap or ended phase */}
                  {(currentPhase === "recap" || currentPhase === "ended") && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-zinc-950 p-4 sm:p-6 pb-24 md:pb-6">
                      <div className="w-full max-w-4xl space-y-6 my-auto">
                        <div className="text-center space-y-2">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider">
                            🏆 Session Completed
                          </div>
                          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                            Your Performance Report
                          </h2>
                          <p className="text-xs text-zinc-400 max-w-lg mx-auto">
                            Review your biomechanics scorecard with Coach Buddy. Your strongest areas and focus points are summarized below.
                          </p>
                        </div>

                        <div className={cn(
                          "grid gap-4 max-h-[42vh] overflow-y-auto p-1 custom-scrollbar",
                          reps.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
                        )}>
                          {reps.map((rep) => (
                            <RepScorecard key={rep.rep_id} rep={rep} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <CameraView
                    ref={videoRef}
                    stream={stream}
                    recording={capture.recording}
                    className={cn(
                      "transition-all duration-500 ease-in-out",
                      (currentPhase === "recap" || currentPhase === "ended")
                        ? "absolute bottom-4 right-4 z-20 w-44 h-28 border border-zinc-800 shadow-xl rounded-xl"
                        : "h-full w-full"
                    )}
                  />
                </div>
              )}
              {!inIqPractice && permissionError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center">
                  <div className="max-w-sm">
                    <div className="mb-1 text-lg font-semibold">Camera + mic required</div>
                    <div className="mb-4 text-sm text-zinc-400">{permissionError}</div>
                    <button
                      type="button"
                      onClick={() => void requestMedia()}
                      className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-zinc-200 transition-colors shadow-sm"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
              {!inIqPractice && showSetupBanner && (
                <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[55%] sm:max-w-sm">
                  <div className="rounded-xl border border-amber-400/40 bg-amber-500/25 px-4 py-2 text-xs leading-snug text-amber-50 shadow-md backdrop-blur-md sm:text-sm">
                    {setupBannerText}
                  </div>
                </div>
              )}
              {!inIqPractice && (
                <div className="pointer-events-none absolute right-4 top-4 z-30 flex max-w-[45%] flex-col items-end gap-1.5 [&>*]:pointer-events-auto">
                  <FramingIndicator
                    framingPassedOnce={framingPassedOnceRef.current}
                    lastFullBodyInFrame={live.session?.last_peek_full_body_in_frame}
                    inSetupPhase={currentPhase === "stance_check"}
                  />
                </div>
              )}
              {!inIqPractice && (
                <CameraPeekNudge
                  currentPhase={currentPhase}
                  setupFramingPassed={setupFramingPassed}
                  peekStatusUpdatedAt={live.session?.peek_status_updated_at}
                  onNudge={() => appendSystem("Asked Coach to re-check framing.", "peek")}
                />
              )}
              {!inIqPractice && (
                <CoachPuckAvatar
                  recording={capture.recording}
                  celebrate={celebratePuck}
                  className="absolute bottom-24 left-4 z-20"
                />
              )}
              <div className="absolute bottom-4 left-1/2 z-10 flex w-full max-w-lg -translate-x-1/2 flex-col items-center gap-2 px-4">
                {!inIqPractice && (
                  <VoiceQuickPrompts
                    recording={capture.recording}
                    setupFramingPassed={setupFramingPassed}
                    repCount={reps.length}
                    resultsReady={resultsReady}
                  />
                )}
                <CoachConversation
                  sessionId={live.sessionId}
                  agentId={AGENT_ID}
                  sessionReady={!live.loading}
                  resumeContext={voiceResumeContext}
                  onTranscript={handleTranscript}
                  onStatusChange={setCoachStatus}
                />
              </div>
              {!inIqPractice && (
                <RecordingTimer recording={capture.recording} onStop={capture.stopRecording} />
              )}
              {!inIqPractice && (
                <WarmupTimerBridge
                  sessionId={live.sessionId}
                  commands={live.commands}
                  onTranscript={handleTranscript}
                  onActiveChange={handleWarmupTimerActiveChange}
                />
              )}
              {!inIqPractice && (
                <div className="absolute bottom-4 right-4">
                  <MicVUMeter stream={stream} />
                </div>
              )}
            </div>
          </section>

          {/* Side panel */}
          <aside className="flex flex-col gap-4 lg:h-[calc(100vh-3rem)] lg:min-h-0">
            <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-5 shadow-sm backdrop-blur-md">
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
                      ? "rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-[#2997ff]"
                      : coachStatus === "reconnecting"
                        ? "rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400 animate-pulse"
                        : coachStatus === "wrapping up"
                          ? "rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400"
                          : coachStatus === "ended" || live.session?.ended_at
                          ? "rounded-full border border-zinc-800 bg-zinc-900/40 px-2.5 py-0.5 text-xs font-semibold text-zinc-400"
                          : live.loading
                            ? "rounded-full border border-zinc-800 bg-zinc-900/40 px-2.5 py-0.5 text-xs font-semibold text-zinc-500"
                            : "rounded-full border border-zinc-800 bg-zinc-900/40 px-2.5 py-0.5 text-xs font-semibold text-zinc-400"
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

            <TranscriptPanel
              className="flex-1 min-h-0"
              entries={transcript}
              sessionStartMs={sessionStartMs}
            />

            {!inIqPractice && reps.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="px-1 text-xs uppercase tracking-widest text-zinc-400">
                  Reps ({reps.length})
                </div>
                {reps.map((rep) => (
                  <RepScorecard key={rep.rep_id} rep={rep} />
                ))}
              </div>
            )}
          </aside>
        </div>
      </CoachVoiceShell>
    </main>
  );
}
