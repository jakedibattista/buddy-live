# Knowledge corpus — sources and trust model

How Coach Buddy's retrieval corpus is built, what counts as "trusted,"
and how to extend it without polluting grounded answers.

## Trust hierarchy (highest → lowest)

1. **Buddy Live scoring rubric** — metric names, 0–10 scale, and fix cues
   must match `modelforpuckbuddy` rep analysis and the `metrics-*.md`
   files. If the corpus disagrees with a live scorecard, fix the corpus.

2. **Curated coaching authorship** — drill explanations, off-ice homework,
   and warm-up moves written for this product. Reviewed in git; no
   auto-scrape at ingest time.

3. **USA Hockey ADM concepts** — youth development ideas (small-area games,
   angling, puck protection, support) paraphrased in kid voice. Files
   prefixed `iq-usa-hockey-*` and tagged below. Not a copy of USA Hockey
   copyrighted curriculum; conceptual alignment only.

4. **Search hints** — `Search hint:` lines point humans (or future links)
   to external drill video. The coach may cite them; retrieval does not
   embed YouTube metadata today.

5. **Model improvisation** — when `lookup_drill_knowledge` returns
   `available: false`, the agent falls back to prompt samples. Corpus
   growth reduces how often that happens.

## Source tags (use in each doc footer)

| Tag | Meaning |
| --- | --- |
| `RUBRIC` | Tied to live rep metrics / `coaching._DRILL_RECOMMENDATIONS` |
| `ADM` | USA Hockey American Development Model — conceptual |
| `OFF-ICE` | Safe in a garage/basement; no ice required |
| `IQ-CARD` | Structured scenario for `show_iq_visual` + `mark_iq_answer` |
| `WARMUP` | Used by `lookup_warmup_moves` |
| `RECOVERY` | Post-rep analysis wait / cool-down stretch |

## Editorial rules

- One idea per sentence for ages ≤10; max two clauses for 11–13.
- Never invent metric names — use the canonical list in `metrics-*.md`.
- Every homework drill must be **off-ice safe** (no full-speed collisions,
  no advice that requires ice or a partner checking).
- IQ scenarios must include **Options** and **Correct** so the coach can
  call `mark_iq_answer` consistently.
- Warm-up / recovery moves: always **30 seconds** unless noted.

## Files by purpose

| File | Tags | Primary tool |
| --- | --- | --- |
| `drill-*.md`, `metrics-*.md` | RUBRIC, OFF-ICE | `lookup_drill_knowledge`, `recommend_drill` |
| `homework-off-ice.md` | RUBRIC, OFF-ICE | `recommend_drill`, recap |
| `warmup-general.md`, `warmup-hockey.md` | WARMUP, OFF-ICE | `lookup_warmup_moves` |
| `recovery-moves.md` | RECOVERY, OFF-ICE | `lookup_drill_knowledge` (analysis wait) |
| `iq-rules-basics.md`, `iq-shot-selection.md`, `iq-positioning.md` | IQ-CARD, ADM | `lookup_drill_knowledge` (IQ coach) |
| `iq-scenarios-catalog.md` | IQ-CARD | `lookup_drill_knowledge` (scenario variety) |
| `iq-usa-hockey-*.md` | IQ-CARD, ADM | `lookup_drill_knowledge` |

## Adding trusted content later

Preferred order:

1. Puck Buddy / Coach Seth approved copy → new `.md` in this folder.
2. USA Hockey ADM public articles → paraphrase into kid voice, tag `ADM`.
3. Verified YouTube curriculum → summarize in prose + `Search hint:` URL;
   do not paste transcripts wholesale.

After any edit: `gsutil` upload + Discovery Engine re-import (see
`README.md` in this folder).
