import type { SessionMode } from "@/lib/types";

export type { SessionMode };

export function parseSessionMode(value: string | null | undefined): SessionMode {
  return value === "iq" ? "iq" : "full";
}
