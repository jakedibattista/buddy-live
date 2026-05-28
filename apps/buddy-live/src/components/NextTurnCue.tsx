"use client";

import { cn } from "@/lib/utils";

const WARMUP_EXERCISE_LABELS: Record<string, string> = {
  "arm circles": "Arm circles",
  "slow arm circles with arms out wide": "Arm circles",
  march: "March in place",
  "march in place and lift knees high": "High knees",
  "high knees": "High knees",
  "stick wipers": "Stick wipers",
  "stick side to side like windshield wipers": "Stick wipers",
  "shadow shot": "Shadow shot",
  "slow pretend wrist shot": "Shadow wrist shot",
  "slow pretend slap shot": "Shadow slap shot",
  "slow pretend backhand": "Shadow backhand",
};

function warmupExerciseLabel(exercise: string | undefined): string | null {
  if (!exercise) return null;
  const key = exercise.toLowerCase();
  for (const [needle, label] of Object.entries(WARMUP_EXERCISE_LABELS)) {
    if (key.includes(needle)) return label;
  }
  return exercise.length > 40 ? `${exercise.slice(0, 37)}…` : exercise;
}

interface Props {
  coachStatus: string;
  recording: boolean;
  analyzingCount: number;
  setupFramingPassed: boolean;
  focusDrill: string | null;
  currentPhase?: string | null;
  lastWarmupExercise?: string;
  lastWarmupForm?: "good" | "adjust" | "unclear";
  warmupMovesChecked?: number;
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
  lastWarmupExercise,
  lastWarmupForm,
  warmupMovesChecked = 0,
  warmupTimerActive = false,
  warmupTimerLabel = null,
  repCount,
  resultsReady,
  connected,
  className,
}: Props) {
  if (!connected) return null;

  let message: string | null = null;

  if (recording) {
    message = 'Perform your rep — say "stop" or hit the red button when done.';
  } else if (resultsReady && repCount > 0 && currentPhase !== "recap" && currentPhase !== "ended") {
    message = "Scorecard ready — ask Coach to wrap up or tap Wrap up.";
  } else if (analyzingCount > 0) {
    message =
      "Analysis running — answer Coach's hockey question or keep shooting.";
  } else if (focusDrill && currentPhase === "warmup") {
    if (warmupTimerActive && warmupTimerLabel) {
      message = `${warmupTimerLabel} — follow the timer on screen.`;
    } else {
      const moveLabel = warmupExerciseLabel(lastWarmupExercise);
      if (lastWarmupForm === "good") {
        message = moveLabel
          ? `${moveLabel} looked good — listen for the next move.`
          : "Last move looked good — listen for the next one.";
      } else if (lastWarmupForm === "adjust") {
        message = "Coach Buddy spotted a fix — listen, adjust, then keep going.";
      } else if (warmupMovesChecked > 0) {
        message = "Coach Buddy is watching — do the move he just explained.";
      } else {
        message = "Warm-up — one timed move at a time. Watch for the countdown.";
      }
    }
  } else if (focusDrill && !setupFramingPassed && currentPhase === "stance_check") {
    message = "Coach Buddy is checking your camera setup — follow his voice cues.";
  } else if (focusDrill && currentPhase === "drill_readiness" && repCount === 0) {
    message = "Ask for a drill explanation or a practice rep — then say ready for rep 1.";
  } else if (currentPhase === "iq_practice") {
    message = "Hockey IQ — talk through the scenario with Coach Buddy.";
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
