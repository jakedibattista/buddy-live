export interface VoiceResumeContext {
  focusDrill?: string | null;
  currentPhase?: string | null;
  repCount: number;
  setupFramingPassed: boolean;
}

export const VOICE_RESUME_FIRST_MESSAGE =
  "Quick glitch — I'm still here. Give me one sec.";

export function buildVoiceResumeUserMessage(ctx: VoiceResumeContext): string {
  const drill = ctx.focusDrill ?? "not set yet";
  const phase = ctx.currentPhase ?? "unknown";
  return (
    `(Voice reconnected — continue this existing session. Do NOT restart from name, age, or drill selection. ` +
    `Focus drill: ${drill}. Phase: ${phase}. Reps completed: ${ctx.repCount}. ` +
    `Setup framing passed: ${ctx.setupFramingPassed ? "yes" : "no"}. ` +
    `Acknowledge the reconnect in one short sentence, then continue exactly where we left off.)`
  );
}
