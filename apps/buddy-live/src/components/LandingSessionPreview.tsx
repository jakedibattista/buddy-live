"use client";

import Image from "next/image";
import type { CSSProperties } from "react";

const METRICS = [
  { label: "Power", value: 82 },
  { label: "Accuracy", value: 74 },
  { label: "Form", value: 88 },
];

export function LandingSessionPreview() {
  return (
    <div
      className="landing-preview relative mx-auto w-full max-w-md lg:max-w-lg"
      aria-hidden
    >
      <div className="landing-preview-frame overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="relative aspect-[4/3] bg-zinc-900">
          <div className="landing-preview-shimmer absolute inset-0" />

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

          <div className="absolute left-4 top-4 flex items-center gap-2">
            <span className="rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
              Rec
            </span>
            <span className="font-mono text-xs tabular-nums text-white/80">0:42</span>
          </div>

          <div className="absolute bottom-4 left-4 rounded-full bg-black/50 px-3 py-1 text-xs text-zinc-300 backdrop-blur-sm">
            Wristshot
          </div>

          <div className="absolute bottom-3 right-3 opacity-90">
            <div className="animate-puck-hover motion-reduce:animate-none">
              <Image
                src="/mascot/coach-puck.png"
                alt=""
                width={128}
                height={128}
                className="h-14 w-14 object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)] sm:h-16 sm:w-16"
              />
            </div>
          </div>

          <div className="absolute inset-y-0 right-0 hidden w-[38%] border-l border-white/[0.06] bg-black/45 p-3 backdrop-blur-sm sm:block">
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Your score
            </div>
            <div className="mt-2 space-y-2.5">
              {METRICS.map((metric) => (
                <div key={metric.label}>
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>{metric.label}</span>
                    <span className="tabular-nums text-zinc-300">{metric.value}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="landing-preview-bar h-full rounded-full bg-[#0066cc]"
                      style={
                        {
                          "--bar-width": `${metric.value}%`,
                          animationDelay: `${METRICS.indexOf(metric) * 0.35}s`,
                        } as CSSProperties
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
