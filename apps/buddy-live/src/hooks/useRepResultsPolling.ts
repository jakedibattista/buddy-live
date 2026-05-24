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
 * Pings `/api/reps/refresh` for any rep that has been queued for analysis but
 * doesn't yet have `results`. The route owns the model API key, polls
 * `/api/job-status/{jobId}` server-side, and writes `results` back into the
 * rep doc — which the existing Firestore listener then surfaces in the side
 * panel.
 *
 * Idempotent: once a rep has `results`, we stop polling it.
 */
export function useRepResultsPolling({ sessionId, reps, intervalMs = 5_000 }: Options) {
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!sessionId) return;

    const pending = Object.values(reps).filter(
      (rep) =>
        !!rep.rep_id &&
        !rep.results &&
        !!rep.job_id &&
        rep.status !== "completed" &&
        rep.status !== "failed",
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
            await fetch("/api/reps/refresh", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId, repId: rep.rep_id }),
            });
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
