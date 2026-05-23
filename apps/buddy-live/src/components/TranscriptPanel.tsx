"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { TranscriptEntry } from "@/lib/types";

interface Props {
  entries: TranscriptEntry[];
  className?: string;
}

export function TranscriptPanel({ entries, className }: Props) {
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
      {entries.length === 0 && (
        <div className="text-zinc-500">
          Waiting for the session to start. Hit <span className="text-zinc-200">Start</span> below.
        </div>
      )}
      {entries.map((e) => (
        <div key={e.id} className={cn("flex flex-col", e.role === "user" ? "items-end" : "items-start")}>
          <span className="mb-0.5 text-[10px] uppercase tracking-widest text-zinc-500">
            {e.role === "user" ? "You" : "Coach Buddy"}
          </span>
          <span
            className={cn(
              "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug",
              e.role === "user" ? "bg-emerald-500/90 text-black" : "bg-white/10 text-white",
            )}
          >
            {e.text}
          </span>
        </div>
      ))}
    </div>
  );
}
