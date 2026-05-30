import Image from "next/image";
import type { CSSProperties } from "react";
import { LandingIqPreview } from "@/components/landing/LandingIqPreview";
import { humanMetric } from "@/lib/utils";

const SCORE_METRICS = [
  { key: "armMechanics", value: 8.5 },
  { key: "followThrough", value: 8.5 },
  { key: "frontKneeBendAtImpact", value: 8 },
  { key: "powerSequence", value: 8 },
  { key: "stanceAndBase", value: 10 },
  { key: "stickMechanics", value: 8.5 },
  { key: "weightTransfer", value: 9 },
  { key: "windUp", value: 9.5 },
] as const;

const AVG_SCORE =
  SCORE_METRICS.reduce((sum, metric) => sum + metric.value, 0) / SCORE_METRICS.length;

const STRONGEST = SCORE_METRICS.reduce((best, metric) =>
  metric.value > best.value ? metric : best,
);

const WEAKEST = SCORE_METRICS.reduce((worst, metric) =>
  metric.value < worst.value ? metric : worst,
);

export function LandingSessionPreview() {
  return (
    <div
      className="landing-preview relative mx-auto grid w-full gap-3 lg:grid-cols-2 lg:gap-4"
      aria-hidden
    >
      <div className="landing-preview-frame overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="relative aspect-[4/3] bg-black">
          <video
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            poster="/landing/demo-rep-poster.jpg"
          >
            <source src="/landing/demo-rep.webm" type="video/webm" />
            <source src="/landing/demo-rep.mp4" type="video/mp4" />
          </video>

          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30" />

          <div className="absolute left-4 top-4 flex items-center gap-2">
            <span className="rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
              Rec
            </span>
            <span className="font-mono text-xs tabular-nums text-white/80">0:42</span>
          </div>

          <div className="absolute bottom-3 left-3 opacity-90 sm:bottom-4 sm:left-4">
            <div className="animate-puck-hover motion-reduce:animate-none">
              <Image
                src="/mascot/coach-puck.png"
                alt=""
                width={128}
                height={128}
                className="h-12 w-12 object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)] sm:h-14 sm:w-14"
              />
            </div>
          </div>

          <div className="absolute inset-y-0 right-0 flex w-[44%] flex-col border-l border-white/[0.06] bg-black/55 p-2.5 backdrop-blur-md sm:w-[40%] sm:p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-brand">
                  Slapshot
                </span>
                <div className="mt-0.5 text-[9px] text-zinc-500 sm:text-[10px]">Scored rep</div>
              </div>
              <span className="badge-brand shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide sm:text-[10px]">
                Scored
              </span>
            </div>

            <div className="mt-1.5 rounded-lg border border-white/[0.06] bg-zinc-900/50 px-2 py-1 font-mono text-[10px] font-bold text-brand sm:text-xs">
              Avg {AVG_SCORE.toFixed(1)}
            </div>

            <div className="mt-1.5 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
              {SCORE_METRICS.map((metric, index) => (
                <div key={metric.key}>
                  <div className="flex items-center justify-between gap-1 text-[9px] text-zinc-400 sm:text-[10px]">
                    <span className="truncate capitalize">{humanMetric(metric.key)}</span>
                    <span className="shrink-0 font-mono tabular-nums text-zinc-200">
                      {metric.value.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-0.5 h-0.5 overflow-hidden rounded-full bg-zinc-800/80 sm:h-1">
                    <div
                      className="landing-preview-bar h-full rounded-full bg-[var(--brand-blue)]"
                      style={
                        {
                          "--bar-width": `${metric.value * 10}%`,
                          animationDelay: `${index * 0.2}s`,
                        } as CSSProperties
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-1.5 space-y-1 border-t border-white/[0.06] pt-1.5 text-[9px] leading-snug text-zinc-400 sm:text-[10px]">
              <p>
                <span className="text-zinc-300">Strongest:</span>{" "}
                <span className="capitalize text-zinc-200">{humanMetric(STRONGEST.key)}</span>{" "}
                <span className="font-mono text-brand">{STRONGEST.value.toFixed(1)}</span>
              </p>
              <p>
                <span className="text-zinc-300">Focus:</span>{" "}
                <span className="capitalize text-zinc-200">{humanMetric(WEAKEST.key)}</span>{" "}
                <span className="font-mono text-brand">{WEAKEST.value.toFixed(1)}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/90 p-4 text-left text-white shadow-[0_16px_48px_rgba(0,0,0,0.4)] sm:p-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Hockey IQ practice
        </div>
        <div className="mt-2">
          <LandingIqPreview />
        </div>
      </div>
    </div>
  );
}
