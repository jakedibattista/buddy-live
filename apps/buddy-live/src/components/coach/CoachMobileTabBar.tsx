"use client";

import { LayoutGrid, MessageSquare, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export type CoachMobileTab = "live" | "session" | "chat";

interface CoachMobileTabBarProps {
  active: CoachMobileTab;
  onChange: (tab: CoachMobileTab) => void;
  sessionBadge?: boolean;
  chatBadge?: boolean;
}

const TABS: Array<{ id: CoachMobileTab; label: string; Icon: typeof Radio }> = [
  { id: "live", label: "Live", Icon: Radio },
  { id: "session", label: "Session", Icon: LayoutGrid },
  { id: "chat", label: "Chat", Icon: MessageSquare },
];

export function CoachMobileTabBar({
  active,
  onChange,
  sessionBadge,
  chatBadge,
}: CoachMobileTabBarProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.08] bg-zinc-950/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Coach session sections"
    >
      <div className="mx-auto flex max-w-lg">
        {TABS.map(({ id, label, Icon }) => {
          const selected = active === id;
          const badge = id === "session" ? sessionBadge : id === "chat" ? chatBadge : false;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={selected ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 px-2 py-2 text-[10px] font-medium transition-colors",
                selected ? "text-brand" : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              <span className="relative">
                <Icon size={18} strokeWidth={selected ? 2.25 : 2} />
                {badge && (
                  <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-brand ring-2 ring-zinc-950" />
                )}
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
