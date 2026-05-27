"use client";

import { cn } from "@/lib/utils";

interface Props {
  /** True once the player has cleared the head-to-toes setup check at least once. */
  framingPassedOnce: boolean;
  /** Most recent peek_camera observation — false if the latest frame missed feet/head/facing. */
  lastFullBodyInFrame: boolean | undefined;
  /** True while the agent is in the initial setup phase. We only show this AFTER that, so the big amber banner owns setup. */
  inSetupPhase: boolean;
  className?: string;
}

/**
 * A soft amber pill that lights up when the player has *passed* the initial
 * head-to-toes check but a more recent peek_camera saw them drift out of frame
 * (e.g. mid-drill). Never blocks recording — modelforpuckbuddy still analyzes
 * partial-body reps. Hidden during the setup phase since the larger amber
 * banner owns that moment.
 */
export function FramingIndicator({
  framingPassedOnce,
  lastFullBodyInFrame,
  inSetupPhase,
  className,
}: Props) {
  if (!framingPassedOnce) return null;
  if (inSetupPhase) return null;
  if (lastFullBodyInFrame !== false) return null;

  return (
    <div
      className={cn(
        "pointer-events-none flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-100 shadow-sm backdrop-blur",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
      Step into frame
    </div>
  );
}
