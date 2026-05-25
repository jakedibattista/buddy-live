"use client";

import { useEffect, useRef } from "react";
import type { RepDoc } from "@/lib/types";

interface Options {
  sessionId: string | null;
  reps: Record<string, RepDoc>;
  /** Poll interval per pending rep. Defaults to 5s. */
  intervalMs?: number;
}

/**
 * Keeps the rep pipeline moving after capture:
 *   uploaded (no job yet) → POST /api/reps/analyze
 *   analyzing (has job_id) → POST /api/reps/refresh
 */
export function useRepResultsPolling({ sessionId, reps, intervalMs = 5_000 }: Options) {
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!sessionId) return;

    const pending = Object.values(reps).filter(
      (rep) =>
        !!rep.rep_id &&
        !rep.results &&
        rep.status !== "completed" &&
        rep.status !== "failed" &&
        rep.status !== "analyze_error",
    );
    if (pending.length === 0) return;

    let cancelled = false;
    const tick = async () => {
      await Promise.all(
        pending.map(async (rep) => {
          const key = `${sessionId}:${rep.rep_id}`;
          if (inFlightRef.current.has(key)) return;
          inFlightRef.current.add(key);
          try {
            if (
              (rep.status === "uploaded" || rep.status === "awaiting_clip") &&
              !rep.job_id &&
              rep.storage_path
            ) {
              await fetch("/api/reps/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, repId: rep.rep_id }),
              });
              return;
            }
            if (rep.job_id && rep.status !== "stub_queued") {
              await fetch("/api/reps/refresh", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, repId: rep.rep_id }),
              });
            }
          } catch {
            // swallow -- we'll retry next tick
          } finally {
            inFlightRef.current.delete(key);
          }
        }),
      );
    };

    void tick();
    const handle = window.setInterval(() => {
      if (!cancelled) void tick();
    }, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [sessionId, reps, intervalMs]);
}
