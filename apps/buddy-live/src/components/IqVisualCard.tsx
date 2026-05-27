"use client";

import { useMemo } from "react";
import type { IqVisualCommand } from "@/lib/types";

interface IqVisualCardProps {
  command: IqVisualCommand | null;
  className?: string;
}

export function IqVisualCard({ command, className = "" }: IqVisualCardProps) {
  if (!command) return null;

  return (
    <div
      className={`animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-2xl border border-indigo-400/30 bg-gradient-to-br from-indigo-950/90 to-zinc-900/90 p-5 shadow-xl backdrop-blur-md ${className}`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-lg">🧠</span>
        <span className="text-xs font-semibold uppercase tracking-widest text-indigo-300">
          Hockey IQ
        </span>
      </div>

      {command.diagram && <DiagramVisual diagram={command.diagram} />}

      <p className="mt-3 text-sm leading-relaxed text-white/90">
        {command.scenario}
      </p>

      {command.options.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {command.options.map((option, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/30 text-xs font-bold text-indigo-200">
                {String.fromCharCode(65 + i)}
              </span>
              <span>{option}</span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] text-zinc-500">
        Talk through your answer with Coach Buddy
      </p>
    </div>
  );
}

function DiagramVisual({ diagram }: { diagram: string }) {
  const positions = useMemo(() => parseDiagramPositions(diagram), [diagram]);

  return (
    <div className="relative mt-3 h-32 w-full overflow-hidden rounded-xl border border-white/10 bg-zinc-900/80">
      {/* Half-rink background */}
      <svg
        viewBox="0 0 200 100"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Ice surface */}
        <rect x="0" y="0" width="200" height="100" fill="#1a2744" />
        {/* Blue line */}
        <line x1="0" y1="85" x2="200" y2="85" stroke="#3b82f6" strokeWidth="1.5" opacity="0.4" />
        {/* Center line hint */}
        <line x1="0" y1="50" x2="200" y2="50" stroke="#ef4444" strokeWidth="0.5" opacity="0.3" />
        {/* Circles */}
        <circle cx="50" cy="35" r="15" fill="none" stroke="#ef4444" strokeWidth="0.5" opacity="0.3" />
        <circle cx="150" cy="35" r="15" fill="none" stroke="#ef4444" strokeWidth="0.5" opacity="0.3" />
        {/* Goal crease */}
        <path d="M 85 5 Q 100 18 115 5" fill="none" stroke="#3b82f6" strokeWidth="1" opacity="0.5" />
        {/* Goal line */}
        <line x1="70" y1="5" x2="130" y2="5" stroke="#ef4444" strokeWidth="1" opacity="0.4" />
        {/* Net */}
        <rect x="90" y="1" width="20" height="5" fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.3" />

        {/* Player position */}
        {positions.player && (
          <g>
            <circle cx={positions.player.x} cy={positions.player.y} r="5" fill="#22c55e" opacity="0.9" />
            <text x={positions.player.x} y={positions.player.y + 1.5} textAnchor="middle" fontSize="5" fill="white" fontWeight="bold">Y</text>
          </g>
        )}

        {/* Goalie */}
        {positions.goalie && (
          <g>
            <rect x={positions.goalie.x - 4} y={positions.goalie.y - 3} width="8" height="6" rx="1" fill="#f59e0b" opacity="0.8" />
            <text x={positions.goalie.x} y={positions.goalie.y + 1.5} textAnchor="middle" fontSize="4" fill="white" fontWeight="bold">G</text>
          </g>
        )}

        {/* Defender */}
        {positions.defender && (
          <g>
            <circle cx={positions.defender.x} cy={positions.defender.y} r="4" fill="#ef4444" opacity="0.8" />
            <text x={positions.defender.x} y={positions.defender.y + 1.5} textAnchor="middle" fontSize="4" fill="white" fontWeight="bold">D</text>
          </g>
        )}

        {/* Teammate */}
        {positions.teammate && (
          <g>
            <circle cx={positions.teammate.x} cy={positions.teammate.y} r="4" fill="#22c55e" opacity="0.6" />
            <text x={positions.teammate.x} y={positions.teammate.y + 1.5} textAnchor="middle" fontSize="4" fill="white">T</text>
          </g>
        )}
      </svg>

      {/* Diagram text overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
        <p className="text-[10px] leading-tight text-zinc-300">{diagram}</p>
      </div>
    </div>
  );
}

interface Positions {
  player: { x: number; y: number } | null;
  goalie: { x: number; y: number } | null;
  defender: { x: number; y: number } | null;
  teammate: { x: number; y: number } | null;
}

function parseDiagramPositions(diagram: string): Positions {
  const lower = diagram.toLowerCase();
  const positions: Positions = {
    player: null,
    goalie: null,
    defender: null,
    teammate: null,
  };

  // Player position based on keywords
  if (lower.includes("behind the net") || lower.includes("behind the goal")) {
    positions.player = { x: 100, y: 8 };
  } else if (lower.includes("crease") || lower.includes("in front of the net")) {
    positions.player = { x: 100, y: 22 };
  } else if (lower.includes("slot") || lower.includes("hash marks")) {
    positions.player = { x: 100, y: 40 };
  } else if (lower.includes("left circle") || lower.includes("left faceoff")) {
    positions.player = { x: 50, y: 35 };
  } else if (lower.includes("right circle") || lower.includes("right faceoff")) {
    positions.player = { x: 150, y: 35 };
  } else if (lower.includes("blue line") || lower.includes("point")) {
    positions.player = { x: 100, y: 80 };
  } else if (lower.includes("breakaway")) {
    positions.player = { x: 100, y: 55 };
  } else {
    positions.player = { x: 100, y: 50 };
  }

  // Goalie
  if (lower.includes("goalie") || lower.includes("goaltender") || lower.includes("netminder")) {
    if (lower.includes("goalie is way out") || lower.includes("goalie out")) {
      positions.goalie = { x: 100, y: 18 };
    } else if (lower.includes("goalie goes down") || lower.includes("goalie down")) {
      positions.goalie = { x: 100, y: 10 };
    } else {
      positions.goalie = { x: 100, y: 8 };
    }
  } else {
    positions.goalie = { x: 100, y: 8 };
  }

  // Defender
  if (lower.includes("defender") || lower.includes("d ") || lower.includes("d-man")) {
    if (lower.includes("closing") || lower.includes("on your hip")) {
      const px = positions.player?.x ?? 100;
      const py = positions.player?.y ?? 50;
      positions.defender = { x: px + 15, y: py + 10 };
    } else if (lower.includes("drops to block") || lower.includes("shot block")) {
      positions.defender = { x: 100, y: 65 };
    } else if (lower.includes("pinch")) {
      positions.defender = { x: 60, y: 60 };
    } else {
      positions.defender = { x: 130, y: 50 };
    }
  }

  // Teammate (2-on-1 scenarios)
  if (lower.includes("2-on-1") || lower.includes("2 on 1") || lower.includes("teammate") || lower.includes("trailer")) {
    const px = positions.player?.x ?? 100;
    positions.teammate = { x: px > 100 ? px - 40 : px + 40, y: (positions.player?.y ?? 50) - 5 };
  }

  return positions;
}
