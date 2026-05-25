"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import { ensureAnonymousUser, getDb } from "@/lib/firebase";
import { commandsCollectionPath, repDocPath, sessionDocPath } from "@/lib/paths";
import { parseCoachCommand, type CoachCommand, type LiveSessionDoc, type RepDoc } from "@/lib/types";

interface UseLiveSessionResult {
  sessionId: string | null;
  userId: string | null;
  session: LiveSessionDoc | null;
  reps: Record<string, RepDoc>;
  commands: CoachCommand[];
  loading: boolean;
  error: string | null;
}

/**
 * Wires up:
 *   1) anonymous Firebase Auth
 *   2) a server-side session doc created via /api/session
 *   3) a Firestore listener on live_sessions/{sid}
 *   4) listeners on the reps and commands subcollections
 *
 * Returns the consolidated state for the /coach page.
 */
export function useLiveSession(): UseLiveSessionResult {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [session, setSession] = useState<LiveSessionDoc | null>(null);
  const [reps, setReps] = useState<Record<string, RepDoc>>({});
  const [commands, setCommands] = useState<CoachCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubSession: Unsubscribe | null = null;
    let unsubReps: Unsubscribe | null = null;
    let unsubCommands: Unsubscribe | null = null;

    async function init() {
      try {
        const user = await ensureAnonymousUser();
        if (cancelled) return;
        if (user) setUserId(user.uid);
        const resp = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user?.uid ?? "anonymous",
          }),
        });
        const body = (await resp.json()) as { sessionId: string };
        if (cancelled) return;
        setSessionId(body.sessionId);

        const db = getDb();
        if (!db) {
          setError("Firebase not configured");
          setLoading(false);
          return;
        }
        const sref = doc(db, sessionDocPath(body.sessionId));
        unsubSession = onSnapshot(
          sref,
          (snap) => {
            if (!snap.exists()) {
              setSession(null);
            } else {
              setSession(snap.data() as LiveSessionDoc);
            }
          },
          (err) => setError(err.message),
        );

        const repsRef = collection(db, `${sessionDocPath(body.sessionId)}/reps`);
        unsubReps = onSnapshot(
          repsRef,
          (snap) => {
            const next: Record<string, RepDoc> = {};
            snap.forEach((d) => {
              const data = d.data() as RepDoc;
              next[data.rep_id ?? d.id] = { ...data, rep_id: data.rep_id ?? d.id };
            });
            setReps(next);
          },
          (err) => setError(err.message),
        );

        const cmdsRef = query(
          collection(db, commandsCollectionPath(body.sessionId)),
          orderBy("created_at", "asc"),
        );
        unsubCommands = onSnapshot(
          cmdsRef,
          (snap) => {
            const next: CoachCommand[] = [];
            snap.forEach((d) => {
              const cmd = parseCoachCommand(d.id, d.data() as Record<string, unknown>);
              if (cmd) next.push(cmd);
            });
            setCommands(next);
          },
          (err) => setError(err.message),
        );
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    }
    init();

    return () => {
      cancelled = true;
      unsubSession?.();
      unsubReps?.();
      unsubCommands?.();
    };
  }, []);

  return { sessionId, userId, session, reps, commands, loading, error };
}

export const _repDocPath = repDocPath;
