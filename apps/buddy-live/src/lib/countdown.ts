export function formatCountdownMs(remainingMs: number): string {
  const totalSec = Math.ceil(Math.max(0, remainingMs) / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
