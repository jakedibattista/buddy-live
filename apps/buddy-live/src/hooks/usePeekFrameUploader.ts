"use client";

import { useEffect, useRef } from "react";

interface Options {
  sessionId: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  /** Capture interval in ms. Default 2500ms = ~0.4 FPS server-side. */
  intervalMs?: number;
  /**
   * Capture interval to use while a warm-up timer is running. Faster so the
   * peek_url_history ring buffer fills with enough closely-spaced frames for
   * peek_warmup to detect motion across the timer window. Default 1500ms.
   */
  warmupIntervalMs?: number;
  /** True while a warm-up timer is active. Switches to warmupIntervalMs. */
  warmupActive?: boolean;
  /** Output JPEG width. Default 640px to keep payload small. */
  width?: number;
  /** JPEG quality 0-1. Default 0.7. */
  quality?: number;
}

/**
 * Periodically grabs a frame from the local <video> element and POSTs it as
 * base64 JPEG to /api/peek, which uploads to Firebase Storage and writes a
 * fresh signed URL into the Firestore session doc. The ADK `peek_camera` tool
 * reads that URL on demand.
 *
 * We use a stable polling interval rather than a Gemini Live websocket so we
 * sidestep the 1-FPS / 2-minute session limits of the Live API. The agent only
 * fetches a frame when it actually calls peek_camera, so the upload cadence is
 * decoupled from cost.
 */
export function usePeekFrameUploader({
  sessionId,
  videoRef,
  enabled,
  intervalMs = 2500,
  warmupIntervalMs = 1500,
  warmupActive = false,
  width = 640,
  quality = 0.7,
}: Options) {
  const lastSentAtRef = useRef(0);
  const inFlightRef = useRef(false);
  const effectiveInterval = warmupActive ? warmupIntervalMs : intervalMs;

  useEffect(() => {
    if (!enabled || !sessionId) return;
    let cancelled = false;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    async function tick() {
      if (cancelled) return;
      if (inFlightRef.current) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        const aspect = video.videoHeight / video.videoWidth;
        canvas.width = width;
        canvas.height = Math.round(width * aspect);
        ctx!.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const base64 = dataUrl.split(",")[1];
        try {
          inFlightRef.current = true;
          await fetch("/api/peek", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, imageBase64: base64 }),
          });
          lastSentAtRef.current = Date.now();
        } catch {
          // swallow: best-effort
        } finally {
          inFlightRef.current = false;
        }
      }
    }

    const handle = window.setInterval(tick, effectiveInterval);
    tick();
    return () => {
      cancelled = true;
      window.clearInterval(handle);
      inFlightRef.current = false;
    };
  }, [sessionId, enabled, effectiveInterval, width, quality, videoRef]);
}
