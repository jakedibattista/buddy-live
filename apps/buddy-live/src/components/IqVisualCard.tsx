"use client";

import { useMemo } from "react";
import type { IqAnswerCommand, IqVisualCommand } from "@/lib/types";

interface IqVisualCardProps {
  command: IqVisualCommand | null;
  answer?: IqAnswerCommand | null;
  size?: "sm" | "lg";
  className?: string;
  questionIndex?: number;
  totalQuestions?: number;
}

export function IqVisualCard({
  command,
  answer = null,
  size = "sm",
  className = "",
  questionIndex,
  totalQuestions = 8,
}: IqVisualCardProps) {
  if (!command) return null;

  const padding = size === "lg" ? "p-6 sm:p-8" : "p-5";
  const titleSize = size === "lg" ? "text-sm" : "text-xs";
  const scenarioSize =
    size === "lg" ? "text-lg sm:text-xl leading-snug" : "text-sm leading-relaxed";
  const optionSize = size === "lg" ? "text-base sm:text-lg" : "text-sm";
  const optionPad = size === "lg" ? "px-4 py-3" : "px-3 py-2";
  const optionBadgeSize = size === "lg" ? "h-7 w-7 text-sm" : "h-5 w-5 text-xs";

  return (
    <div
      className={`animate-in fade-in slide-in-from-bottom-2 duration-300 w-full ${padding} ${className}`}
    >
      {questionIndex ? (
        <div className="mb-2">
          <span
            className={`font-semibold uppercase tracking-wider text-indigo-300/80 ${titleSize}`}
          >
            Question {questionIndex} of {totalQuestions}
          </span>
        </div>
      ) : null}

      {command.diagram && <DiagramVisual diagram={command.diagram} size={size} />}

      <p className={`mt-3 text-white/90 ${scenarioSize}`}>{command.scenario}</p>

      {command.options.length > 0 && (
        <div className={`mt-3 flex flex-col ${size === "lg" ? "gap-2" : "gap-1.5"}`}>
          {command.options.map((option, i) => {
            const letter = String.fromCharCode(65 + i);
            const state = optionState(letter, answer);
            return (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-lg border ${optionPad} ${optionSize} ${stateClasses(state)}`}
              >
                <span
                  className={`mt-0.5 flex shrink-0 items-center justify-center rounded-full font-bold ${optionBadgeSize} ${badgeClasses(state)}`}
                >
                  {state === "correct"
                    ? "✓"
                    : state === "wrong"
                      ? "✕"
                      : letter}
                </span>
                <span>{option}</span>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

type OptionState = "correct" | "wrong" | "neutral";

function optionState(letter: string, answer: IqAnswerCommand | null | undefined): OptionState {
  if (!answer) return "neutral";
  if (letter === answer.correct_choice) return "correct";
  if (letter === answer.player_choice && !answer.was_correct) return "wrong";
  return "neutral";
}

function stateClasses(state: OptionState): string {
  switch (state) {
    case "correct":
      return "border-emerald-400/60 bg-emerald-500/15 text-emerald-100";
    case "wrong":
      return "border-red-400/60 bg-red-500/15 text-red-100";
    default:
      return "border-zinc-800/60 bg-zinc-900/40 text-zinc-200";
  }
}

function badgeClasses(state: OptionState): string {
  switch (state) {
    case "correct":
      return "bg-emerald-500/40 text-emerald-100";
    case "wrong":
      return "bg-red-500/40 text-red-100";
    default:
      return "bg-zinc-800 text-zinc-300";
  }
}

function DiagramVisual({ diagram, size = "sm" }: { diagram: string; size?: "sm" | "lg" }) {
  const positions = useMemo(() => parseDiagramPositions(diagram), [diagram]);
  const heightClass = size === "lg" ? "h-72 sm:h-96" : "h-32";
  const captionTextClass = size === "lg" ? "text-sm sm:text-base" : "text-[10px]";

  return (
    <div
      className={`relative mt-3 w-full overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-900/40 ${heightClass}`}
    >

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
