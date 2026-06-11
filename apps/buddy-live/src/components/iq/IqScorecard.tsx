"use client";

import { useMemo } from "react";
import type { CoachCommand, IqVisualCommand, IqAnswerCommand } from "@/lib/types";
import { Award, CheckCircle2, XCircle, BookOpen, Compass } from "lucide-react";

interface Props {
  commands: CoachCommand[];
}

export function IqScorecard({ commands }: Props) {
  const iqSessionsData = useMemo(() => {
    const visuals = commands.filter((c): c is IqVisualCommand => c.type === "show_iq_visual");
    const answers = commands.filter((c): c is IqAnswerCommand => c.type === "mark_iq_answer");

    // Pair visuals and answers chronologically
    const paired = visuals.map((vis) => {
      // Find the first answer that was created after this visual, but before the next visual
      const nextVisual = visuals.find((v) => v.created_at > vis.created_at);
      const answer = answers.find(
        (ans) =>
          ans.created_at > vis.created_at && (!nextVisual || ans.created_at < nextVisual.created_at)
      );

      return {
        visual: vis,
        answer: answer ?? null,
      };
    });

    const total = paired.length;
    const correct = paired.filter((p) => p.answer?.was_correct === true).length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    return {
      paired,
      total,
      correct,
      accuracy,
    };
  }, [commands]);

  const { paired, total, correct, accuracy } = iqSessionsData;

  if (total === 0) return null;

  let title = "Apprentice";
  let titleColor = "text-zinc-400 bg-zinc-400/10 border-zinc-400/20";
  if (accuracy >= 85) {
    title = "Tactical Genius";
    titleColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  } else if (accuracy >= 65) {
    title = "Playmaker";
    titleColor = "text-blue-400 bg-blue-500/10 border-blue-500/20";
  }

  // Generate study recommendations based on wrong answers
  const wrongAnswers = paired.filter((p) => p.answer && !p.answer.was_correct);

  return (
    <div className="w-full rounded-2xl border border-white/[0.08] bg-zinc-950/90 p-5 text-white shadow-lg backdrop-blur-md transition-all duration-300 md:p-8">
      {/* Top Header & Overview */}
      <div className="flex flex-col items-center justify-between gap-6 pb-6 border-b border-zinc-800/50 sm:flex-row">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand">
            Hockey IQ Practice Report
          </span>
          <h2 className="text-2xl font-bold tracking-tight mt-1 text-white">
            Performance Scorecard
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Analyzing your positional reads and game decision making
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${titleColor}`}>
              <Award className="h-3 w-3" />
              {title}
            </span>
            <div className="text-[10px] text-zinc-500 font-mono mt-1">
              SCORE: {correct}/{total}
            </div>
          </div>

          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 border border-zinc-800">
            <span className="text-lg font-bold font-mono">{accuracy}%</span>
          </div>
        </div>
      </div>

      {/* Single column: recommendations first (player feedback: they were
          hidden in a side column), then the per-question breakdown. */}
      <div className="mt-6 space-y-8">

        {/* Study Guide & Recommendations */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-brand" />
            Study Recommendations
          </h3>

          <div className="rounded-xl border border-white/[0.04] bg-zinc-900/20 p-4 space-y-4">
            {wrongAnswers.length > 0 ? (
              <>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Based on your missed scenarios, here are a few tactical concepts to study before your next game:
                </p>
                <div className="space-y-3">
                  {wrongAnswers.map((item, index) => {
                    const vis = item.visual;
                    let topic = "Positional Play";
                    let tip = "Pay close attention to where defenders slide on the ice.";

                    const sc = vis.scenario.toLowerCase();
                    if (sc.includes("puck") && (sc.includes("line") || sc.includes("goal"))) {
                      topic = "Rules: Scoring Boundary";
                      tip = "The entire puck must completely cross the red goal line. If even a tiny sliver is on the line, it is no goal.";
                    } else if (sc.includes("goalie") && sc.includes("skate") && sc.includes("other net")) {
                      topic = "Rules: Goalie Boundaries";
                      tip = "Goalies are not allowed to cross the center red line. Playing offense down the ice is restricted by the rules.";
                    } else if (sc.includes("pass") || sc.includes("2-on-1") || sc.includes("2 on 1")) {
                      topic = "Passing Lanes";
                      tip = "Pass when the defender slides toward you. Shoot if they cover your teammate. Always read the sliding defender's path.";
                    } else if (sc.includes("defender") || sc.includes("block")) {
                      topic = "Puck Protection";
                      tip = "If a defender slides to block your shot, use a quick toe-drag or wait a split second for them to slide past before shooting.";
                    } else if (sc.includes("pull") || sc.includes("goalie")) {
                      topic = "Game Strategy: Pulling the Goalie";
                      tip = "Pull your goalie for an extra attacker only when down by 1 or 2 goals with very little time remaining, or on a delayed penalty.";
                    }

                    return (
                      <div key={index} className="space-y-1">
                        <div className="text-xs font-bold text-brand">{topic}</div>
                        <p className="text-[11px] text-zinc-400 leading-snug">
                          {tip}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-center py-6">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <div className="text-sm font-semibold text-white">Perfect Score!</div>
                <p className="text-xs text-zinc-400 mt-1 max-w-[200px] mx-auto">
                  You read every diagram perfectly. Keep using those eyes to dominate the play!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Scenarios Breakdown */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <Compass className="h-4 w-4 text-brand" />
            Decision Breakdown
          </h3>

          <div className="space-y-4">
            {paired.map((item, index) => {
              const vis = item.visual;
              const ans = item.answer;
              const wasCorrect = ans?.was_correct;

              return (
                <div
                  key={vis.id || index}
                  className="rounded-xl border border-white/[0.04] bg-zinc-900/30 p-4 transition-all hover:bg-zinc-900/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-mono text-xs text-zinc-500 mt-0.5 font-bold">
                      Q{index + 1}
                    </span>
                    <p className="text-sm font-medium flex-1 text-zinc-200">
                      {vis.scenario}
                    </p>
                    {ans ? (
                      wasCorrect ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                      )
                    ) : (
                      <span className="text-[10px] uppercase text-zinc-600 border border-zinc-800 px-1.5 py-0.5 rounded">
                        Skipped
                      </span>
                    )}
                  </div>

                  {/* Options List */}
                  {vis.options.length > 0 && (
                    <div className="mt-3 ml-6 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {vis.options.map((option, i) => {
                        const letter = String.fromCharCode(65 + i);
                        const isCorrectOption = letter === ans?.correct_choice;
                        const isPlayerOption = letter === ans?.player_choice;

                        let optionBg = "border-zinc-800/80 bg-zinc-900/20 text-zinc-400";
                        if (ans) {
                          if (isCorrectOption) {
                            optionBg = "border-emerald-500/20 bg-emerald-500/10 text-emerald-300 font-semibold";
                          } else if (isPlayerOption && !wasCorrect) {
                            optionBg = "border-red-500/20 bg-red-500/10 text-red-300";
                          }
                        }

                        return (
                          <div
                            key={i}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${optionBg}`}
                          >
                            <span className="font-bold text-zinc-500 font-mono">
                              {letter}.
                            </span>
                            <span>{option}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
