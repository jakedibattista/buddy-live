"use client";

import { useCallback, useEffect } from "react";
import { useConversationControls } from "@elevenlabs/react";
import { CountdownOverlay } from "@/components/camera/CountdownOverlay";
import { useWarmupTimer } from "@/hooks/useWarmupTimer";
import { buildWarmupTimerDoneMessage } from "@/lib/hiddenAgentMessages";
import { systemTranscript } from "@/lib/transcript";
import type { CoachCommand, TranscriptEntry } from "@/lib/types";

interface Props {
  sessionId: string | null;
  commands: CoachCommand[];
  /** Only show and accept timers during the warmup phase. */
  enabled?: boolean;
  onTranscript: (entry: TranscriptEntry) => void;
  onActiveChange?: (active: boolean, label: string | null) => void;
}

export function WarmupTimerBridge({
  sessionId,
  commands,
  enabled = true,
  onTranscript,
  onActiveChange,
}: Props) {
  const { sendUserMessage } = useConversationControls();

  const handleComplete = useCallback(
    (exercise: string, label: string) => {
      onTranscript(systemTranscript(`Time's up — ${label} done.`, "info"));
      sendUserMessage(buildWarmupTimerDoneMessage(exercise));
    },
    [onTranscript, sendUserMessage],
  );

  const timer = useWarmupTimer({
    sessionId,
    commands,
    enabled,
    onComplete: handleComplete,
  });

  const overlayActive = enabled && timer.active;

  useEffect(() => {
    onActiveChange?.(overlayActive, overlayActive ? timer.label : null);
  }, [overlayActive, timer.label, onActiveChange]);

  return (
    <CountdownOverlay
      active={overlayActive}
      remainingMs={timer.remainingMs}
      variant="warmup"
      label={timer.label ?? undefined}
      phase={timer.phase}
      leadInRemainingMs={timer.leadInRemainingMs}
    />
  );
}
