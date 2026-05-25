"use client";

import { useEffect, useRef } from "react";
import { CoachActivityIndicator } from "@/components/CoachActivityIndicator";
import { formatTranscriptElapsed, formatTranscriptTime } from "@/lib/transcript";
import { cn } from "@/lib/utils";
import type { TranscriptEntry } from "@/lib/types";

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
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <div
      ref={ref}
      className={cn(
        "flex max-h-72 flex-col gap-2 overflow-y-auto rounded-2xl border border-white/10 bg-black/50 p-4 text-sm text-white shadow-xl backdrop-blur",
        className,
      )}
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
                  e.kind === "analysis" && "bg-emerald-500/15 text-emerald-100",
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
                e.role === "user" ? "bg-emerald-500/90 text-black" : "bg-white/10 text-white",
              )}
            >
              {e.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
