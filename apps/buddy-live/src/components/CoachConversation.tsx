"use client";

import { useEffect, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { CoachAudioMuteButton } from "@/components/CoachAudioMuteButton";
import { coachTranscriptEntries, voiceTranscriptEntry } from "@/lib/transcript";
import { cn } from "@/lib/utils";
import type { TranscriptEntry } from "@/lib/types";

interface CoachConversationProps {
  sessionId: string | null;
  agentId: string | undefined;
  sessionReady?: boolean;
  onTranscript: (entry: TranscriptEntry) => void;
  onStatusChange?: (status: string) => void;
}

const WRAP_UP_MESSAGE =
  "I'm all done for today. Please give me a quick recap and one homework cue, then say goodbye.";

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
  onTranscript,
  onStatusChange,
}: CoachConversationProps) {
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const convo = useConversation({
    onConnect: () => onStatusChange?.("connected"),
    onDisconnect: () => {
      setEnding(false);
      onStatusChange?.("disconnected");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      onStatusChange?.(`error: ${msg}`);
    },
    onMessage: (msg: { source: string; message: string }) => {
      if (!msg?.message) return;
      if (msg.source === "user") {
        onTranscript(voiceTranscriptEntry("user", msg.message));
        return;
      }
      for (const entry of coachTranscriptEntries(msg.message)) {
        onTranscript(entry);
      }
    },
  });

  useEffect(() => {
    if (ending) {
      onStatusChange?.("wrapping up");
      return;
    }
    onStatusChange?.(convo.status);
  }, [convo.status, ending, onStatusChange]);

  const canStart =
    sessionReady && sessionId && agentId && convo.status === "disconnected" && !ending;

  async function handleStart() {
    if (!agentId || !sessionId) return;
    setError(null);
    try {
      let signedUrl: string | undefined;
      try {
        const resp = await fetch(`/api/eleven/signed-url?agentId=${encodeURIComponent(agentId)}`);
        if (resp.ok) {
          const body = (await resp.json()) as { signedUrl?: string };
          signedUrl = body.signedUrl;
        }
      } catch {
        // public agent path
      }
      if (signedUrl) {
        await convo.startSession({
          signedUrl,
          connectionType: "websocket",
          customLlmExtraBody: { arbitrary_identifier: sessionId },
          userId: sessionId,
        });
      } else {
        await convo.startSession({
          agentId,
          connectionType: "webrtc",
          customLlmExtraBody: { arbitrary_identifier: sessionId },
          userId: sessionId,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleEnd() {
    if (convo.status !== "connected" || ending) {
      convo.endSession();
      return;
    }

    setEnding(true);
    setError(null);
    try {
      convo.sendUserMessage(WRAP_UP_MESSAGE);
      // Give Coach Buddy time to call end_session_recap and speak the goodbye.
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
          onClick={handleStart}
          disabled={!canStart}
          className={cn(
            "rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-black shadow-lg transition-transform hover:scale-[1.02] active:scale-95",
            !canStart && "cursor-not-allowed opacity-50 hover:scale-100",
          )}
        >
          {convo.status === "connecting" ? "Connecting…" : "Start session"}
        </button>
        {convo.status === "connected" && (
          <>
            <button
              type="button"
              onClick={() => convo.setMuted(!convo.isMuted)}
              disabled={ending}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-colors hover:bg-white/10 disabled:opacity-50"
              aria-label={convo.isMuted ? "Unmute mic" : "Mute mic"}
            >
              {convo.isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <CoachAudioMuteButton />
            <button
              type="button"
              onClick={handleEnd}
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
        {!ending && !sessionReady && <span>Starting session…</span>}
        {!ending && sessionReady && convo.status === "connected" && (
          <span className="text-emerald-400">Live · {convo.mode}</span>
        )}
        {!ending && sessionReady && convo.status === "disconnected" && !error && (
          <span>Ready</span>
        )}
        {error && (
          <span className="flex flex-col items-center gap-2">
            <span className="text-red-400">Couldn&apos;t connect — {error}</span>
            {convo.status === "disconnected" && (
              <button
                type="button"
                onClick={() => void handleStart()}
                className="rounded-full border border-white/15 px-3 py-1 text-zinc-200 hover:bg-white/10"
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
