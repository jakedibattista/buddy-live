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
  "(Session mode:",
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
  /** Most recent rep id, so the agent can re-fetch its scorecard after a drop. */
  lastRepId?: string | null;
  /** True when a scored rep's results are ready but not yet reviewed. */
  awaitingReview?: boolean;
}

export function buildVoiceReconnectMessage(ctx: VoiceResumeContext): string {
  const drill = ctx.focusDrill ?? "not set yet";
  const phase = ctx.currentPhase ?? "unknown";
  const review =
    ctx.awaitingReview && ctx.lastRepId
      ? `A scored rep (id ${ctx.lastRepId}) is awaiting review — its results are ready. ` +
        `Call get_rep_result on it and walk the player through the scorecard. Do NOT record a new rep. `
      : ctx.lastRepId
        ? `Last rep id: ${ctx.lastRepId}. Do NOT start a new recording. `
        : "";
  return (
    `(Voice reconnected — continue this existing session. Do NOT restart from name, age, or drill selection, and do NOT re-greet. ` +
    `Focus drill: ${drill}. Phase: ${phase}. Reps completed: ${ctx.repCount}. ` +
    `Setup framing passed: ${ctx.setupFramingPassed ? "yes" : "no"}. ` +
    review +
    `Acknowledge the reconnect in one short sentence, then continue exactly where we left off.)`
  );
}

export function buildWarmupTimerDoneMessage(exercise: string): string {
  return (
    `(Warm-up timer finished for ${exercise}. Do NOT call peek_warmup or any vision tool. ` +
    `Ask the player verbally how that felt in one short sentence, then introduce and start the next move.)`
  );
}

export const CAMERA_RECHECK_MESSAGE =
  "(Camera check — please call peek_camera now to see if the player fixed their framing.)";

/** Sent once when the player enters via /coach?mode=iq (mic only, no camera setup). */
export function buildIqOnlyBootstrapMessage(): string {
  return (
    "(Session mode: Hockey IQ only. The player chose IQ practice from the app — no stick, space, or camera needed. " +
    "After greeting and learning name + age (call remember_player_profile), skip the space check and drill selection. " +
    "Briefly confirm they want Hockey IQ, then call transfer_to_agent(agent_name=\"iq_coach\") immediately. " +
    "Do NOT call set_focus_drill, start_warmup_timer, peek_camera, or start_rep_capture.)"
  );
}
