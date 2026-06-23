"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraFlipButton } from "@/components/camera/CameraFlipButton";
import { CameraView } from "@/components/camera/CameraView";
import { MicVUMeter } from "@/components/camera/MicVUMeter";
import { RecordingTimer } from "@/components/camera/RecordingTimer";
import { CoachConversation, CoachVoiceShell } from "@/components/coach/CoachConversation";
import { CoachMobileTabBar, type CoachMobileTab } from "@/components/coach/CoachMobileTabBar";
import { CoachPuckAvatar } from "@/components/coach/CoachPuckAvatar";
import { CoachSessionPanel } from "@/components/coach/CoachSessionPanel";
import { RepScorecard } from "@/components/coach/RepScorecard";
import { TranscriptPanel } from "@/components/coach/TranscriptPanel";
import { VoiceQuickPrompts } from "@/components/coach/VoiceQuickPrompts";
import { WarmupTimerBridge } from "@/components/coach/WarmupTimerBridge";
import { IqVisualCard } from "@/components/iq/IqVisualCard";
import { IqScorecard } from "@/components/iq/IqScorecard";
import { useLiveSession } from "@/hooks/useLiveSession";
import { useMobileCoachLayout } from "@/hooks/useMobileCoachLayout";
import { useRepCapture } from "@/hooks/useRepCapture";
import { useRepResultsPolling } from "@/hooks/useRepResultsPolling";
import {
  type VoiceResumeContext,
} from "@/lib/hiddenAgentMessages";
import { humanSessionPhase } from "@/lib/phases";
import { systemTranscript } from "@/lib/transcript";
import { cn } from "@/lib/utils";
import type { IqAnswerCommand, IqVisualCommand, TranscriptEntry } from "@/lib/types";

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

type FacingMode = "user" | "environment";

export function CoachPageClient() {
  const mobileLayout = useMobileCoachLayout();
  const [mobileTab, setMobileTab] = useState<CoachMobileTab>("live");

  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("user");
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

  useRepResultsPolling({ sessionId: live.sessionId, reps: live.reps });

  const appendSystem = useCallback((text: string, kind: TranscriptEntry["kind"] = "info") => {
    setTranscript((cur) => [...cur, systemTranscript(text, kind)].slice(-40));
  }, []);

  const requestMedia = useCallback(
    async (options?: { facing?: FacingMode }) => {
      setPermissionError(null);
      const facing = options?.facing ?? facingMode;
      try {
        stream?.getTracks().forEach((t) => t.stop());
        const ms = await navigator.mediaDevices.getUserMedia({
          video: {
            // Portrait (tall) capture. The analyzer (modelforpuckbuddy) only
            // returns metrics on portrait clips where the player fills the
            // frame head-to-toe; landscape 1280x720 clips came back with zero
            // metrics ("unscoreable"). Phones honor this and record portrait.
            width: { ideal: 720 },
            height: { ideal: 1280 },
            aspectRatio: { ideal: 9 / 16 },
            facingMode: facing,
          },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        setFacingMode(facing);
        setStream(ms);
      } catch (e) {
        setPermissionError(e instanceof Error ? e.message : String(e));
      }
    },
    [stream, facingMode],
  );

  const flipCamera = useCallback(() => {
    const next: FacingMode = facingMode === "user" ? "environment" : "user";
    void requestMedia({ facing: next });
  }, [facingMode, requestMedia]);

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
  const iqQuestionGoal = live.session?.iq_question_goal ?? 8;

  const focusDrill = live.session?.focus_drill ?? null;
  const setupFramingPassed = live.session?.setup_framing_passed === true;
  const resultsReady = Boolean(live.session?.results_ready_at);
  const currentPhase = live.session?.currentPhase;

  const showReport =
    currentPhase === "recap" ||
    currentPhase === "ended" ||
    (resultsReady && reps.length > 0 && !capture.recording);

  const connected = coachStatus === "connected" || coachStatus === "wrapping up";
  const phaseLabel = humanSessionPhase(live.session?.currentPhase);
  const sessionStartMs = live.session?.startedAt
    ? new Date(live.session.startedAt).getTime()
    : undefined;

  const lastRepId = reps.length > 0 ? reps[reps.length - 1].rep_id : null;
  const awaitingReview =
    resultsReady && currentPhase !== "recap" && currentPhase !== "ended";
  const playerName = live.session?.player_name ?? null;
  const voiceResumeContext = useMemo<VoiceResumeContext>(
    () => ({
      playerName,
      focusDrill,
      currentPhase,
      repCount: reps.length,
      setupFramingPassed,
      lastRepId,
      awaitingReview,
      warmupTimerActive,
      warmupTimerLabel,
    }),
    [
      playerName,
      focusDrill,
      currentPhase,
      reps.length,
      setupFramingPassed,
      lastRepId,
      awaitingReview,
      warmupTimerActive,
      warmupTimerLabel,
    ],
  );

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
    if (mobileLayout) setMobileTab("session");
  }, [live.session?.results_ready_at, appendSystem, mobileLayout]);

  const prevRepStatusRef = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const rep of reps) {
      const id = rep.rep_id;
      if (!id) continue;
      const prev = prevRepStatusRef.current[id];
      if (prev !== "completed" && rep.status === "completed") {
        appendSystem("Rep scored — check your scorecard in Session.", "analysis");
        setCelebratePuck(true);
        window.setTimeout(() => setCelebratePuck(false), 1400);
        if (mobileLayout) setMobileTab("session");
      }
      prevRepStatusRef.current[id] = rep.status ?? "";
    }
  }, [reps, appendSystem, mobileLayout]);

  const prevPhaseRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!currentPhase) return;
    if (currentPhase !== prevPhaseRef.current) {
      if ((currentPhase === "recap" || currentPhase === "ended") && mobileLayout) {
        setMobileTab("session");
      }
      prevPhaseRef.current = currentPhase;
    }
  }, [currentPhase, mobileLayout]);

  const showLivePanel = !mobileLayout || mobileTab === "live";
  const showSessionPanel = !mobileLayout || mobileTab === "session";
  const showChatPanel = !mobileLayout || mobileTab === "chat";

  const sessionPanelProps = {
    loading: live.loading,
    sessionId: live.sessionId,
    session: live.session,
    phaseLabel,
    coachStatus,
    coachError: live.error,
    captureLastUpload: capture.lastUpload,
    recording: capture.recording,
    analyzingCount,
    setupFramingPassed,
    focusDrill,
    currentPhase,
    warmupTimerActive,
    warmupTimerLabel,
    repCount: reps.length,
    resultsReady,
    connected,
    reps,
    commands: live.commands,
  };

  const iqPlaceholder = (
    <div className="flex flex-col items-center justify-center p-8 max-w-sm mx-auto text-center animate-in fade-in duration-700">
      {/* Sleek, minimalistic Apple-style spinning loader */}
      <div className="relative mb-6 flex h-12 w-12 items-center justify-center">
        {/* Outer track */}
        <div className="absolute inset-0 rounded-full border-[2.5px] border-zinc-800" />
        {/* Spinning indicator */}
        <div className="absolute inset-0 rounded-full border-[2.5px] border-t-zinc-400 border-r-transparent border-b-transparent border-l-transparent animate-spin duration-[1100ms] ease-linear" />
      </div>

      <h3 className="text-xl font-medium tracking-tight text-white/95">
        Hockey IQ Practice
      </h3>

      <p className="mt-2 text-sm font-normal text-zinc-400 leading-relaxed max-w-[280px]">
        Coach Buddy is preparing your first tactical scenario. Watch this space and listen for instructions.
      </p>
    </div>
  );

  return (
    <main
      className={cn(
        "coach-shell relative flex min-h-[100dvh] flex-col bg-black text-white",
        "pt-[max(0.75rem,env(safe-area-inset-top))]",
        mobileLayout
          ? "h-[100dvh] overflow-hidden pb-[calc(3.75rem+env(safe-area-inset-bottom))]"
          : "overflow-y-auto pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:overflow-hidden",
      )}
    >
      <CoachVoiceShell>
        <div
          className={cn(
            "relative mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col",
            mobileLayout ? "p-2" : "grid gap-6 overflow-y-auto p-4 lg:grid-cols-[1fr_360px] lg:overflow-visible lg:p-6",
          )}
        >
          {showLivePanel && (
            <section
              className={cn(
                "relative flex w-full min-h-0 flex-col",
                mobileLayout ? "flex-1 gap-0" : "h-[60vh] gap-4 lg:h-[calc(100vh-3rem)]",
              )}
            >
              <div
                className={cn(
                  "relative w-full min-h-0",
                  mobileLayout ? "min-h-0 flex-1 basis-0" : "flex-1",
                )}
              >
                {inIqPractice ? (
                  <div className="absolute inset-0 flex items-center justify-center overflow-y-auto rounded-2xl border border-white/[0.08] bg-black p-4 sm:p-6">
                    {latestIqVisual ? (
                      <IqVisualCard
                        command={latestIqVisual}
                        answer={latestIqAnswer}
                        size="lg"
                        className="w-full max-w-2xl"
                        questionIndex={iqCommandsCount}
                        totalQuestions={iqQuestionGoal}
                      />
                    ) : (
                      iqPlaceholder
                    )}
                  </div>
                ) : (
                  <div
                    className={cn(
                      "overflow-hidden rounded-2xl border border-white/[0.08] bg-black",
                      mobileLayout ? "absolute inset-0" : "relative h-full w-full",
                    )}
                  >
                    {showReport && !mobileLayout && (
                      /* No items-center here: centered children taller than the
                         container clip at the top and can't be scrolled to
                         (player feedback: "I can't scroll down"). Children use
                         my-auto so short reports still center vertically. */
                      <div className="absolute inset-0 z-10 flex justify-center overflow-y-auto bg-zinc-950 p-4 sm:p-6 pb-24 md:pb-6">
                        {reps.length > 0 ? (
                          reps.length === 1 ? (
                            <div className="my-auto w-full max-w-3xl">
                              <RepScorecard rep={reps[0]} />
                            </div>
                          ) : (
                            <div className="my-auto w-full max-w-4xl space-y-4">
                              <div className="grid max-h-[70vh] grid-cols-1 gap-4 overflow-y-auto p-1 custom-scrollbar md:grid-cols-2">
                                {reps.map((rep) => (
                                  <RepScorecard key={rep.rep_id} rep={rep} />
                                ))}
                              </div>
                            </div>
                          )
                        ) : (
                          <div className="my-auto w-full max-w-4xl">
                            <IqScorecard commands={live.commands} />
                          </div>
                        )}
                      </div>
                    )}

                    <CameraView
                      ref={videoRef}
                      stream={stream}
                      mirrored={facingMode === "user"}
                      className={cn(
                        "transition-all duration-500 ease-in-out",
                        showReport && !mobileLayout
                          ? reps.length > 0
                            ? "absolute bottom-4 right-4 z-20 h-28 w-44 rounded-xl border border-zinc-800 shadow-xl"
                            : // IQ recap: no clip to monitor — the floating
                              // thumbnail just covered the bottom of the
                              // scorecard (player feedback: "you're blocking
                              // question three"). Leave it behind the overlay.
                              "h-full w-full"
                          : mobileLayout
                            ? "absolute inset-0 h-full w-full"
                            : "h-full w-full",
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
                        className="btn-primary px-5 py-2 text-sm motion-reduce:active:scale-100"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                )}

                {!inIqPractice && !permissionError && stream && (
                  <div className="pointer-events-none absolute right-4 top-4 z-30 flex max-w-[45%] flex-col items-end gap-1.5 [&>*]:pointer-events-auto">
                    <CameraFlipButton onFlip={flipCamera} disabled={capture.recording} />
                  </div>
                )}

                {!inIqPractice && (
                  <CoachPuckAvatar
                    recording={capture.recording}
                    celebrate={celebratePuck}
                    className={cn(
                      "z-20",
                      mobileLayout
                        ? "absolute bottom-3 right-3 origin-bottom-right scale-[0.42]"
                        : "absolute bottom-24 left-4",
                    )}
                  />
                )}

                {!mobileLayout && (
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
                      resultsReadyAt={live.session?.results_ready_at}
                      onTranscript={handleTranscript}
                      onStatusChange={setCoachStatus}
                    />
                  </div>
                )}

                {!inIqPractice && (
                  <RecordingTimer recording={capture.recording} onStop={capture.stopRecording} />
                )}

                <WarmupTimerBridge
                  sessionId={live.sessionId}
                  commands={live.commands}
                  enabled={currentPhase === "warmup" || currentPhase === "scored_reps"}
                  currentPhase={currentPhase}
                  onTranscript={handleTranscript}
                  onActiveChange={handleWarmupTimerActiveChange}
                />

                {!mobileLayout && (
                  <div className="absolute bottom-4 right-4">
                    <MicVUMeter stream={stream} />
                  </div>
                )}
              </div>

              {mobileLayout && mobileTab === "live" && (
                <div className="shrink-0 border-t border-white/[0.08] bg-zinc-950/95 px-2 pb-1 pt-2 backdrop-blur-md">
                  {!inIqPractice && (
                    <VoiceQuickPrompts
                      recording={capture.recording}
                      setupFramingPassed={setupFramingPassed}
                      repCount={reps.length}
                      resultsReady={resultsReady}
                      className="mb-1.5"
                    />
                  )}
                  <CoachConversation
                    sessionId={live.sessionId}
                    agentId={AGENT_ID}
                    sessionReady={!live.loading}
                    resumeContext={voiceResumeContext}
                    resultsReadyAt={live.session?.results_ready_at}
                    compact
                    onTranscript={handleTranscript}
                    onStatusChange={setCoachStatus}
                  />
                </div>
              )}
            </section>
          )}

          {showSessionPanel && mobileLayout && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CoachSessionPanel {...sessionPanelProps} showScorecards={showReport} />
            </div>
          )}

          {showChatPanel && mobileLayout && (
            <TranscriptPanel
              className="min-h-0 flex-1"
              entries={transcript}
              sessionStartMs={sessionStartMs}
              fillHeight
            />
          )}

          {!mobileLayout && (
            <aside className="flex flex-col gap-4 lg:h-[calc(100vh-3rem)] lg:min-h-0">
              <CoachSessionPanel {...sessionPanelProps} />
              <TranscriptPanel
                className="min-h-0 flex-1"
                entries={transcript}
                sessionStartMs={sessionStartMs}
              />
            </aside>
          )}
        </div>

        {mobileLayout && (
          <CoachMobileTabBar
            active={mobileTab}
            onChange={setMobileTab}
            sessionBadge={showReport}
          />
        )}
      </CoachVoiceShell>
    </main>
  );
}
