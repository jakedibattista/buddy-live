"use client";

import { cn } from "@/lib/utils";

interface Props {
  coachStatus: string;
  recording: boolean;
  analyzingCount: number;
  setupFramingPassed: boolean;
  focusDrill: string | null;
  currentPhase?: string | null;
  repCount: number;
  resultsReady: boolean;
  connected: boolean;
  className?: string;
}

export function NextTurnCue({
  coachStatus,
  recording,
  analyzingCount,
  setupFramingPassed,
  focusDrill,
  currentPhase,
  repCount,
  resultsReady,
  connected,
  className,
}: Props) {
  if (!connected) return null;

  let message: string | null = null;

  if (recording) {
    message = "Perform your rep — tap Stop & upload when you're done.";
  } else if (resultsReady && repCount > 0 && currentPhase !== "recap" && currentPhase !== "ended") {
    message = "Scorecard ready — ask Coach to wrap up or tap Wrap up.";
  } else if (analyzingCount > 0) {
    message =
      "Analysis running — answer Coach's hockey question or keep shooting.";
  } else if (focusDrill && currentPhase === "warmup") {
    message = "Warm up with Coach Buddy — no recording yet.";
  } else if (focusDrill && !setupFramingPassed) {
    message = "Step back so Coach Buddy can see you head to toes, facing the camera.";
  } else if (focusDrill && currentPhase === "drill_readiness" && repCount === 0) {
    message = "Ask for a drill explanation or a practice rep — then say ready for rep 1.";
  } else if (focusDrill && setupFramingPassed && repCount === 0) {
    message = "Say ready when you want rep 1 of 5 — Coach will start recording.";
  } else if (focusDrill && setupFramingPassed) {
    message = "Say ready when you're set up for the next scored rep.";
  } else if (coachStatus === "connected") {
    message = "Answer Coach Buddy — pick your drill when asked.";
  }

  if (!message) return null;

  return (
    <p className={cn("text-xs leading-snug text-zinc-400", className)}>{message}</p>
  );
}
