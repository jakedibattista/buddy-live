import { Suspense } from "react";
import { CoachPageClient } from "@/app/coach/CoachPageClient";

function CoachLoading() {
  return (
    <main className="coach-shell flex min-h-[100dvh] items-center justify-center bg-black text-zinc-400">
      Loading session…
    </main>
  );
}

export default function CoachPage() {
  return (
    <Suspense fallback={<CoachLoading />}>
      <CoachPageClient />
    </Suspense>
  );
}
