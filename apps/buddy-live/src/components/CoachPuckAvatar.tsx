"use client";

import {
  useConversationControls,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type CoachPuckActivity =
  | "hidden"
  | "sleeping"
  | "connecting"
  | "listening"
  | "speaking"
  | "thinking"
  | "recording";

interface CoachPuckAvatarProps {
  recording?: boolean;
  celebrate?: boolean;
  className?: string;
}

function averageFrequency(data: Uint8Array): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i]!;
  return sum / data.length / 255;
}

function resolveActivity(
  recording: boolean,
  status: string,
  isSpeaking: boolean,
  isListening: boolean,
): CoachPuckActivity {
  if (recording) return "recording";
  if (status === "disconnected") return "sleeping";
  if (status === "connecting") return "connecting";
  if (status !== "connected") return "hidden";
  if (isSpeaking) return "speaking";
  if (isListening) return "listening";
  return "thinking";
}

export function CoachPuckAvatar({
  recording = false,
  celebrate = false,
  className,
}: CoachPuckAvatarProps) {
  const { status } = useConversationStatus();
  const { isSpeaking, isListening } = useConversationMode();
  const { getOutputByteFrequencyData } = useConversationControls();

  const activity = resolveActivity(recording, status, isSpeaking, isListening);
  const visible = activity !== "hidden";

  const [mouthOpen, setMouthOpen] = useState(0);
  const mouthLevelRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    if (activity === "speaking") {
      const data = getOutputByteFrequencyData();
      const target = Math.min(1, averageFrequency(data) * 2.4 + 0.06);
      mouthLevelRef.current += (target - mouthLevelRef.current) * 0.38;
    } else {
      mouthLevelRef.current *= 0.82;
    }

    setMouthOpen(mouthLevelRef.current);

    if (activity === "speaking" || mouthLevelRef.current > 0.02) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = null;
    }
  }, [activity, getOutputByteFrequencyData]);

  useEffect(() => {
    if (activity === "speaking") {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [activity, tick]);

  const squash = 1 + mouthOpen * 0.07;
  const speakOpacity = Math.min(1, Math.max(0, mouthOpen * 1.4));

  return (
    <div
      className={cn(
        "pointer-events-none select-none transition-all duration-500",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
        activity === "recording" && "scale-75 opacity-40",
        activity === "sleeping" && "opacity-35",
        celebrate && "animate-puck-celebrate",
        className,
      )}
      aria-hidden={!visible}
    >
      <div
        className={cn(
          "relative h-32 w-32 will-change-transform sm:h-36 sm:w-36",
          activity === "speaking" && "animate-puck-bounce",
          activity === "listening" && "animate-puck-hover",
          activity === "thinking" && "animate-puck-wobble",
          activity === "connecting" && "animate-pulse",
        )}
      >
        <div
          className="relative h-full w-full"
          style={
            activity === "speaking"
              ? { transform: `scaleY(${squash})`, transformOrigin: "center bottom" }
              : undefined
          }
        >
        <Image
          src="/mascot/coach-puck.png"
          alt=""
          width={512}
          height={512}
          priority
          className="h-full w-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
          style={{ opacity: 1 - speakOpacity }}
        />
        <Image
          src="/mascot/coach-puck-speak.png"
          alt=""
          width={512}
          height={512}
          priority
          className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
          style={{ opacity: speakOpacity }}
        />
        </div>
      </div>
    </div>
  );
}
