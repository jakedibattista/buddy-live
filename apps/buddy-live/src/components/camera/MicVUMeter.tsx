"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface MicVUMeterProps {
  stream: MediaStream | null;
  className?: string;
}

export function MicVUMeter({ stream, className }: MicVUMeterProps) {
  const [level, setLevel] = useState(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream) {
      setLevel(0);
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms * 4));
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      void ctx.close();
    };
  }, [stream]);

  return (
    <div className={cn("flex h-10 items-center gap-1", className)}>
      {Array.from({ length: 12 }).map((_, i) => {
        const threshold = (i + 1) / 12;
        const on = level >= threshold - 0.04;
        return (
          <div
            key={i}
            className={cn(
              "h-full w-1.5 rounded-full transition-colors",
              on ? (i >= 9 ? "bg-red-500" : i >= 6 ? "bg-yellow-400" : "bg-[var(--brand-blue-hover)]") : "bg-white/15",
            )}
            style={{ height: `${30 + i * 4}%` }}
          />
        );
      })}
    </div>
  );
}
