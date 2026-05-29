/** Target scored reps per session (matches coach agent prompt). We assume the
 *  player records a single video, then reviews the scorecard. */
export const SCORED_REP_TARGET = 1;

/** Max rep clip length sent to modelforpuckbuddy (matches coach UX spec). */
export const MAX_REP_RECORDING_MS = 60_000;

/** Ignore accidental tap-to-stop clips smaller than this. */
export const MIN_REP_CLIP_BYTES = 2_048;
