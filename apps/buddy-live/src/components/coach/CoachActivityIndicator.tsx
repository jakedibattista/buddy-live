"use client";

import { useConversationMode, useConversationStatus } from "@elevenlabs/react";
import { cn } from "@/lib/utils";

export function CoachActivityIndicator({ className }: { className?: string }) {
  const { status } = useConversationStatus();
  const { isSpeaking, isListening } = useConversationMode();

  if (status === "connecting") {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-zinc-400", className)}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        Connecting to Coach Buddy…
      </div>
    );
  }

  if (status !== "connected") return null;

  let label = "Coach Buddy is thinking…";
  let dotClass = "bg-zinc-400 animate-pulse";

  if (isSpeaking) {
    label = "Coach Buddy is speaking…";
    dotClass = "bg-white animate-pulse";
  } else if (isListening) {
    label = "Coach Buddy is listening…";
    dotClass = "bg-[var(--brand-blue-hover)]";
  }

  return (
    <div className={cn("flex items-center gap-2 text-xs text-zinc-400", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
      {label}
    </div>
  );
}
