"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { commandsCollectionPath, repDocPath } from "@/lib/paths";
import { MAX_REP_RECORDING_MS, MIN_REP_CLIP_BYTES } from "@/lib/recording";
import type { CoachCommand } from "@/lib/types";

/**
 * Record a clip-upload failure where the backend watchdog, the coach
 * (get_rep_result -> "clip_failed"), and session monitoring can all see it.
 * Without this, a failed upload left the rep stuck in "awaiting_clip" forever
 * and the failure was invisible (no frontend error tracking).
 */
function reportClipFailure(sessionId: string, repId: string, error: string) {
  console.error(`[rep ${repId}] clip upload failed: ${error}`);
  const db = getDb();
  if (db) {
    void updateDoc(doc(db, repDocPath(sessionId, repId)), {
      status: "clip_failed",
      clip_error: error,
      clip_failed_at: new Date().toISOString(),
    }).catch(() => {});
  }
}

interface Options {
  sessionId: string | null;
  /** Media stream from the camera (audio+video). */
  stream: MediaStream | null;
  /** Commands list from the live session listener. */
  commands: CoachCommand[];
  /** Max rep duration before auto-stopping. Default 60s. */
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

async function queueAnalysis(sessionId: string, repId: string) {
  try {
    await fetch("/api/reps/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, repId }),
    });
  } catch {
    // analyze_rep from the agent may still pick this up
  }
}

/**
 * Subscribes to start_capture / stop_capture commands written by the ADK rep
 * tools, runs MediaRecorder on the active stream, uploads the clip to
 * /api/clips/upload, and queues analysis via /api/reps/analyze.
 */
export function useRepCapture({
  sessionId,
  stream,
  commands,
  maxRepMs = MAX_REP_RECORDING_MS,
}: Options) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const handledIdsRef = useRef<Set<string>>(new Set());
  const activeRepRef = useRef<{ repId: string; drillId: string } | null>(null);
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
      if (blob.size < MIN_REP_CLIP_BYTES) {
        const error = "Clip too short — try again";
        setState((s) => ({
          ...s,
          lastUpload: { repId, status: "error", error },
        }));
        reportClipFailure(sessionId, repId, error);
        return;
      }
      setState((s) => ({ ...s, lastUpload: { repId, status: "uploading" } }));
      try {
        const contentType = blob.type.includes("mp4") ? "video/mp4" : "video/webm";

        // 1. Mint a signed upload URL (tiny request — avoids Vercel's 4.5 MB
        //    serverless body cap that previously 413'd multi-second clips).
        const urlResp = await fetch("/api/clips/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, repId, contentType }),
        });
        if (!urlResp.ok) throw new Error(`upload-url ${urlResp.status}`);
        const { uploadUrl, storagePath, stub } = (await urlResp.json()) as {
          uploadUrl?: string;
          storagePath?: string;
          stub?: boolean;
        };

        // Admin not configured (e.g. local without keys): nothing to upload to.
        if (stub || !uploadUrl || !storagePath) {
          setState((s) => ({ ...s, lastUpload: { repId, status: "uploaded" } }));
          return;
        }

        // 2. PUT the clip straight to Firebase Storage (no Vercel size limit).
        const putResp = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: blob,
        });
        if (!putResp.ok) throw new Error(`storage ${putResp.status}`);

        // 3. Finalize: write the rep doc + signed read URL so analyze_rep runs.
        const finResp = await fetch("/api/clips/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, repId, drillId, storagePath, contentType }),
        });
        if (!finResp.ok) throw new Error(`finalize ${finResp.status}`);

        setState((s) => ({ ...s, lastUpload: { repId, status: "uploaded" } }));
        await queueAnalysis(sessionId, repId);
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        setState((s) => ({
          ...s,
          lastUpload: { repId, status: "error", error },
        }));
        reportClipFailure(sessionId, repId, error);
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
      activeRepRef.current = { repId, drillId };
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        const active = activeRepRef.current;
        activeRepRef.current = null;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
        if (active) {
          void upload(active.repId, active.drillId, blob);
        }
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

  // React to capture commands as they arrive.
  useEffect(() => {
    if (!sessionId) return;
    for (const cmd of commands) {
      if (handledIdsRef.current.has(cmd.id)) continue;

      if (cmd.type === "stop_capture") {
        handledIdsRef.current.add(cmd.id);
        if (state.recording && state.activeRepId === cmd.rep_id) {
          stopRecording();
        }
        const db = getDb();
        if (db) {
          void updateDoc(doc(db, `${commandsCollectionPath(sessionId)}/${cmd.id}`), {
            handled: true,
          }).catch(() => {});
        }
        continue;
      }

      if (cmd.type !== "start_capture") continue;
      handledIdsRef.current.add(cmd.id);
      startRecording(cmd.rep_id, cmd.drill_id, cmd.hint ?? null);
      const db = getDb();
      if (db) {
        void updateDoc(doc(db, `${commandsCollectionPath(sessionId)}/${cmd.id}`), {
          handled: true,
        }).catch(() => {});
      }
    }
  }, [commands, sessionId, startRecording, stopRecording, state.recording, state.activeRepId]);

  useEffect(() => () => stopRecording(), [stopRecording]);

  return useMemo(
    () => ({ ...state, stopRecording }),
    [state, stopRecording],
  );
}
