"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { CoachAudioMuteButton } from "@/components/coach/CoachAudioMuteButton";
import { coachTranscriptEntries, systemTranscript, voiceTranscriptEntry } from "@/lib/transcript";
import { cn } from "@/lib/utils";
import {
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
  /** Hidden system message sent once on the first voice connect (not reconnect). */
  sessionBootstrapMessage?: string | null;
  onTranscript: (entry: TranscriptEntry) => void;
  onStatusChange?: (status: string) => void;
}

const WRAP_UP_MESSAGE =
  "I'm all done for today. Please give me a quick recap and one homework cue, then say goodbye.";

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS_MS = [1000, 2000, 3000, 5000, 8000];

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
  sessionBootstrapMessage = null,
  onTranscript,
  onStatusChange,
}: CoachConversationProps) {
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const userEndedRef = useRef(false);
  const hadConnectedRef = useRef(false);
  const bootstrapSentRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const resumeContextRef = useRef(resumeContext);
  const bootstrapMessageRef = useRef(sessionBootstrapMessage);
  const connectSessionRef = useRef<(resume: boolean) => Promise<boolean>>(async () => false);
  const shouldSendReconnectRef = useRef(false);

  useEffect(() => {
    resumeContextRef.current = resumeContext;
  }, [resumeContext]);

  useEffect(() => {
    bootstrapMessageRef.current = sessionBootstrapMessage;
  }, [sessionBootstrapMessage]);

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
          convo.sendUserMessage(buildVoiceReconnectMessage(resumeContextRef.current));
        }, 500);
        onTranscript(
          systemTranscript("Voice reconnected — Coach Buddy is picking up where you left off.", "connection"),
        );
      } else {
        const bootstrap = bootstrapMessageRef.current;
        if (bootstrap && !bootstrapSentRef.current) {
          bootstrapSentRef.current = true;
          window.setTimeout(() => {
            convo.sendUserMessage(bootstrap);
          }, 800);
        }
      }
    },
    onDisconnect: (details) => {
      setEnding(false);
      setReconnecting(false);
      onStatusChange?.("disconnected");

      // Log the drop reason so unexpected reconnect churn (we saw 13 in one
      // 16-min session) is diagnosable from the browser console.
      if (!userEndedRef.current && details?.reason !== "user") {
        console.warn(
          `[voice] unexpected disconnect (attempt ${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})`,
          details,
        );
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
            throw new Error(body.error);
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
      await new Promise((resolve) => window.setTimeout(resolve, 12000));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      convo.endSession();
      setEnding(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={!canStart}
          className={cn(
            "btn-primary px-6 py-3 text-[17px] shadow-md motion-reduce:active:scale-100",
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
              className="btn-glass h-12 w-12 disabled:opacity-50"
              aria-label={convo.isMuted ? "Unmute mic" : "Mute mic"}
            >
              {convo.isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <CoachAudioMuteButton />
            <button
              type="button"
              onClick={() => void handleEnd()}
              disabled={ending}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700 disabled:opacity-60"
              aria-label="End session"
            >
              <PhoneOff size={18} />
            </button>
          </>
        )}
      </div>
      <div className="text-xs text-zinc-400">
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
