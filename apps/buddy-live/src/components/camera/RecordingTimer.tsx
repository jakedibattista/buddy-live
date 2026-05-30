"use client";

import { useEffect, useState } from "react";
import { CountdownOverlay } from "@/components/camera/CountdownOverlay";
import { MAX_REP_RECORDING_MS } from "@/lib/recording";

interface RecordingTimerProps {
  recording: boolean;
  onStop: () => void;
}

export function RecordingTimer({ recording, onStop }: RecordingTimerProps) {
  const [remainingMs, setRemainingMs] = useState(MAX_REP_RECORDING_MS);

  useEffect(() => {
    if (!recording) {
      setRemainingMs(MAX_REP_RECORDING_MS);
      return;
    }

    const startedAt = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      setRemainingMs(Math.max(0, MAX_REP_RECORDING_MS - elapsed));
    };
    tick();
    const handle = window.setInterval(tick, 250);
    return () => window.clearInterval(handle);
  }, [recording]);

  return (
    <CountdownOverlay
      active={recording}
      remainingMs={remainingMs}
      variant="recording"
      onStop={onStop}
    />
  );
}
