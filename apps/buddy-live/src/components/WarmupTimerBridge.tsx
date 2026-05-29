"use client";

import { useCallback, useEffect } from "react";
import { useConversationControls } from "@elevenlabs/react";
import { CountdownOverlay } from "@/components/CountdownOverlay";
import { useWarmupTimer } from "@/hooks/useWarmupTimer";
import { buildWarmupTimerDoneMessage } from "@/lib/hiddenAgentMessages";
import { systemTranscript } from "@/lib/transcript";
import type { CoachCommand, TranscriptEntry } from "@/lib/types";

interface Props {
  sessionId: string | null;
  commands: CoachCommand[];
  onTranscript: (entry: TranscriptEntry) => void;
  onActiveChange?: (active: boolean, label: string | null) => void;
}

export function WarmupTimerBridge({
  sessionId,
  commands,
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
    onComplete: handleComplete,
  });

  useEffect(() => {
    onActiveChange?.(timer.active, timer.label);
  }, [timer.active, timer.label, onActiveChange]);

  return (
    <CountdownOverlay
      active={timer.active}
      remainingMs={timer.remainingMs}
      variant="warmup"
      label={timer.label ?? undefined}
      phase={timer.phase}
      leadInRemainingMs={timer.leadInRemainingMs}
    />
  );
}
