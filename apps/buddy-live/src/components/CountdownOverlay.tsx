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
  // Recording: light warning at ≤5s, hard pulse at ≤3s.
  const warn = totalSec <= 5;
  const urgent = totalSec <= 3;

  if (variant === "recording") {
    return (
      <div
        className={cn(
          "pointer-events-auto absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-black/70 px-4 py-2 text-white shadow-xl backdrop-blur transition-colors",
          urgent
            ? "border-red-400 bg-red-950/80 animate-pulse"
            : warn
              ? "border-amber-400/60 bg-amber-950/40"
              : "border-red-500/40",
          className,
        )}
      >
        <span className="flex items-center gap-2 text-sm font-semibold tabular-nums">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              urgent ? "bg-red-300 animate-pulse" : warn ? "bg-amber-300 animate-pulse" : "bg-red-500",
            )}
          />
          REC {countdown}
          <span className="hidden sm:inline text-zinc-300 text-xs font-normal border-l border-white/20 pl-2">
            Say &quot;stop&quot; or hit the button when done
          </span>
          <span className="inline sm:hidden text-zinc-300 text-[10px] font-normal border-l border-white/20 pl-2">
            Say &quot;stop&quot; or hit button
          </span>
          {warn && !urgent && (
            <span className="ml-1 text-[10px] uppercase tracking-widest text-amber-200">
              auto-stop soon
            </span>
          )}
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
        <span className={`h-2 w-2 rounded-full bg-amber-400 ${urgent ? "animate-pulse" : ""}`} />
        {label ?? "Keep going"}
      </span>
      <span className={cn("text-2xl font-bold tabular-nums", urgent && "text-amber-300")}>
        {countdown}
      </span>
    </div>
  );
}
