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
            className={`font-semibold uppercase tracking-widest text-zinc-400 ${titleSize}`}
          >
            Question {questionIndex} of {totalQuestions}
          </span>
        </div>
      ) : null}

      {command.diagram && <DiagramVisual diagram={command.diagram} size={size} />}

      <p className={`mt-3 text-white/90 font-medium ${scenarioSize}`}>{command.scenario}</p>

      {command.options.length > 0 && (
        <div className={`mt-4 flex flex-col ${size === "lg" ? "gap-2.5" : "gap-1.5"}`}>
          {command.options.map((option, i) => {
            const letter = String.fromCharCode(65 + i);
            const state = optionState(letter, answer);
            return (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-lg border transition-colors duration-150 ${optionPad} ${optionSize} ${stateClasses(state)}`}
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
                <span className="font-medium">{option}</span>
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
      return "border-emerald-500 bg-emerald-500/10 text-emerald-100";
    case "wrong":
      return "border-red-500 bg-red-500/10 text-red-100";
    default:
      return "border-zinc-800 bg-zinc-900/40 text-zinc-200 hover:border-zinc-700/60";
  }
}

function badgeClasses(state: OptionState): string {
  switch (state) {
    case "correct":
      return "bg-emerald-500 text-white";
    case "wrong":
      return "bg-red-500 text-white";
    default:
      return "bg-zinc-800 text-zinc-300";
  }
}

interface Position {
  x: number;
  y: number;
}

interface Positions {
  player: Position | null;
  goalie: Position | null;
  defender: Position | null;
  teammate: Position | null;
  playerStart?: Position | null;
  defenderStart?: Position | null;
  drawPassLine?: boolean;
}

function DiagramVisual({ diagram, size = "sm" }: { diagram: string; size?: "sm" | "lg" }) {
  const positions = useMemo(() => parseDiagramPositions(diagram), [diagram]);
  const heightClass = size === "lg" ? "h-72 sm:h-96" : "h-36";

  return (
    <div
      className={`relative mt-3 w-full overflow-hidden rounded-xl border-4 border-zinc-400/80 bg-[#fbfcfd] shadow-lg ${heightClass}`}
      style={{
        boxShadow: "inset 0 2px 10px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      {/* Aluminum Board Trim top indicator */}
      <div className="absolute top-0 inset-x-0 h-[3px] bg-zinc-300 opacity-60 z-10" />

      {/* Vertical 1:1 Proportional Rink Rendering */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Organic Felt Marker Stroke Filter (smooth but hand-drawn felt-tip pen look) */}
          <filter id="marker" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="1" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.4" xChannelSelector="R" yChannelSelector="G" />
          </filter>

          {/* Marker arrowhead for defender movement (Red) */}
          <marker
            id="marker-arrow-defender"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 2 L 8 5 L 0 8 z" fill="#dc2626" opacity="0.9" filter="url(#marker)" />
          </marker>

          {/* Marker arrowhead for player movement (Black/Blue) */}
          <marker
            id="marker-arrow-player"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 2 L 8 5 L 0 8 z" fill="#1e293b" opacity="0.9" filter="url(#marker)" />
          </marker>
        </defs>

        {/* --- TRADITIONAL WHITEBOARD RINK MARKINGS (Red, Blue, Black/Grey) --- */}
        <g fill="none" strokeWidth="0.8" filter="url(#marker)">
          {/* Outer Boards (Subtle grey boundary) */}
          <rect x="2" y="2" width="96" height="96" rx="10" stroke="#94a3b8" strokeWidth="1" strokeOpacity="0.45" />

          {/* Goal Net - Grey mesh outline */}
          <rect x="44" y="6" width="12" height="6" stroke="#64748b" strokeWidth="0.65" strokeOpacity="0.6" strokeDasharray="1 1" />

          {/* Faceoff Circles (y=35, x=25 and x=75) - Red */}
          <circle cx="25" cy="35" r="12" stroke="#ef4444" strokeWidth="0.55" strokeOpacity="0.7" strokeDasharray="1.5 1.5" />
          <circle cx="75" cy="35" r="12" stroke="#ef4444" strokeWidth="0.55" strokeOpacity="0.7" strokeDasharray="1.5 1.5" />
          
          {/* Faceoff Dots - Red */}
          <circle cx="25" cy="35" r="0.8" fill="#ef4444" fillOpacity="0.8" />
          <circle cx="75" cy="35" r="0.8" fill="#ef4444" fillOpacity="0.8" />

          {/* Offensive Blue Line (y=75) - Solid Blue. This is the deepest
              marking in the offensive-zone half-rink; no center red line is
              drawn (it sat at the very bottom edge and read as a stray line). */}
          <line x1="2" y1="75" x2="98" y2="75" stroke="#2563eb" strokeWidth="1.5" strokeOpacity="0.85" />
        </g>

        {/* Goal line + crease: crisp, board-to-board (real rink geometry) */}
        <line x1="2" y1="12" x2="98" y2="12" stroke="#ef4444" strokeWidth="0.9" strokeOpacity="0.85" />
        <path d="M 42 12 Q 50 18 58 12 Z" fill="#eff6ff" stroke="none" />
        <path d="M 42 12 Q 50 18 58 12" stroke="#2563eb" strokeWidth="0.85" strokeOpacity="0.8" fill="none" />

        {/* --- TACTICAL MOVEMENT ARROWS & PASS LINES --- */}
        {/* Pass Line (fine dotted blue marker line from player to teammate) */}
        {positions.drawPassLine && positions.player && positions.teammate && (
          <line
            x1={positions.player.x}
            y1={positions.player.y}
            x2={positions.teammate.x}
            y2={positions.teammate.y}
            stroke="#2563eb"
            strokeWidth="1.1"
            strokeDasharray="1.5 2.5"
            opacity="0.85"
            filter="url(#marker)"
          />
        )}

        {/* Player Movement Arrow (breakaways / rushes) - Black Marker */}
        {positions.playerStart && positions.player && (
          <line
            x1={positions.playerStart.x}
            y1={positions.playerStart.y}
            x2={positions.player.x}
            y2={positions.player.y}
            stroke="#1e293b"
            strokeWidth="1.3"
            strokeDasharray="2.5 2.5"
            opacity="0.9"
            markerEnd="url(#marker-arrow-player)"
            filter="url(#marker)"
          />
        )}

        {/* Defender Closing / Sliding Arrow - Red Marker */}
        {positions.defenderStart && positions.defender && (
          <line
            x1={positions.defenderStart.x}
            y1={positions.defenderStart.y}
            x2={positions.defender.x}
            y2={positions.defender.y}
            stroke="#dc2626"
            strokeWidth="1.3"
            strokeDasharray="2.5 2.5"
            opacity="0.9"
            markerEnd="url(#marker-arrow-defender)"
            filter="url(#marker)"
          />
        )}

        {/* --- TEAMMATE (Blue Marker X / T) --- */}
        {positions.teammate && (
          <g filter="url(#marker)">
            <circle cx={positions.teammate.x} cy={positions.teammate.y} r="3" fill="#eff6ff" stroke="#2563eb" strokeWidth="0.95" />
            <text
              x={positions.teammate.x}
              y={positions.teammate.y + 1}
              textAnchor="middle"
              fontSize="3.2"
              fill="#1d4ed8"
              fontWeight="bold"
              fontFamily="monospace"
            >
              T
            </text>
          </g>
        )}

        {/* --- DEFENDER (Red Marker O / D) --- */}
        {positions.defender && (
          <g filter="url(#marker)">
            <circle cx={positions.defender.x} cy={positions.defender.y} r="3" fill="#fef2f2" stroke="#dc2626" strokeWidth="0.95" />
            <text
              x={positions.defender.x}
              y={positions.defender.y + 1}
              textAnchor="middle"
              fontSize="3.2"
              fill="#b91c1c"
              fontWeight="bold"
              fontFamily="monospace"
            >
              D
            </text>
          </g>
        )}

        {/* --- GOALIE (Blue marker G) --- */}
        {positions.goalie && (
          <g filter="url(#marker)">
            <rect
              x={positions.goalie.x - 3.5}
              y={positions.goalie.y - 2.5}
              width="7"
              height="4.5"
              rx="1"
              fill="#eff6ff"
              stroke="#2563eb"
              strokeWidth="1"
            />
            <text
              x={positions.goalie.x}
              y={positions.goalie.y + 1}
              textAnchor="middle"
              fontSize="3"
              fill="#1d4ed8"
              fontWeight="bold"
              fontFamily="monospace"
            >
              G
            </text>
          </g>
        )}

        {/* --- ACTIVE PLAYER (Black Marker X / YOU) --- */}
        {positions.player && (
          <g filter="url(#marker)">
            <circle cx={positions.player.x} cy={positions.player.y} r="3.5" fill="#f1f5f9" stroke="#1e293b" strokeWidth="1.2" />
            <text
              x={positions.player.x}
              y={positions.player.y + 1.1}
              textAnchor="middle"
              fontSize="3.5"
              fill="#0f172a"
              fontWeight="bold"
              fontFamily="monospace"
            >
              X
            </text>
            <text
              x={positions.player.x}
              y={positions.player.y + 6.5}
              textAnchor="middle"
              fontSize="2.5"
              fill="#0f172a"
              fontWeight="black"
              opacity="0.9"
            >
              YOU
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

function findSegmentForEntity(segments: string[], entityKeywords: string[], excludeKeywords: string[]): string {
  for (const s of segments) {
    if (entityKeywords.some((k) => s.includes(k))) {
      if (!excludeKeywords.some((k) => s.includes(k))) {
        return s;
      }
    }
  }
  for (const s of segments) {
    if (entityKeywords.some((k) => s.includes(k))) {
      return s;
    }
  }
  return "";
}

// Upgraded, relative-aware positional parser (Vertical 1:1 format)
function parseDiagramPositions(diagram: string): Positions {
  const lower = diagram.toLowerCase();
  // Receiving a pass is not a pass-to-teammate play — avoid a stray T marker.
  const receivingPass =
    /\b(get|got|catch|receive|receives|receiving)\s+(?:a\s+)?pass\b/.test(lower) ||
    /\bpass\s+right\s+in\s+front\b/.test(lower);
  const positions: Positions = {
    player: { x: 50, y: 55 }, // Default to high slot / breakaway ready
    goalie: { x: 50, y: 13 }, // Default to crease center
    defender: null,
    teammate: null,
    playerStart: null,
    defenderStart: null,
    drawPassLine: false,
  };

  const segments = lower.split(/[.;,]/).map(s => s.trim()).filter(Boolean);
  const playerSegment = findSegmentForEntity(segments, ["you", "your", "player"], ["teammate", "defender", "d-man", "opponent", "goalie"]) || lower;
  const defenderSegment = findSegmentForEntity(segments, ["defender", "d-man", "opponent", " d ", "d ", "blocker"], ["teammate"]) || lower;
  const teammateSegment = findSegmentForEntity(segments, ["teammate", "trailer", "trailing"], []) || lower;

  // A teammate "in front of the net" / "blocking the goalie's view" is a
  // SCREEN: the teammate stands at the net-front, the shooter stays back.
  // Detect it up front so "in front of the net" doesn't get attributed to the
  // player below (which used to plant YOU on the doorstep instead).
  const teammateScreens =
    teammateSegment.includes("teammate") &&
    (teammateSegment.includes("in front of the net") ||
      teammateSegment.includes("in front of the goal") ||
      teammateSegment.includes("screen") ||
      teammateSegment.includes("blocking the goalie") ||
      teammateSegment.includes("goalie's view") ||
      teammateSegment.includes("goalies view"));

  // Helper to test for standalone entity keywords with word boundaries to avoid false positives (e.g. "behind " -> "d ", "backhand " -> "d ")
  const hasDefenderKeyword = /\b(defender|d-man|opponent|d|blocker)\b/.test(lower);

  // 1. Determine Player Position
  if (playerSegment.includes("behind the net") || playerSegment.includes("behind the goal")) {
    positions.player = { x: 50, y: 6 };
  } else if (playerSegment.includes("left corner")) {
    positions.player = { x: 18, y: 20 };
  } else if (playerSegment.includes("right corner")) {
    positions.player = { x: 82, y: 20 };
  } else if (playerSegment.includes("corner")) {
    // Deep in the zone beside the net (default to the left corner).
    positions.player = { x: 18, y: 20 };
  } else if (
    playerSegment.includes("right in front of the net") ||
    playerSegment.includes("pass right in front") ||
    receivingPass
  ) {
    positions.player = { x: 50, y: 24 };
  } else if (
    !teammateScreens &&
    (playerSegment.includes("crease") || playerSegment.includes("in front of the net") || playerSegment.includes("doorstep"))
  ) {
    positions.player = { x: 50, y: 22 };
  } else if (playerSegment.includes("left circle") || playerSegment.includes("left faceoff") || playerSegment.includes("left wing")) {
    positions.player = { x: 25, y: 40 };
  } else if (playerSegment.includes("right circle") || playerSegment.includes("right faceoff") || playerSegment.includes("right wing")) {
    positions.player = { x: 75, y: 40 };
  } else if (playerSegment.includes("left point") || playerSegment.includes("left blue line")) {
    positions.player = { x: 25, y: 82 };
  } else if (playerSegment.includes("right point") || playerSegment.includes("right blue line")) {
    positions.player = { x: 75, y: 82 };
  } else if (playerSegment.includes("blue line") || playerSegment.includes("point")) {
    positions.player = { x: 50, y: 82 };
  } else if (playerSegment.includes("slot") || playerSegment.includes("hash marks")) {
    positions.player = { x: 50, y: 45 };
  } else if (playerSegment.includes("breakaway")) {
    positions.player = { x: 50, y: 65 };
    // Draw breakaway movement line starting further down the ice
    positions.playerStart = { x: 50, y: 85 };
  } else if (lower.includes("puck in the corner") && !lower.includes("you have")) {
    // If the scenario mentions a puck is in the corner but not "you have", player is not on the ice / defaults to off-ice
    positions.player = null;
  }

  // 2. Determine Goalie Position
  if (lower.includes("goalie is way out") || lower.includes("goalie out") || lower.includes("goalie aggressive")) {
    positions.goalie = { x: 50, y: 25 }; // Out challenging
  } else if (lower.includes("goalie is down") || lower.includes("goalie down") || lower.includes("butterfly")) {
    positions.goalie = { x: 50, y: 14 }; // Butterfly
  } else if (lower.includes("left post")) {
    positions.goalie = { x: 44, y: 12 }; // Left side of goal line
  } else if (lower.includes("right post")) {
    positions.goalie = { x: 56, y: 12 }; // Right side of goal line
  } else if (/\bgoalie is cheating to the right\b/.test(lower) || /\bgoalie is cheating right\b/.test(lower)) {
    positions.goalie = { x: 58, y: 13 }; // Shift goalie to the right
  } else if (/\bgoalie is cheating to the left\b/.test(lower) || /\bgoalie is cheating left\b/.test(lower)) {
    positions.goalie = { x: 42, y: 13 }; // Shift goalie to the left
  } else {
    positions.goalie = { x: 50, y: 13 }; // Standard crease center
  }

  // 3. Determine Defender Position (Surgically relative to player coordinates!)
  const px = positions.player?.x ?? 50;
  const py = positions.player?.y ?? 55;

  if (hasDefenderKeyword) {
    if (defenderSegment.includes("on your hip") || defenderSegment.includes("on your left")) {
      positions.defender = { x: px - 11, y: py + 2 };
    } else if (defenderSegment.includes("on your right")) {
      positions.defender = { x: px + 11, y: py + 2 };
    } else if (defenderSegment.includes("drops to block") || defenderSegment.includes("shot block") || defenderSegment.includes("sliding")) {
      if (py <= 35) {
        // Net-front: slide in from a wing, not from behind the net.
        const fromLeft =
          defenderSegment.includes("from the left") ||
          defenderSegment.includes("left circle") ||
          defenderSegment.includes("left wing");
        if (fromLeft) {
          positions.defender = { x: px + 6, y: py - 4 };
          positions.defenderStart = { x: px - 22, y: py };
        } else {
          positions.defender = { x: px - 6, y: py - 4 };
          positions.defenderStart = { x: px + 22, y: py };
        }
      } else {
        positions.defender = { x: px, y: py - 12 };
        positions.defenderStart = { x: px + 16, y: py - 15 };
      }
    } else if (defenderSegment.includes("backing up")) {
      positions.defender = { x: px, y: py - 14 };
      positions.defenderStart = { x: px, y: py - 6 }; // Backing away from player
    } else if (defenderSegment.includes("closing") || defenderSegment.includes("charging") || defenderSegment.includes("rushing")) {
      // If player is at the point, defender closes down from slot. Otherwise closes up.
      if (py > 70) {
        positions.defender = { x: px, y: py - 14 };
        positions.defenderStart = { x: px, y: py - 28 };
      } else {
        positions.defender = { x: px + 8, y: py - 2 };
        positions.defenderStart = { x: px + 22, y: py - 10 };
      }
    } else {
      // Fallback wing-aware tactical placement (prevents defender on opposite side of rink!)
      if (px < 40) {
        positions.defender = { x: px + 16, y: py - 4 }; // Defending inside cut on left wing
      } else if (px > 60) {
        positions.defender = { x: px - 16, y: py - 4 }; // Defending inside cut on right wing
      } else {
        positions.defender = { x: 50, y: py - 15 }; // Block high slot center
      }
    }
  }

  // 4. Determine Teammate Position
  if (teammateScreens) {
    // Net-front screen: teammate sits just in front of the goalie, between
    // the shooter and the net. No pass line — this is a traffic/screen play.
    positions.teammate = { x: positions.goalie!.x, y: positions.goalie!.y + 7 };
  } else if (
    !receivingPass &&
    (lower.includes("2-on-1") ||
      lower.includes("2 on 1") ||
      lower.includes("teammate") ||
      lower.includes("trailer") ||
      (lower.includes("pass") && !lower.includes("you get")))
  ) {
    if (teammateSegment.includes("trailer") || teammateSegment.includes("trailing")) {
      positions.teammate = { x: px, y: py + 16 };
    } else if (
      teammateSegment.includes("in the slot") ||
      teammateSegment.includes("in front") ||
      teammateSegment.includes("net front") ||
      teammateSegment.includes("net-front") ||
      teammateSegment.includes("doorstep") ||
      teammateSegment.includes("crease")
    ) {
      // Teammate parked in the slot / in front of the net (e.g. "behind the
      // net, teammate open in the slot"). Sits in the high slot, not on a wing.
      positions.teammate = { x: 50, y: 40 };
    } else if (teammateSegment.includes("left circle") || teammateSegment.includes("left wing") || teammateSegment.includes("left faceoff")) {
      positions.teammate = { x: 25, y: 40 };
    } else if (teammateSegment.includes("right circle") || teammateSegment.includes("right wing") || teammateSegment.includes("right faceoff")) {
      positions.teammate = { x: 75, y: 40 };
    } else if (teammateSegment.includes("point") || teammateSegment.includes("blue line")) {
      positions.teammate = { x: 50, y: 80 };
    } else {
      // Place teammate on opposite wing for lateral cross-crease passes
      positions.teammate = { x: px > 50 ? px - 35 : px + 35, y: py - 4 };
    }

    // Draw pass guidance indicator if pass scenario is mentioned
    if (!receivingPass && (lower.includes("pass") || lower.includes("saucer"))) {
      positions.drawPassLine = true;
    }
  }

  return positions;
}
