"use client";

import { useConversationControls, useConversationMode } from "@elevenlabs/react";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Ducks coach audio output while the agent is speaking (SDK has no hard interrupt). */
export function CoachAudioMuteButton({ className }: { className?: string }) {
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
      className={cn("btn-glass h-12 w-12", className)}
      aria-label={muted ? "Restore coach audio" : "Mute coach audio"}
      title={muted ? "Restore coach audio" : "Mute coach audio"}
    >
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
  );
}
