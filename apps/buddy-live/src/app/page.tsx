import Image from "next/image";
import Link from "next/link";
import { Award, ChevronRight, Flame, Target } from "lucide-react";
import { LandingSessionPreview } from "@/components/landing/LandingSessionPreview";

const BEATS = [
  { icon: Flame, label: "Warm up" },
  { icon: Target, label: "Shoot" },
  { icon: Award, label: "See your score" },
] as const;

export default function Home() {
  return (
    <main className="landing-page relative mx-auto flex min-h-[100dvh] max-w-4xl flex-col items-center justify-center overflow-hidden px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-center select-none">
      <div className="flex w-full max-w-2xl flex-col items-center">
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

        <p className="mx-auto mt-4 max-w-lg text-balance text-lg font-normal leading-[1.47] tracking-[-0.01em] text-zinc-400 sm:mt-5 sm:text-xl">
          Practice your shot. Coach Buddy watches and helps you get better.
        </p>

        <div className="mt-8 w-full sm:mt-10">
          <LandingSessionPreview />
        </div>

        <div className="mt-8 w-full max-w-xs sm:mt-10">
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
          <p className="mt-3 text-pretty text-sm leading-relaxed text-zinc-500">
            Stick, puck or ball, and a little space in front of your camera.
          </p>
        </div>

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:mt-10 sm:gap-x-8">
          {BEATS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="inline-flex items-center gap-2 text-sm text-zinc-500"
            >
              <Icon size={15} strokeWidth={1.75} className="text-zinc-600" />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
