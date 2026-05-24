"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CameraView } from "@/components/CameraView";
import { CoachConversation } from "@/components/CoachConversation";
import { DrillChip } from "@/components/DrillChip";
import { MicVUMeter } from "@/components/MicVUMeter";
import { RepScorecard } from "@/components/RepScorecard";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { useLiveSession } from "@/hooks/useLiveSession";
import { usePeekFrameUploader } from "@/hooks/usePeekFrameUploader";
import { useRepCapture } from "@/hooks/useRepCapture";
import { useRepResultsPolling } from "@/hooks/useRepResultsPolling";
import type { TranscriptEntry } from "@/lib/types";

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

export default function CoachPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [coachStatus, setCoachStatus] = useState<string>("idle");

  const live = useLiveSession();
  const capture = useRepCapture({
    sessionId: live.sessionId,
    stream,
    commands: live.commands,
  });

  usePeekFrameUploader({
    sessionId: live.sessionId,
    videoRef,
    enabled: coachStatus === "connected",
  });

  useRepResultsPolling({ sessionId: live.sessionId, reps: live.reps });

  useEffect(() => {
    let active = true;
    async function getMedia() {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (!active) {
          ms.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(ms);
      } catch (e) {
        setPermissionError(e instanceof Error ? e.message : String(e));
      }
    }
    getMedia();
    return () => {
      active = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTranscript = useCallback((entry: TranscriptEntry) => {
    setTranscript((cur) => [...cur, entry].slice(-40));
  }, []);

  const reps = useMemo(
    () =>
      Object.values(live.reps).sort((a, b) =>
        (a.created_at ?? "").localeCompare(b.created_at ?? ""),
      ),
    [live.reps],
  );

  const focusDrill = live.session?.focus_drill ?? null;
  const displayedDrillId = capture.activeDrillId ?? focusDrill;
  const displayedHint = capture.activeDrillId
    ? capture.hint
    : focusDrill
      ? `Today: 5 ${focusDrill}s, one at a time.`
      : null;

  return (
    <main className="relative flex min-h-screen flex-col bg-zinc-950 text-white">
      <div className="absolute left-4 top-4 z-30">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur hover:bg-black/60"
        >
          <ArrowLeft size={14} /> Back
        </Link>
      </div>

      <div className="relative mx-auto grid w-full max-w-7xl flex-1 gap-6 p-4 lg:grid-cols-[1fr_360px] lg:p-6">
        {/* Camera column */}
        <section className="relative flex h-[60vh] w-full flex-col gap-4 lg:h-[calc(100vh-3rem)]">
          <div className="relative flex-1">
            <CameraView ref={videoRef} stream={stream} recording={capture.recording} />
            {permissionError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center">
                <div>
                  <div className="mb-1 text-lg font-semibold">Camera + mic required</div>
                  <div className="text-sm text-zinc-400">{permissionError}</div>
                </div>
              </div>
            )}
            <div className="pointer-events-none absolute left-4 top-4 max-w-[60%] [&>*]:pointer-events-auto">
              <DrillChip
                drillId={displayedDrillId}
                hint={displayedHint}
                recording={capture.recording}
              />
            </div>
            <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
              <CoachConversation
                sessionId={live.sessionId}
                agentId={AGENT_ID}
                onTranscript={handleTranscript}
                onStatusChange={setCoachStatus}
              />
            </div>
            <div className="absolute bottom-4 right-4">
              <MicVUMeter stream={stream} />
            </div>
          </div>
        </section>

        {/* Side panel */}
        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-zinc-400">Session</div>
                <div className="font-mono text-xs text-zinc-200">
                  {live.sessionId ?? "…"}
                </div>
              </div>
              <span
                className={
                  coachStatus === "connected"
                    ? "rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300"
                    : "rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-300"
                }
              >
                {coachStatus}
              </span>
            </div>
            {live.error && (
              <div className="mt-2 text-xs text-red-400">{live.error}</div>
            )}
            {capture.lastUpload && (
              <div className="mt-2 text-xs text-zinc-400">
                Last clip: <span className="text-zinc-200">{capture.lastUpload.repId}</span> ·{" "}
                <span
                  className={
                    capture.lastUpload.status === "uploaded"
                      ? "text-emerald-300"
                      : capture.lastUpload.status === "error"
                        ? "text-red-300"
                        : "text-yellow-300"
                  }
                >
                  {capture.lastUpload.status}
                </span>
              </div>
            )}
          </div>

          <TranscriptPanel entries={transcript} />

          <div className="flex flex-col gap-3">
            <div className="px-1 text-xs uppercase tracking-widest text-zinc-400">
              Reps ({reps.length})
            </div>
            {reps.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">
                Reps will appear here as Coach Buddy guides you through the drills.
              </div>
            )}
            {reps.map((rep) => (
              <RepScorecard key={rep.rep_id} rep={rep} />
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
