import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-between px-6 py-24 text-center bg-black select-none">
      {/* Top spacer to align center */}
      <div />

      <div className="flex flex-col items-center max-w-2xl">
        <h1 className="text-5xl font-semibold tracking-[-0.015em] text-white sm:text-7xl lg:text-[80px] leading-[1.07]">
          Buddy Live.
        </h1>
        
        <p className="mx-auto mt-5 max-w-lg text-balance text-lg sm:text-xl font-normal leading-[1.47] text-zinc-400 tracking-[-0.01em]">
          NHL-caliber coaching. Right through your webcam.
        </p>

        <div className="mt-8">
          <Link
            href="/coach"
            className="group inline-flex items-center gap-1.5 rounded-full bg-[#0066cc] px-6 py-3 text-[17px] font-normal text-white transition-all hover:bg-[#0071e3] active:scale-[0.95]"
          >
            Talk to Coach Buddy
            <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      <footer className="text-[11px] font-normal uppercase tracking-widest text-zinc-600 select-none">
        Hackathon build · Google ADK + Gemini · ElevenLabs · Firebase
      </footer>
    </main>
  );
}
