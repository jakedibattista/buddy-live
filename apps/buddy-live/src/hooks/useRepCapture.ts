"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { commandsCollectionPath } from "@/lib/paths";
import type { CoachCommand } from "@/lib/types";

interface Options {
  sessionId: string | null;
  /** Media stream from the camera (audio+video). */
  stream: MediaStream | null;
  /** Commands list from the live session listener. */
  commands: CoachCommand[];
  /** Max rep duration before auto-stopping. Default 12s. */
  maxRepMs?: number;
}

interface CaptureState {
  recording: boolean;
  activeRepId: string | null;
  activeDrillId: string | null;
  hint: string | null;
  lastUpload: { repId: string; status: "uploading" | "uploaded" | "error"; error?: string } | null;
}

const PREFERRED_MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const mt of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mt)) return mt;
  }
  return undefined;
}

/**
 * Subscribes to start_capture commands written by the ADK `start_rep_capture`
 * tool, runs MediaRecorder on the active stream, uploads the resulting clip to
 * /api/clips/upload, and marks the matching command as handled so we don't
 * record it twice.
 */
export function useRepCapture({ sessionId, stream, commands, maxRepMs = 12_000 }: Options) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const handledIdsRef = useRef<Set<string>>(new Set());
  const [state, setState] = useState<CaptureState>({
    recording: false,
    activeRepId: null,
    activeDrillId: null,
    hint: null,
    lastUpload: null,
  });

  const upload = useCallback(
    async (repId: string, drillId: string, blob: Blob) => {
      if (!sessionId) return;
      setState((s) => ({ ...s, lastUpload: { repId, status: "uploading" } }));
      try {
        const form = new FormData();
        form.append("sessionId", sessionId);
        form.append("repId", repId);
        form.append("drillId", drillId);
        form.append("clip", blob, `${repId}.webm`);
        const resp = await fetch("/api/clips/upload", { method: "POST", body: form });
        if (!resp.ok) throw new Error(`upload ${resp.status}`);
        setState((s) => ({ ...s, lastUpload: { repId, status: "uploaded" } }));
      } catch (e) {
        setState((s) => ({
          ...s,
          lastUpload: {
            repId,
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          },
        }));
      }
    },
    [sessionId],
  );

  const stopRecording = useCallback(() => {
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
  }, []);

  const startRecording = useCallback(
    (repId: string, drillId: string, hint: string | null) => {
      if (!stream) return;
      stopRecording();
      const mimeType = pickMimeType();
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
        void upload(repId, drillId, blob);
        setState((s) => ({
          ...s,
          recording: false,
          activeRepId: null,
          activeDrillId: null,
          hint: null,
        }));
      };
      rec.start();
      setState({
        recording: true,
        activeRepId: repId,
        activeDrillId: drillId,
        hint,
        lastUpload: null,
      });
      stopTimerRef.current = window.setTimeout(stopRecording, maxRepMs);
    },
    [stream, maxRepMs, stopRecording, upload],
  );

  // React to start_capture commands as they arrive.
  useEffect(() => {
    if (!sessionId) return;
    for (const cmd of commands) {
      if (handledIdsRef.current.has(cmd.id)) continue;
      if (cmd.type !== "start_capture") continue;
      handledIdsRef.current.add(cmd.id);
      startRecording(cmd.rep_id, cmd.drill_id, cmd.hint ?? null);
      // Best-effort: mark the command as handled so the UI doesn't re-show it.
      const db = getDb();
      if (db) {
        void updateDoc(doc(db, `${commandsCollectionPath(sessionId)}/${cmd.id}`), {
          handled: true,
        }).catch(() => {});
      }
    }
  }, [commands, sessionId, startRecording]);

  useEffect(() => () => stopRecording(), [stopRecording]);

  return useMemo(
    () => ({ ...state, stopRecording }),
    [state, stopRecording],
  );
}
