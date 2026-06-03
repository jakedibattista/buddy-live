"use client";

import { useConversationControls, useConversationMode } from "@elevenlabs/react";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Ducks coach audio output while the agent is speaking (SDK has no hard interrupt). */
export function CoachAudioMuteButton({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { isSpeaking } = useConversationMode();
  const { setVolume } = useConversationControls();
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!isSpeaking && muted) {
      void setVolume({ volume: 1 });
      setMuted(false);
    }
  }, [isSpeaking, muted, setVolume]);

  if (!isSpeaking && !muted) return null;

  async function toggle() {
    if (muted) {
      await setVolume({ volume: 1 });
      setMuted(false);
    } else {
      await setVolume({ volume: 0 });
      setMuted(true);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className={cn("btn-glass", compact ? "h-9 w-9" : "h-12 w-12", className)}
      aria-label={muted ? "Restore coach audio" : "Mute coach audio"}
      title={muted ? "Restore coach audio" : "Mute coach audio"}
    >
      {muted ? (
        <VolumeX size={compact ? 16 : 18} />
      ) : (
        <Volume2 size={compact ? 16 : 18} />
      )}
    </button>
  );
}
