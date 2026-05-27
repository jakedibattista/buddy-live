/**
 * Hidden "system" messages we send to the ElevenLabs agent on behalf of the
 * UI (voice reconnect, warm-up timer done, camera re-check). They're wrapped
 * in parentheses by convention so the agent treats them as system context and
 * not the player's words.
 *
 * Senders use the builders below; the conversation transcript filter in
 * `CoachConversation` uses `HIDDEN_AGENT_MESSAGE_PREFIXES` to suppress them
 * from the visible chat. Keep all three in sync — adding a new prefix without
 * adding it here will leak into the transcript.
 */

export const HIDDEN_AGENT_MESSAGE_PREFIXES = [
  "(Voice reconnected",
  "(Warm-up timer finished",
  "(Camera check",
] as const;

export function isHiddenAgentMessage(message: string | undefined | null): boolean {
  if (!message) return false;
  return HIDDEN_AGENT_MESSAGE_PREFIXES.some((p) => message.startsWith(p));
}

export const VOICE_RESUME_FIRST_MESSAGE =
  "Quick glitch — I'm still here. Give me one sec.";

export interface VoiceResumeContext {
  focusDrill?: string | null;
  currentPhase?: string | null;
  repCount: number;
  setupFramingPassed: boolean;
}

export function buildVoiceReconnectMessage(ctx: VoiceResumeContext): string {
  const drill = ctx.focusDrill ?? "not set yet";
  const phase = ctx.currentPhase ?? "unknown";
  return (
    `(Voice reconnected — continue this existing session. Do NOT restart from name, age, or drill selection. ` +
    `Focus drill: ${drill}. Phase: ${phase}. Reps completed: ${ctx.repCount}. ` +
    `Setup framing passed: ${ctx.setupFramingPassed ? "yes" : "no"}. ` +
    `Acknowledge the reconnect in one short sentence, then continue exactly where we left off.)`
  );
}

export function buildWarmupTimerDoneMessage(exercise: string): string {
  return `(Warm-up timer finished for ${exercise} — call peek_warmup now and give feedback.)`;
}

export const CAMERA_RECHECK_MESSAGE =
  "(Camera check — please call peek_camera now to see if the player fixed their framing.)";
