"use client";

import { Square } from "lucide-react";
import { formatCountdownMs } from "@/lib/countdown";
import { cn } from "@/lib/utils";

interface CountdownOverlayProps {
  active: boolean;
  remainingMs: number;
  variant: "recording" | "warmup";
  label?: string;
  onStop?: () => void;
  className?: string;
}

export function CountdownOverlay({
  active,
  remainingMs,
  variant,
  label,
  onStop,
  className,
}: CountdownOverlayProps) {
  if (!active) return null;

  const countdown = formatCountdownMs(remainingMs);
  const totalSec = Math.ceil(remainingMs / 1000);
  const warn = totalSec <= 3;

  if (variant === "recording") {
    return (
      <div
        className={cn(
          "pointer-events-auto absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-red-500/40 bg-black/70 px-4 py-2 text-white shadow-xl backdrop-blur",
          className,
        )}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className={`h-2 w-2 rounded-full bg-red-500 ${warn ? "animate-pulse" : ""}`} />
          REC {countdown}
        </span>
        {onStop && (
          <button
            type="button"
            onClick={onStop}
            className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold hover:bg-red-500"
          >
            <Square size={12} fill="currentColor" />
            Stop &amp; upload
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1 rounded-2xl border border-amber-400/40 bg-black/75 px-5 py-3 text-white shadow-xl backdrop-blur",
        className,
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-200/90">
        Warm-up
      </span>
      <span className="flex items-center gap-2 text-lg font-semibold tabular-nums">
        <span className={`h-2 w-2 rounded-full bg-amber-400 ${warn ? "animate-pulse" : ""}`} />
        {label ?? "Keep going"}
      </span>
      <span className={cn("text-2xl font-bold tabular-nums", warn && "text-amber-300")}>
        {countdown}
      </span>
    </div>
  );
}
