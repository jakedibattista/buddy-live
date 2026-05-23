"use client";

import { useEffect, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranscriptEntry } from "@/lib/types";

interface CoachConversationProps {
  sessionId: string | null;
  agentId: string | undefined;
  onTranscript: (entry: TranscriptEntry) => void;
  onStatusChange?: (status: string) => void;
}

export function CoachConversation(props: CoachConversationProps) {
  return (
    <ConversationProvider>
      <CoachConversationInner {...props} />
    </ConversationProvider>
  );
}

function CoachConversationInner({
  sessionId,
  agentId,
  onTranscript,
  onStatusChange,
}: CoachConversationProps) {
  const [error, setError] = useState<string | null>(null);
  const convo = useConversation({
    onConnect: () => onStatusChange?.("connected"),
    onDisconnect: () => onStatusChange?.("disconnected"),
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      onStatusChange?.(`error: ${msg}`);
    },
    onMessage: (msg: { source: string; message: string }) => {
      if (!msg?.message) return;
      onTranscript({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: msg.source === "user" ? "user" : "coach",
        text: msg.message,
        ts: Date.now(),
      });
    },
  });

  useEffect(() => {
    onStatusChange?.(convo.status);
  }, [convo.status, onStatusChange]);

  const canStart = sessionId && agentId && convo.status === "disconnected";

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

  function handleEnd() {
    convo.endSession();
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
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-colors hover:bg-white/10"
              aria-label={convo.isMuted ? "Unmute" : "Mute"}
            >
              {convo.isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              type="button"
              onClick={handleEnd}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700"
              aria-label="End session"
            >
              <PhoneOff size={18} />
            </button>
          </>
        )}
      </div>
      <div className="text-xs text-zinc-400">
        {convo.status === "connected" && (
          <span className="text-emerald-400">Live · {convo.mode}</span>
        )}
        {convo.status === "disconnected" && !error && <span>Ready</span>}
        {error && <span className="text-red-400">{error}</span>}
        {!agentId && (
          <span className="text-yellow-300">Set NEXT_PUBLIC_ELEVENLABS_AGENT_ID</span>
        )}
      </div>
    </div>
  );
}
