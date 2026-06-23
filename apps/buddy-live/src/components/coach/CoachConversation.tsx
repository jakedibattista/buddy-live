"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { CoachAudioMuteButton } from "@/components/coach/CoachAudioMuteButton";
import { fetchVoiceResumeContext } from "@/lib/fetchVoiceResumeContext";
import { getDb } from "@/lib/firebase";
import { coachLogCollectionPath } from "@/lib/paths";
import { coachTranscriptEntries, systemTranscript, voiceTranscriptEntry } from "@/lib/transcript";
import { cn } from "@/lib/utils";
import {
  buildResultsReadyMessage,
  buildVoiceReconnectMessage,
  isHiddenAgentMessage,
  VOICE_RESUME_FIRST_MESSAGE,
  type VoiceResumeContext,
} from "@/lib/hiddenAgentMessages";
import type { TranscriptEntry } from "@/lib/types";

interface CoachConversationProps {
  sessionId: string | null;
  agentId: string | undefined;
  sessionReady?: boolean;
  resumeContext: VoiceResumeContext;
  /** Tighter controls for mobile dock layout. */
  compact?: boolean;
  /** `results_ready_at` from the session doc — drives the results-ready push. */
  resultsReadyAt?: string | null;
  onTranscript: (entry: TranscriptEntry) => void;
  onStatusChange?: (status: string) => void;
}

const WRAP_UP_MESSAGE =
  "I'm all done for today. Please give me a quick recap and one homework cue, then say goodbye.";

// WebRTC is intentionally the primary transport (see connectSession): per
// ElevenLabs guidance it is more stable than WebSocket for live voice and is
// the documented fix for rapid disconnect/reconnect cycling. Do NOT switch the
// primary path to WebSocket without strong evidence.
const MAX_RECONNECT_ATTEMPTS = 8;
const RECONNECT_DELAYS_MS = [1000, 2000, 3000, 5000, 8000, 8000, 8000, 8000];
/** Pulse ElevenLabs so WebRTC does not idle out during silence (warm-up, recording setup, analysis). */
const SESSION_KEEPALIVE_MS = 5000;

function formatVoiceConnectionError(raw: string): string {
  if (/elevenlabs.*500|unexpected error occurred/i.test(raw)) {
    return "Coach Buddy's voice service hit a brief outage on ElevenLabs — wait a moment, then tap Start practice or Retry connection.";
  }
  if (/failed to fetch conversation token/i.test(raw)) {
    return "Couldn't get a voice session from ElevenLabs — wait a moment, then tap Start practice or Retry connection.";
  }
  return raw;
}

/** Wraps coach voice UI + mascot so both share one ElevenLabs session. */
export function CoachVoiceShell({ children }: { children: React.ReactNode }) {
  return <ConversationProvider>{children}</ConversationProvider>;
}

export function CoachConversation(props: CoachConversationProps) {
  return <CoachConversationInner {...props} />;
}

function CoachConversationInner({
  sessionId,
  agentId,
  sessionReady = true,
  resumeContext,
  resultsReadyAt,
  compact = false,
  onTranscript,
  onStatusChange,
}: CoachConversationProps) {
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const userEndedRef = useRef(false);
  const hadConnectedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const resumeContextRef = useRef(resumeContext);
  const connectSessionRef = useRef<(resume: boolean) => Promise<boolean>>(async () => false);
  const shouldSendReconnectRef = useRef(false);
  const resultsReadyHandledRef = useRef<string | null>(null);
  const resultsReadyPendingRef = useRef<string | null>(null);
  const convoRef = useRef<ReturnType<typeof useConversation> | null>(null);

  const sendResultsReadyPush = useCallback(() => {
    convoRef.current?.sendUserMessage(
      buildResultsReadyMessage(resumeContextRef.current.lastRepId),
    );
  }, []);

  const logVoiceEvent = useCallback(
    (kind: string, details: unknown) => {
      if (!sessionId) return;
      const db = getDb();
      if (!db) return;
      const d = (details ?? {}) as Record<string, unknown>;
      const ctx = resumeContextRef.current;
      let detailsJson: string | null = null;
      try {
        detailsJson = JSON.stringify(details).slice(0, 1500);
      } catch {
        detailsJson = String(details).slice(0, 500);
      }
      void addDoc(collection(db, coachLogCollectionPath(sessionId)), {
        event: "voice_drop",
        kind,
        reason: typeof d.reason === "string" ? d.reason : null,
        code: typeof d.code === "number" ? d.code : null,
        message: typeof d.message === "string" ? d.message : null,
        phase: ctx.currentPhase ?? null,
        rep_count: ctx.repCount,
        focus_drill: ctx.focusDrill ?? null,
        details_json: detailsJson,
        attempt: reconnectAttemptRef.current,
        at: serverTimestamp(),
      }).catch(() => {});
    },
    [sessionId],
  );

  useEffect(() => {
    resumeContextRef.current = resumeContext;
  }, [resumeContext]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (userEndedRef.current || !hadConnectedRef.current || !sessionId || !agentId) return;
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setError("Connection lost — tap Start practice to continue.");
      onStatusChange?.("disconnected");
      onTranscript(systemTranscript("Voice connection lost — tap Start practice to continue.", "connection"));
      return;
    }

    const delay = RECONNECT_DELAYS_MS[reconnectAttemptRef.current] ?? 8000;
    reconnectAttemptRef.current += 1;
    setReconnecting(true);
    onStatusChange?.("reconnecting");
    onTranscript(
      systemTranscript(
        `Reconnecting to Coach Buddy (${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})…`,
        "connection",
      ),
    );

    clearReconnectTimer();
    reconnectTimerRef.current = window.setTimeout(() => {
      void connectSessionRef.current(true);
    }, delay);
  }, [agentId, sessionId, clearReconnectTimer, onStatusChange, onTranscript]);

  const convo = useConversation({
    onConnect: () => {
      if (userEndedRef.current) {
        convo.endSession();
        return;
      }
      hadConnectedRef.current = true;
      reconnectAttemptRef.current = 0;
      setReconnecting(false);
      clearReconnectTimer();
      onStatusChange?.("connected");

      if (shouldSendReconnectRef.current) {
        shouldSendReconnectRef.current = false;
        // Wait briefly after onConnect to ensure the channel is fully flushed and ready
        window.setTimeout(() => {
          void (async () => {
            const ctx = resumeContextRef.current;
            const fresh = sessionId
              ? await fetchVoiceResumeContext(sessionId, {
                  warmupTimerActive: ctx.warmupTimerActive,
                  warmupTimerLabel: ctx.warmupTimerLabel,
                })
              : ctx;
            resumeContextRef.current = fresh;
            convo.sendUserMessage(buildVoiceReconnectMessage(fresh));
          })();
        }, 500);
        onTranscript(
          systemTranscript("Voice reconnected — Coach Buddy is picking up where you left off.", "connection"),
        );
      }

      // Flush a results-ready push that couldn't be sent while the link was
      // down (root cause of session live-tc0ot4sklzju never reviewing the
      // scorecard: results landed during a drop and the push was lost).
      const pending = resultsReadyPendingRef.current;
      if (pending && resultsReadyHandledRef.current !== pending && !userEndedRef.current) {
        resultsReadyHandledRef.current = pending;
        resultsReadyPendingRef.current = null;
        window.setTimeout(() => sendResultsReadyPush(), 900);
      }
    },
    onDisconnect: (details) => {
      setEnding(false);
      setReconnecting(false);
      onStatusChange?.("disconnected");

      // Log the drop reason so unexpected reconnect churn (we saw ~8 in one
      // 8-min session) is diagnosable from the browser console AND queryable
      // server-side via the session's voice_events collection.
      if (!userEndedRef.current && details?.reason !== "user") {
        console.warn(
          `[voice] unexpected disconnect (attempt ${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})`,
          details,
        );
        logVoiceEvent("unexpected_disconnect", details);
      }

      if (userEndedRef.current || details?.reason === "user") return;
      if (resumeContextRef.current.currentPhase === "recap" || resumeContextRef.current.currentPhase === "ended") {
        return;
      }
      if (!hadConnectedRef.current) return;

      scheduleReconnect();
    },
    onError: (e: unknown) => {
      const msg = formatVoiceConnectionError(e instanceof Error ? e.message : String(e));
      setError(msg);
      onStatusChange?.(`error: ${msg}`);
      if (!userEndedRef.current) {
        logVoiceEvent("voice_error", e instanceof Error ? { message: e.message, name: e.name } : e);
      }
    },
    onMessage: (msg: { source: string; message: string }) => {
      if (!msg?.message) return;
      if (msg.source === "user") {
        if (isHiddenAgentMessage(msg.message)) {
          return;
        }
        onTranscript(voiceTranscriptEntry("user", msg.message));
        return;
      }
      for (const entry of coachTranscriptEntries(msg.message)) {
        onTranscript(entry);
      }
    },
  });

  useEffect(() => {
    convoRef.current = convo;
  });

  const connectSession = useCallback(
    async (resume: boolean) => {
      if (!agentId || !sessionId) return false;

      setError(null);
      setReconnecting(resume);
      shouldSendReconnectRef.current = resume;
      if (resume) onStatusChange?.("reconnecting");

      const sessionOptions = {
        customLlmExtraBody: { arbitrary_identifier: sessionId },
        userId: sessionId,
        useWakeLock: true,
        // On reconnect, override the agent's cold first message so it doesn't
        // re-greet ("Hey! I'm Coach Buddy. What's your name?"). We immediately
        // follow with the reconnect-context message in onConnect.
        ...(resume
          ? { overrides: { agent: { firstMessage: VOICE_RESUME_FIRST_MESSAGE } } }
          : {}),
      };

      try {
        let signedUrl: string | undefined;
        let conversationToken: string | undefined;
        try {
          const resp = await fetch(`/api/eleven/signed-url?agentId=${encodeURIComponent(agentId)}`);
          const body = (await resp.json().catch(() => ({}))) as {
            signedUrl?: string;
            conversationToken?: string;
            error?: string;
            retryable?: boolean;
          };
          if (resp.ok) {
            signedUrl = body.signedUrl;
            conversationToken = body.conversationToken;
          } else if (body.error) {
            const missingKey = /ELEVENLABS_API_KEY not configured/i.test(body.error);
            if (!missingKey) {
              throw new Error(body.error);
            }
            // Private-agent credentials unavailable — fall through to public agentId connect.
          }
        } catch (credentialErr) {
          if (credentialErr instanceof Error && credentialErr.message) {
            throw credentialErr;
          }
          // Network blip — fall through to public-agent connect path.
        }

        if (conversationToken) {
          await convo.startSession({
            conversationToken,
            connectionType: "webrtc",
            ...sessionOptions,
          });
        } else if (signedUrl) {
          await convo.startSession({
            signedUrl,
            connectionType: "websocket",
            ...sessionOptions,
          });
        } else {
          await convo.startSession({
            agentId,
            connectionType: "webrtc",
            ...sessionOptions,
          });
        }

        setReconnecting(false);
        return true;
      } catch (e) {
        const msg = formatVoiceConnectionError(e instanceof Error ? e.message : String(e));
        setError(msg);
        onStatusChange?.(`error: ${msg}`);
        setReconnecting(false);
        return false;
      }
    },
    [agentId, sessionId, convo, onStatusChange, onTranscript],
  );

  connectSessionRef.current = connectSession;

  useEffect(() => {
    if (ending) {
      onStatusChange?.("wrapping up");
      return;
    }
    if (reconnecting) {
      onStatusChange?.("reconnecting");
      return;
    }
    onStatusChange?.(convo.status);
  }, [convo.status, ending, reconnecting, onStatusChange]);

  useEffect(() => {
    return () => {
      clearReconnectTimer();
    };
  }, [clearReconnectTimer]);

  // Push the agent a one-time results-ready note the moment analysis lands, so
  // the coach proactively reviews the scorecard instead of stalling/small-talk.
  // If the link is down right then, mark it pending and flush on reconnect.
  useEffect(() => {
    if (!resultsReadyAt || userEndedRef.current) return;
    if (resultsReadyHandledRef.current === resultsReadyAt) return;
    if (convo.status === "connected") {
      resultsReadyHandledRef.current = resultsReadyAt;
      resultsReadyPendingRef.current = null;
      sendResultsReadyPush();
    } else {
      resultsReadyPendingRef.current = resultsReadyAt;
    }
  }, [resultsReadyAt, convo, sendResultsReadyPush]);

  // Full-session keepalive: pulse while the voice link is up so WebRTC does not
  // idle out during silence (warm-up moves, recording setup, analysis wait,
  // coach thinking). Previously limited to warmupTimerActive || analyzingCount,
  // which left most of a 7-min warm-up unprotected (live-inibrtfoscyy: 5 drops).
  useEffect(() => {
    if (convo.status !== "connected") return;
    const handle = window.setInterval(() => {
      if (userEndedRef.current) return;
      try {
        convoRef.current?.sendUserActivity();
      } catch {
        // ignore — link may be mid-drop
      }
    }, SESSION_KEEPALIVE_MS);
    return () => window.clearInterval(handle);
  }, [convo.status]);

  // If the tab was backgrounded, WebRTC often freezes; reconnect when visible.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (userEndedRef.current || !hadConnectedRef.current) return;
      const phase = resumeContextRef.current.currentPhase;
      if (phase === "recap" || phase === "ended") return;
      if (convoRef.current?.status === "connected") return;
      if (reconnectTimerRef.current != null) return;
      logVoiceEvent("visibility_reconnect", { trigger: "tab_visible" });
      scheduleReconnect();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [scheduleReconnect, logVoiceEvent]);

  const canStart =
    sessionReady &&
    sessionId &&
    agentId &&
    convo.status === "disconnected" &&
    !ending &&
    !reconnecting;

  async function handleStart() {
    userEndedRef.current = false;
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    await connectSession(hadConnectedRef.current);
  }

  async function handleEnd() {
    userEndedRef.current = true;
    clearReconnectTimer();
    setReconnecting(false);

    if (convo.status !== "connected" || ending) {
      convo.endSession();
      return;
    }

    setEnding(true);
    setError(null);
    try {
      convo.sendUserMessage(WRAP_UP_MESSAGE);
      await new Promise((resolve) => window.setTimeout(resolve, 20000));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      convo.endSession();
      setEnding(false);
    }
  }

  return (
    <div className={cn("flex flex-col items-center", compact ? "gap-1.5" : "gap-3")}>
      <div className={cn("flex items-center", compact ? "gap-2" : "gap-3")}>
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={!canStart}
          className={cn(
            "btn-primary shadow-md motion-reduce:active:scale-100",
            compact ? "px-4 py-2 text-sm" : "px-6 py-3 text-[17px]",
            !canStart && "hover:scale-100",
          )}
        >
          {reconnecting
            ? "Reconnecting…"
            : convo.status === "connecting"
              ? "Connecting…"
              : "Start practice"}
        </button>
        {convo.status === "connected" && (
          <>
            <button
              type="button"
              onClick={() => convo.setMuted(!convo.isMuted)}
              disabled={ending}
              className={cn(
                "btn-glass disabled:opacity-50",
                compact ? "h-9 w-9" : "h-12 w-12",
              )}
              aria-label={convo.isMuted ? "Unmute mic" : "Mute mic"}
            >
              {convo.isMuted ? (
                <MicOff size={compact ? 16 : 18} />
              ) : (
                <Mic size={compact ? 16 : 18} />
              )}
            </button>
            <CoachAudioMuteButton compact={compact} />
            <button
              type="button"
              onClick={() => void handleEnd()}
              disabled={ending}
              className={cn(
                "flex items-center justify-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700 disabled:opacity-60",
                compact ? "h-9 w-9" : "h-12 w-12",
              )}
              aria-label="End session"
            >
              <PhoneOff size={compact ? 16 : 18} />
            </button>
          </>
        )}
      </div>
      <div className={cn("text-zinc-400", compact ? "text-[10px]" : "text-xs")}>
        {ending && <span className="text-amber-300">Wrapping up…</span>}
        {!ending && reconnecting && <span className="text-amber-300">Reconnecting to Coach Buddy…</span>}
        {!ending && !reconnecting && !sessionReady && <span>Starting session…</span>}
        {!ending && !reconnecting && sessionReady && convo.status === "connected" && (
          <span className="text-brand">Live · {convo.mode}</span>
        )}
        {!ending && !reconnecting && sessionReady && convo.status === "disconnected" && !error && (
          <span>Ready</span>
        )}
        {error && (
          <span className="flex flex-col items-center gap-2">
            <span className="text-red-400">Couldn&apos;t connect — {error}</span>
            {convo.status === "disconnected" && !reconnecting && (
              <button
                type="button"
                onClick={() => void handleStart()}
                className="btn-glass px-3 py-1 text-zinc-200"
              >
                Retry connection
              </button>
            )}
          </span>
        )}
        {!agentId && (
          <span className="text-yellow-300">Set NEXT_PUBLIC_ELEVENLABS_AGENT_ID</span>
        )}
      </div>
    </div>
  );
}
