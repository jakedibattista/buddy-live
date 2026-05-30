"use client";

import { IqVisualCard } from "@/components/iq/IqVisualCard";
import type { IqVisualCommand } from "@/lib/types";

/** Static breakaway card — same renderer as live /coach Hockey IQ. */
const LANDING_IQ_PREVIEW: IqVisualCommand = {
  id: "landing-iq-preview",
  created_at: "",
  type: "show_iq_visual",
  scenario: "Breakaway. The goalie is way out. Do you shoot fast, or skate around them?",
  options: ["Shoot fast", "Skate around"],
  diagram: "Breakaway. You have the puck on a breakaway. Goalie is way out.",
};

export function LandingIqPreview() {
  return <IqVisualCard command={LANDING_IQ_PREVIEW} size="sm" className="!p-0" />;
}
