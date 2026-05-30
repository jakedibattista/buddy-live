"use client";

import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CoachActivityIndicator } from "@/components/coach/CoachActivityIndicator";
import { formatTranscriptElapsed, formatTranscriptTime } from "@/lib/transcript";
import { cn } from "@/lib/utils";
import type { TranscriptEntry } from "@/lib/types";

// How far from the bottom (in px) still counts as "pinned to latest" — gives
// the user a little slack so a 1-2px scroll difference doesn't pause auto-scroll.
const STICK_TO_BOTTOM_THRESHOLD_PX = 32;

interface Props {
  entries: TranscriptEntry[];
  sessionStartMs?: number;
  className?: string;
}

function roleLabel(entry: TranscriptEntry): string | null {
  if (entry.role === "user") return "You";
  if (entry.role === "coach") return "Coach Buddy";
  return null;
}

function timeLabel(entry: TranscriptEntry, sessionStartMs?: number): string {
  const clock = formatTranscriptTime(entry.ts);
  if (sessionStartMs == null) return clock;
  const elapsed = formatTranscriptElapsed(entry.ts, sessionStartMs);
  const ageSec = (Date.now() - entry.ts) / 1000;
  if (ageSec > 30) return `${clock} · ${elapsed}`;
  return clock;
}

export function TranscriptPanel({ entries, sessionStartMs, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Track whether the user has scrolled up to read older messages. While
  // they're reading, we stop auto-scrolling so new entries don't yank the
  // panel back down. A "Jump to latest" button appears in the bottom-right.
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (pinnedToBottom) {
      el.scrollTop = el.scrollHeight;
      setHasNew(false);
    } else {
      setHasNew(true);
    }
  }, [entries, pinnedToBottom]);

  function handleScroll() {
    const el = ref.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    setPinnedToBottom(distanceFromBottom <= STICK_TO_BOTTOM_THRESHOLD_PX);
  }

  function jumpToLatest() {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setPinnedToBottom(true);
    setHasNew(false);
  }

  return (
    <div
      className={cn(
        "relative rounded-2xl border border-zinc-800/60 bg-zinc-900/40 text-white shadow-sm backdrop-blur-md flex flex-col min-h-0 h-80 lg:h-auto",
        className,
      )}
    >
      <div
        ref={ref}
        onScroll={handleScroll}
        className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto p-4 text-sm"
      >
        <CoachActivityIndicator className="mb-1 shrink-0" />

      {entries.length === 0 && (
        <div className="text-zinc-500">
          Waiting for the session to start. Hit <span className="text-zinc-200">Start</span> below.
        </div>
      )}

      {entries.map((e) => {
        if (e.role === "system") {
          return (
            <div key={e.id} className="flex justify-center py-0.5">
              <span
                className={cn(
                  "max-w-[95%] rounded-full px-3 py-1 text-center text-[11px] leading-snug",
                  e.kind === "error" && "bg-red-500/15 text-red-200",
                  e.kind === "peek" && "bg-amber-500/15 text-amber-100",
                  e.kind === "recording" && "bg-red-500/15 text-red-100",
                  e.kind === "upload" && "bg-sky-500/15 text-sky-100",
                  e.kind === "analysis" && "bg-sky-500/15 text-sky-100",
                  e.kind === "connection" && "bg-white/10 text-zinc-300",
                  (!e.kind || e.kind === "info") && "bg-white/8 text-zinc-400",
                )}
              >
                {e.text}
              </span>
            </div>
          );
        }

        const label = roleLabel(e);
        return (
          <div
            key={e.id}
            className={cn("flex flex-col", e.role === "user" ? "items-end" : "items-start")}
          >
            {label && (
              <div
                className={cn(
                  "mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500",
                  e.role === "user" && "flex-row-reverse",
                )}
              >
                <span>{label}</span>
                <span className="normal-case tracking-normal text-zinc-600">
                  {timeLabel(e, sessionStartMs)}
                </span>
              </div>
            )}
            <span
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug",
                e.role === "user" ? "bg-[#0066cc] text-white" : "bg-zinc-800/80 text-white",
              )}
            >
              {e.text}
            </span>
          </div>
        );
      })}
      </div>
      {!pinnedToBottom && (
        <button
          type="button"
          onClick={jumpToLatest}
          className={cn(
            "absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 backdrop-blur-md transition-all hover:border-zinc-700 hover:bg-zinc-800/80 hover:scale-[1.01] shadow-sm",
            hasNew
              ? "bg-[#0066cc] text-white hover:bg-[#0071e3]"
              : "bg-black/70 hover:bg-white/10",
          )}
        >
          <ArrowDown size={12} />
          {hasNew ? "New messages" : "Jump to latest"}
        </button>
      )}
    </div>
  );
}
