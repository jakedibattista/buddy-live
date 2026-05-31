import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LandingSessionPreview } from "@/components/landing/LandingSessionPreview";

export default function Home() {
  return (
    <main className="landing-page relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-center select-none sm:px-6 lg:px-10">
      <div className="flex w-full max-w-xl flex-col items-center sm:max-w-2xl lg:max-w-5xl">
        <div className="landing-puck-glow relative mb-6 sm:mb-8">
          <div className="animate-puck-hover motion-reduce:animate-none">
            <Image
              src="/mascot/coach-puck.png"
              alt=""
              width={512}
              height={512}
              priority
              className="h-28 w-28 object-contain drop-shadow-[0_12px_40px_rgba(0,0,0,0.5)] sm:h-36 sm:w-36"
            />
          </div>
        </div>

        <h1 className="text-5xl font-semibold tracking-[-0.015em] text-white sm:text-7xl lg:text-[80px] leading-[1.07]">
          Buddy Live.
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-balance text-lg font-normal leading-[1.47] tracking-[-0.01em] text-zinc-400 sm:mt-5 sm:text-xl lg:max-w-3xl">
          Talk to Coach Buddy. Get a full shot scorecard, or train your hockey IQ
          with real game scenarios.
        </p>

        <div className="mt-8 w-full sm:mt-10 lg:mt-12">
          <LandingSessionPreview />
        </div>

        <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:mt-10 lg:max-w-md">
          <Link
            href="/coach"
            className="group inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#0066cc] px-6 py-3.5 text-[17px] font-normal text-white transition-all hover:bg-[#0071e3] active:scale-[0.97] motion-reduce:active:scale-100"
          >
            Start practice
            <ChevronRight
              size={16}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
          <Link
            href="/coach?mode=iq"
            className="inline-flex w-full items-center justify-center rounded-full border border-white/[0.12] bg-zinc-900/50 px-6 py-3.5 text-[17px] font-normal text-zinc-200 transition-all hover:border-white/20 hover:bg-zinc-800/60 active:scale-[0.97] motion-reduce:active:scale-100"
          >
            Hockey IQ only
          </Link>
          <p className="text-pretty text-sm leading-relaxed text-zinc-500">
            Full practice needs camera, mic, a stick, and space to shoot. Hockey IQ
            is mic-only — great on mobile when you&apos;re off the ice.
          </p>
        </div>
      </div>
    </main>
  );
}
