import type { TranscriptEntry, TranscriptKind } from "@/lib/types";

export function systemTranscript(text: string, kind: TranscriptKind = "info"): TranscriptEntry {
  return {
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: "system",
    kind,
    text,
    ts: Date.now(),
  };
}

export function voiceTranscriptEntry(
  role: "user" | "coach",
  text: string,
  suffix = "",
): TranscriptEntry {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${suffix}`,
    role,
    text,
    ts: Date.now(),
  };
}

/** Break long coach monologues into readable sidebar chunks. */
export function splitLongMessage(text: string, maxLen = 200): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return [trimmed];

  const parts = trimmed.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [trimmed];
  const chunks: string[] = [];
  let buffer = "";

  for (const part of parts) {
    const next = buffer ? `${buffer} ${part}`.trim() : part.trim();
    if (next.length > maxLen && buffer) {
      chunks.push(buffer.trim());
      buffer = part.trim();
    } else {
      buffer = next;
    }
  }

  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks.length > 0 ? chunks : [trimmed];
}

export function coachTranscriptEntries(text: string): TranscriptEntry[] {
  return splitLongMessage(text).map((chunk, i) =>
    voiceTranscriptEntry("coach", chunk, i > 0 ? `-p${i}` : ""),
  );
}

export function formatTranscriptTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatTranscriptElapsed(ts: number, sessionStartMs: number): string {
  const deltaSec = Math.max(0, Math.floor((ts - sessionStartMs) / 1000));
  if (deltaSec < 60) return `${deltaSec}s`;
  const mins = Math.floor(deltaSec / 60);
  const secs = deltaSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
