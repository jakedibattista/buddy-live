"use client";

import {
  useConversationControls,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react";
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

const PROMPTS: Prompt[] = [
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
  {
    label: "Next drill",
    message: "Let's move to the next drill.",
    show: (ctx) => ctx.connected && ctx.repCount > 0 && !ctx.recording,
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
          className="rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-xs text-zinc-200 backdrop-blur transition-colors hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-white"
        >
          {prompt.label}
        </button>
      ))}
    </div>
  );
}
