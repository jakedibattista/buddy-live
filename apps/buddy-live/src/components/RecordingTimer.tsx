"use client";

import { useEffect, useState } from "react";
import { Square } from "lucide-react";
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

  if (!recording) return null;

  const totalSec = Math.ceil(remainingMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const warn = totalSec <= 10;

  return (
    <div className="pointer-events-auto absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-red-500/40 bg-black/70 px-4 py-2 text-white shadow-xl backdrop-blur">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <span className={`h-2 w-2 rounded-full bg-red-500 ${warn ? "animate-pulse" : ""}`} />
        REC {mins}:{secs.toString().padStart(2, "0")}
      </span>
      <button
        type="button"
        onClick={onStop}
        className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold hover:bg-red-500"
      >
        <Square size={12} fill="currentColor" />
        Stop &amp; upload
      </button>
    </div>
  );
}
