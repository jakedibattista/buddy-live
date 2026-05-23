"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, RotateCcw } from "lucide-react";
import { CameraView } from "@/components/CameraView";
import { DrillChip } from "@/components/DrillChip";
import { MicVUMeter } from "@/components/MicVUMeter";
import { RepScorecard } from "@/components/RepScorecard";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { DEMO_SCRIPT, emptyDemoReps } from "@/lib/demoData";
import { shortId } from "@/lib/utils";
import type { RepDoc, TranscriptEntry } from "@/lib/types";

/**
 * Scripted demo mode for the hackathon video. Replays a canned session through
 * the same UI components — webcam stream is real (so the player is visible) but
 * coach speech, reps, and scorecards are deterministic.
 *
 * Use this if the live wifi flakes during the demo.
 */
export default function CoachDemoPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [reps, setReps] = useState<Record<string, RepDoc>>(emptyDemoReps());
  const [activeDrill, setActiveDrill] = useState<{ drillId: string; hint: string } | null>(null);
  const [activeRepId, setActiveRepId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    let active = true;
    async function getMedia() {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: true,
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
      timersRef.current.forEach((id) => window.clearTimeout(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function speakIfPossible(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.05;
      utter.pitch = 0.95;
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore
    }
  }

  function reset() {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setTranscript([]);
    setReps(emptyDemoReps());
    setActiveDrill(null);
    setActiveRepId(null);
    setPlaying(false);
  }

  function start() {
    reset();
    setPlaying(true);
    DEMO_SCRIPT.forEach((event) => {
      const id = window.setTimeout(() => {
        switch (event.kind) {
          case "say": {
            const text = String(event.payload.text);
            setTranscript((cur) => [
              ...cur,
              { id: shortId(), role: "coach", text, ts: Date.now() },
            ]);
            speakIfPossible(text);
            break;
          }
          case "user": {
            const text = String(event.payload.text);
            setTranscript((cur) => [
              ...cur,
              { id: shortId(), role: "user", text, ts: Date.now() },
            ]);
            break;
          }
          case "drill": {
            setActiveDrill({
              drillId: String(event.payload.drillId),
              hint: String(event.payload.hint ?? ""),
            });
            break;
          }
          case "rep_create": {
            const repId = String(event.payload.rep_id);
            setActiveRepId(repId);
            setReps((cur) => ({
              ...cur,
              [repId]: { ...(event.payload as unknown as RepDoc), rep_id: repId },
            }));
            break;
          }
          case "rep_update": {
            const repId = String(event.payload.rep_id);
            setReps((cur) => {
              const prev = cur[repId];
              if (!prev) return cur;
              return { ...cur, [repId]: { ...prev, ...event.payload } as RepDoc };
            });
            break;
          }
        }
      }, event.tMs);
      timersRef.current.push(id);
    });
    const endId = window.setTimeout(() => setPlaying(false), 78000);
    timersRef.current.push(endId);
  }

  const repList = useMemo(
    () =>
      Object.values(reps).sort((a, b) =>
        (a.created_at ?? a.rep_id).localeCompare(b.created_at ?? b.rep_id),
      ),
    [reps],
  );

  return (
    <main className="relative flex min-h-screen flex-col bg-zinc-950 text-white">
      <div className="absolute left-4 top-4 z-30 flex gap-2">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur hover:bg-black/60"
        >
          <ArrowLeft size={14} /> Back
        </Link>
        <span className="flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-xs text-yellow-300">
          Demo replay (scripted)
        </span>
      </div>

      <div className="relative mx-auto grid w-full max-w-7xl flex-1 gap-6 p-4 lg:grid-cols-[1fr_360px] lg:p-6">
        <section className="relative flex h-[60vh] w-full flex-col gap-4 lg:h-[calc(100vh-3rem)]">
          <div className="relative flex-1">
            <CameraView ref={videoRef} stream={stream} recording={activeRepId !== null && playing} />
            {permissionError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-6 text-center">
                <div>
                  <div className="mb-1 text-lg font-semibold">Camera + mic required</div>
                  <div className="text-sm text-zinc-400">{permissionError}</div>
                </div>
              </div>
            )}
            <div className="pointer-events-none absolute left-4 top-4 max-w-[60%]">
              <DrillChip
                drillId={activeDrill?.drillId ?? null}
                hint={activeDrill?.hint}
                recording={activeRepId !== null && playing}
              />
            </div>
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3">
              <button
                type="button"
                onClick={start}
                className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-black shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
              >
                <Play size={16} /> {playing ? "Restart" : "Play demo"}
              </button>
              <button
                type="button"
                onClick={reset}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:bg-white/10"
                aria-label="Reset"
              >
                <RotateCcw size={16} />
              </button>
            </div>
            <div className="absolute bottom-4 right-4">
              <MicVUMeter stream={stream} />
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-xs text-yellow-200">
            This is a scripted demo. Speech uses the browser&apos;s built-in synthesizer; the real
            app uses ElevenLabs. Reps and scorecards are pre-baked.
          </div>
          <TranscriptPanel entries={transcript} />
          <div className="flex flex-col gap-3">
            <div className="px-1 text-xs uppercase tracking-widest text-zinc-400">
              Reps ({repList.length})
            </div>
            {repList.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400">
                Hit play to start the scripted session.
              </div>
            )}
            {repList.map((rep) => (
              <RepScorecard key={rep.rep_id} rep={rep} />
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
