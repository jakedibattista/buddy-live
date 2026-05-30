# Track 2 phases — plain-language guide

Short explanations of what Phases 1–4 and 6 shipped, how to use them, and
honest limits. Technical detail lives in [`TRACK2-PLAN.md`](TRACK2-PLAN.md).

**Checklist of follow-ups (do later):** [`TRACK2-TODOS.md`](TRACK2-TODOS.md).

**Living phase journal** (what we shipped, measured, and learned as we go):
[`TRACK2-PHASE-JOURNAL.md`](TRACK2-PHASE-JOURNAL.md).

---

## One-line summary

| Phase | In one sentence |
| --- | --- |
| **1** | Fake players + fake tools so we can grade the coach safely and repeatedly. |
| **2** | See every step of a live turn in Cloud Trace. |
| **3** | Look up real drill/metric docs instead of hard-coded lists and prompt memory. |
| **4** | Greet returning kids with a nod to last session. |
| **6** | Automatically improve the prompt using those same fake-player tests (harness fixed; seed kept on first full run). |
| **5** | Split one big coach into specialists (`vision_coach`, `drill_coach`, `iq_coach`) that hand off to each other. |

---

## Phase 1 — Robot kids that stress-test the coach

### What it is

ADK runs full voice-style conversations where a **synthetic player** (another
Gemini model) talks to Coach Buddy. All tools (camera, reps, analysis, IQ
visuals, memory) are **mocked** so nothing hits Firestore, Roboflow, or
modelforpuckbuddy. Two judges score the run: **groundedness** (no made-up
scorecards) and **safety** (kid-appropriate).

### Run everything

```bash
cd services/buddy-live-adk
# GOOGLE_API_KEY in .env
make install
make eval              # happy-path mocks
make eval-failures     # injects camera/analysis failures
```

### Hockey IQ testing (synthetic player)

The built-in **no space → IQ mode** scenario is the second entry in
`evals/conversation_scenarios.json` (Sam, 12, no room to shoot). It expects the
root coach to offer Hockey IQ practice, then **`transfer_to_agent` → `iq_coach`**
for at least three scenario questions.

**Run only that scenario** (after the eval set exists on disk):

```bash
cd services/buddy-live-adk
export PYTHONPATH="$(pwd)"
.venv/bin/adk eval \
  evals/agent_module \
  --config_file_path evals/eval_config.json \
  evals/agent_module/coaching_scenarios.evalset.json:285f6d24 \
  --print_detailed_results
```

If `285f6d24` does not match your eval set (you regenerated scenarios), open
`evals/agent_module/coaching_scenarios.evalset.json`, find the case whose
`conversation_plan` mentions Hockey IQ / no space, and use that `eval_id` in
the `:suffix` above.

**Add or change IQ scenarios**

1. Edit `evals/conversation_scenarios.json` — add a block with
   `starting_prompt`, `conversation_plan` (what the fake kid should do), and
   `user_persona` (`NOVICE` or `EXPERT`).
2. Refresh the eval set (pick one):
   - Delete `evals/agent_module/coaching_scenarios.evalset.json` and run
     `make eval-setup`, or
   - `adk eval_set add_eval_case evals/agent_module coaching_scenarios \
     --scenarios_file evals/conversation_scenarios.json \
     --session_input_file evals/session_input.json`
3. Re-run with the new `eval_id` suffix or `make eval`.

IQ-specific tools mocked in `evals/environment_simulation.py`:
`show_iq_visual`, `mark_iq_answer`, plus `lookup_drill_knowledge` for rules
questions during IQ chat.

More commands: [`services/buddy-live-adk/evals/README.md`](../services/buddy-live-adk/evals/README.md).

---

## Phase 3 — Drill knowledge library (Vertex AI Search)

### What it is

Ten markdown files under `services/buddy-live-adk/knowledge/` (drills, metrics,
hockey-IQ topics). At runtime, `lookup_drill_knowledge` searches them when
`BUDDY_VERTEX_SEARCH_DATA_STORE_ID` is set; otherwise the coach falls back to
the legacy Python dict and generic YouTube **search** URLs.

### Where the content came from

**Not** auto-scraped from the Puck Buddy mobile app or a YouTube channel.

The corpus was **written for Buddy Live** to match:

- Scoring metric names and rubrics already in `app/prompts.py` and rep analysis
- Coaching cues that were previously hand-maintained in `app/tools/coaching.py`
  (`_DRILL_RECOMMENDATIONS`)
- Kid-friendly voice and off-ice constraints (no ice, stick + puck in a room)

Some lines include `Search hint:` (e.g. USA Hockey–style queries) as **hints
for humans or future links**, not live scraped video metadata. After ingest,
`recommend_drill` prefers grounded snippets over the old dict.

To pull in Puck Buddy app copy or specific YouTube curriculum later: add or edit
`.md` files, re-upload to GCS, re-import the data store (see
`knowledge/README.md`).

---

## Phase 4 — “Welcome back” memory

### What it is

After name + age, the coach calls `remember_player_profile` and
`load_player_memory`. If a prior row exists in Firestore `session_summaries/`
for that **first name** (case-insensitive), the opening includes a one-line
callback (last drill, rep count, weakest metric).

### Is it tied to this computer? Auth?

| Mechanism | What it does |
| --- | --- |
| **Firebase Anonymous Auth** | On `/coach`, the app signs you in anonymously. That `uid` is stored on the session as `user_id` and is **stable on the same browser** as long as you do not clear site data. |
| **New browser / cleared storage** | You get a **new** anonymous `uid`, but memory still works if you say the **same name** you used before. |
| **What memory actually keys on** | **`player_name` only** (normalized), not `user_id`. Lookup scans recent `session_summaries` and matches the name you just spoke. |

So there is **no login/password** today. Continuity is: “you told me you’re Marcus
last time” + a summary doc for Marcus — not “this laptop remembered you.”

**Implications**

- Two different kids named “Alex” could share the same welcome-back line
  (collision by first name).
- A returning player must say a name **consistent** with the saved summary.
- `user_id` is stored on summaries for future use but is **not** used in the
  lookup query yet; tying memory to anonymous `uid` would be a small follow-up.

Demo seed for Marcus: see Phase 4 in [`TRACK2-PLAN.md`](TRACK2-PLAN.md).

---

## Phase 6 — Prompt optimizer

Harness: `make optimize` (GEPA). Uses Phase 1 evals; optimize config uses
`hallucinations_v1` only because `safety_v1` can return null on edge cases and
crash the sampler. See [`evals/OPTIMIZE.md`](../services/buddy-live-adk/evals/OPTIMIZE.md).

**2026-05-30:** Full run completes in ~13 min after hang fixes. Validation
score 1.0 but **seed prompt was best** — we did not merge optimizer output
(would undo sub-agent prompt splits). Details in
[`TRACK2-PHASE-JOURNAL.md`](TRACK2-PHASE-JOURNAL.md).

---

## Phase 5 — Multi-agent (core shipped)

The coach is now a **team of specialists** instead of one giant prompt:

| Agent | Job |
| --- | --- |
| Root coach | Greeting, warm-up, setup, remember/load player |
| Vision coach | Camera framing + warm-up peek when needed |
| Drill coach | Scored rep, analysis wait, scorecard, recap |
| IQ coach | Hockey IQ when there's no space to shoot |

We skipped a separate memory agent (remember/load stay on root — transferring
mid-opening felt awkward). Eval scores before/after are in the phase journal.
