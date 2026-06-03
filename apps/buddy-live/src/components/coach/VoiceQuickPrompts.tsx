"use client";

import { useConversationControls, useConversationStatus } from "@elevenlabs/react";
import { cn } from "@/lib/utils";

interface Context {
  connected: boolean;
  recording: boolean;
  setupFramingPassed: boolean;
  repCount: number;
  resultsReady: boolean;
}

interface Prompt {
  label: string;
  message: string;
  show: (ctx: Context) => boolean;
}

const WRAP_UP_MESSAGE =
  "I'm all done for today. Please give me a quick recap and one homework cue, then say goodbye.";

const SKIP_WARMUP_MESSAGE =
  "Let's skip the warm-up and go straight to shooting. I've got my stick, puck, and space ready.";

const PROMPTS: Prompt[] = [
  {
    label: "Skip to shooting",
    message: SKIP_WARMUP_MESSAGE,
    show: (ctx) =>
      ctx.connected && !ctx.recording && !ctx.setupFramingPassed && ctx.repCount === 0,
  },
  {
    label: "I'm ready",
    message: "I'm ready.",
    show: (ctx) => ctx.connected && ctx.setupFramingPassed && !ctx.recording,
  },
  {
    label: "Wrap up",
    message: WRAP_UP_MESSAGE,
    show: (ctx) =>
      ctx.connected && ctx.resultsReady && ctx.repCount > 0 && !ctx.recording,
  },
  {
    label: "Repeat that",
    message: "Can you repeat that?",
    show: (ctx) => ctx.connected && !ctx.recording,
  },
];

interface VoiceQuickPromptsProps {
  recording: boolean;
  setupFramingPassed: boolean;
  repCount: number;
  resultsReady: boolean;
  className?: string;
}

export function VoiceQuickPrompts({
  recording,
  setupFramingPassed,
  repCount,
  resultsReady,
  className,
}: VoiceQuickPromptsProps) {
  const { status } = useConversationStatus();
  const { sendUserMessage } = useConversationControls();

  const connected = status === "connected";
  const ctx: Context = { connected, recording, setupFramingPassed, repCount, resultsReady };
  const visible = PROMPTS.filter((p) => p.show(ctx));

  if (visible.length === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto flex max-w-md flex-wrap justify-center gap-2",
        className,
      )}
    >
      {visible.map((prompt) => (
        <button
          key={prompt.label}
          type="button"
          onClick={() => sendUserMessage(prompt.message)}
          className="rounded-full border border-white/[0.08] bg-zinc-900/40 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 backdrop-blur-md transition-all hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-white shadow-sm sm:px-3.5 sm:py-2 sm:text-sm"
        >
          {prompt.label}
        </button>
      ))}
    </div>
  );
}
