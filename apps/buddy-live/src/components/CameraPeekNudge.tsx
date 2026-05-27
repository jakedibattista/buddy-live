"use client";

import { useEffect, useRef } from "react";
import { useConversationControls, useConversationStatus } from "@elevenlabs/react";
import { CAMERA_RECHECK_MESSAGE } from "@/lib/hiddenAgentMessages";

interface Props {
  currentPhase?: string | null;
  setupFramingPassed: boolean;
  peekStatusUpdatedAt?: string;
}

// Minimum seconds since the last persisted peek before we nudge again.
const STALE_THRESHOLD_MS = 10_000;
// Minimum seconds between consecutive nudges so we never spam the agent.
const NUDGE_INTERVAL_MS = 12_000;

/**
 * Sits inside CoachVoiceShell. When the session is in `stance_check` and the
 * framing banner has been showing without a fresh peek for >10s, silently asks
 * Coach Buddy to re-call peek_camera. This stops the "head to toes" banner
 * from getting stuck after the player actually fixes their framing — the
 * agent's own prompt says to repeat peek_camera but sometimes it stalls.
 */
export function CameraPeekNudge({
  currentPhase,
  setupFramingPassed,
  peekStatusUpdatedAt,
}: Props) {
  const { status } = useConversationStatus();
  const { sendUserMessage } = useConversationControls();
  const lastNudgeAtRef = useRef(0);

  const connected = status === "connected";
  const inStanceCheck = currentPhase === "stance_check";
  const shouldWatch = connected && inStanceCheck && !setupFramingPassed;

  useEffect(() => {
    if (!shouldWatch) {
      lastNudgeAtRef.current = 0;
      return;
    }

    const tick = () => {
      const now = Date.now();
      const peekAgeMs = peekStatusUpdatedAt
        ? now - Date.parse(peekStatusUpdatedAt)
        : Number.POSITIVE_INFINITY;
      const sinceLastNudgeMs = now - lastNudgeAtRef.current;

      if (peekAgeMs < STALE_THRESHOLD_MS) return;
      if (sinceLastNudgeMs < NUDGE_INTERVAL_MS) return;

      lastNudgeAtRef.current = now;
      try {
        sendUserMessage(CAMERA_RECHECK_MESSAGE);
      } catch {
        // best-effort: ElevenLabs may be momentarily disconnected
      }
    };

    tick();
    const handle = window.setInterval(tick, 3000);
    return () => window.clearInterval(handle);
  }, [shouldWatch, peekStatusUpdatedAt, sendUserMessage]);

  return null;
}
