"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { commandsCollectionPath } from "@/lib/paths";
import type { CoachCommand } from "@/lib/types";

interface ActiveWarmupTimer {
  exercise: string;
  label: string;
  durationMs: number;
  startedAt: number;
}

export interface WarmupTimerState {
  active: boolean;
  label: string | null;
  exercise: string | null;
  remainingMs: number;
}

interface Options {
  sessionId: string | null;
  commands: CoachCommand[];
  onComplete?: (exercise: string, label: string) => void;
}

export function useWarmupTimer({ sessionId, commands, onComplete }: Options): WarmupTimerState {
  const [activeTimer, setActiveTimer] = useState<ActiveWarmupTimer | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const handledIdsRef = useRef<Set<string>>(new Set());
  const completedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    for (const cmd of commands) {
      if (handledIdsRef.current.has(cmd.id)) continue;
      if (cmd.type !== "start_warmup_timer") continue;

      handledIdsRef.current.add(cmd.id);
      const durationMs = Math.max(10, cmd.duration_seconds) * 1000;
      setActiveTimer({
        exercise: cmd.exercise,
        label: cmd.label,
        durationMs,
        startedAt: Date.now(),
      });
      setRemainingMs(durationMs);
      completedRef.current = null;

      const db = getDb();
      if (db) {
        void updateDoc(doc(db, `${commandsCollectionPath(sessionId)}/${cmd.id}`), {
          handled: true,
        }).catch(() => {});
      }
    }
  }, [commands, sessionId]);

  useEffect(() => {
    if (!activeTimer) {
      setRemainingMs(0);
      return;
    }

    const tick = () => {
      const elapsed = Date.now() - activeTimer.startedAt;
      const next = Math.max(0, activeTimer.durationMs - elapsed);
      setRemainingMs(next);

      if (next === 0 && completedRef.current !== activeTimer.exercise) {
        completedRef.current = activeTimer.exercise;
        onComplete?.(activeTimer.exercise, activeTimer.label);
        setActiveTimer(null);
      }
    };

    tick();
    const handle = window.setInterval(tick, 250);
    return () => window.clearInterval(handle);
  }, [activeTimer, onComplete]);

  return useMemo(
    () => ({
      active: activeTimer != null,
      label: activeTimer?.label ?? null,
      exercise: activeTimer?.exercise ?? null,
      remainingMs,
    }),
    [activeTimer, remainingMs],
  );
}
