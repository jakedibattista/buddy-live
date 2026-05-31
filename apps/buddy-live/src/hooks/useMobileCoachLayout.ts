"use client";

import { useEffect, useState } from "react";

/** True when viewport is below Tailwind `lg` (1024px) — stacked mobile coach layout. */
export function useMobileCoachLayout(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return mobile;
}
