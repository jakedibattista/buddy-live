"use client";

import { cn } from "@/lib/utils";

interface Props {
  coachStatus: string;
  recording: boolean;
  analyzingCount: number;
  setupFramingPassed: boolean;
  focusDrill: string | null;
  currentPhase?: string | null;
  warmupTimerActive?: boolean;
  warmupTimerLabel?: string | null;
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
  warmupTimerActive = false,
  warmupTimerLabel = null,
  repCount,
  resultsReady,
  connected,
  className,
}: Props) {
  if (!connected) return null;

  let message: string | null = null;

  if (currentPhase === "recap" || currentPhase === "ended") {
    message = "Session wrapped. Review your summary and homework with Coach Buddy.";
  } else if (recording) {
    message = 'Perform your rep. Say "stop" or hit the red button when done.';
  } else if (resultsReady && repCount > 0 && currentPhase !== "recap" && currentPhase !== "ended") {
    message = "Your results are ready. Review your scorecard in the center with Coach.";
  } else if (analyzingCount > 0) {
    message =
      "Scorecard cooking. Follow the on-screen cool-down instructions while you wait.";
  } else if (focusDrill && currentPhase === "warmup") {
    if (warmupTimerActive && warmupTimerLabel) {
      message = `${warmupTimerLabel}: Follow the timer on screen.`;
    } else {
      message = "Warm-up: One timed move at a time. Watch for the countdown.";
    }
  } else if (focusDrill && !setupFramingPassed && currentPhase === "stance_check") {
    message = "Coach Buddy is checking your camera setup. Follow his voice cues.";
  } else if (focusDrill && currentPhase === "drill_readiness" && repCount === 0) {
    message = "Ask for a drill explanation or a practice rep, then say ready for rep 1.";
  } else if (currentPhase === "iq_practice") {
    message = "Hockey IQ: Talk through the scenario with Coach Buddy.";
  } else if (focusDrill && setupFramingPassed && repCount === 0) {
    message = "Say ready when you want your scored rep. Coach will start recording.";
  } else if (focusDrill && setupFramingPassed) {
    message = "Say ready when you're set up for your scored rep.";
  } else if (coachStatus === "connected") {
    message = "Answer Coach Buddy. Pick your drill when asked.";
  }

  if (!message) return null;

  return (
    <p className={cn("text-xs leading-snug text-zinc-400", className)}>{message}</p>
  );
}
