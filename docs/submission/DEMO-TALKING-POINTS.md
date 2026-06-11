# Demo talking points (~3 min video)

Use this as a script outline. Speak naturally — contractions, kid-friendly energy matches the product.

**URLs to show on screen:** [buddy-live-indol.vercel.app/coach](https://buddy-live-indol.vercel.app/coach) · [ARCHITECTURE.md](../ARCHITECTURE.md)

---

## 0:00 — Hook + business case (20s)

> "This is Buddy Live — a voice AI hockey coach for kids practicing in a basement. **Thousands of kids already use our PuckBuddy app** to get shot scorecards — and they told us the same thing: less reading, fewer buttons, more coach. Private shooting coaches run $80–150 an hour. Buddy Live puts one in the room for cents a session — the brain is **Gemini on Google ADK**, running on Cloud Run."

---

## 0:20 — Architecture flash (20s)

Show the diagram in [ARCHITECTURE-DIAGRAM.md](./ARCHITECTURE-DIAGRAM.md) or README.

> "Every turn flows through **Google ADK 2.0**: Gemini Flash does the reasoning, sub-agents own drills and Hockey IQ, tools write to Firestore, and **Vertex AI Search** grounds drill advice. ElevenLabs is just the mouth and ears — it streams each turn to our ADK service on Cloud Run. We deliberately did **not** use Gemini Live for shot mechanics: a wristshot release is 150–300 milliseconds, faster than 1 FPS video can catch — so high-FPS clips go to our analysis pipeline instead. That's an engineering trade-off, not a workaround."

---

## 0:35 — Shooting flow demo (90s) — **primary path**

**Setup:** Portrait camera, stick + puck, ~10 ft space. Say a new name (not Marcus welcome-back — we don't run that in opening anymore).

| Beat | Say / do |
| --- | --- |
| Connect | Tap Start practice. Coach greets: name → age → **space check** → drill pick. |
| Warm-up | One timed move (or "skip warm-up" chip if short on time). Point at on-screen countdown. |
| Hand-off | Coach transfers to drill mode — one **scored rep**. |
| Shoot | "Ready" → record → one shot → coach announces cool-down while scorecard cooks. |
| Review | Coach says **"Hey, your scorecard's ready! Want to walk through it together?"** — you say yes → weakest metric + one fix cue → check-in → strength + homework. Scorecard is on screen the whole time. |
| Recap | One homework cue from weakest metric; goodbye only after you say you're done. |

**If analysis takes a moment:** Coach keeps you moving (recovery stretch + optional verbal hockey IQ) — then results-ready push triggers the review beat above.

**Proof you can cite without re-filming:** Session `live-3oxrisz06vae` (2026-06-03) — wristshot, 1 rep, recap, real scores in Firestore `session_summaries`.

---

## 2:05 — IQ path (30s) — **optional B-roll**

> "No stick or space? Space check routes to Hockey IQ — visual scenario cards on screen while you talk through the play."

Say you don't have room to shoot → accept IQ practice → answer one on-screen scenario.

Recent proof: `live-c6vkymv41exc` (2026-06-07), `iq_practice` phase.

---

## 2:35 — Track 2: the optimization loop (40s) — **the money shot**

> "Track 2 is about taking an agent that works in a sandbox and making it survive real kids. Our headline: **eval-gated refactoring beat prompt optimization.**"

1. **Simulation first** — ADK User + Environment Simulation: synthetic kid personas against fully mocked tools, with failure injection (`make eval-failures`).
2. **Refactor under measurement** — split the monolith into drill and IQ sub-agents, re-running the suite after every slice. When two scenarios appeared to regress, we didn't hand-wave it — we re-ran the suite three times and proved the dips were LLM-judge variance (±0.2 on identical code). The reproducible result: **100% pass rate on every run**, before and after.
3. **Optimizer as verification** — a full GEPA run scored validation 1.0 and kept the seed prompt — the optimizer confirmed the structural fix was already optimal.
4. **Real-world loop** — Cloud Trace + Firestore on live kid sessions caught failures no simulation predicted — including the agent reading its private reasoning out loud to a 5-year-old. Root-caused, fixed in code, redeployed, re-measured.
5. **Safety for kids** — `safety_v1` (threshold 0.8) runs against the Vertex Gen AI Eval service, because this product talks to children.

On screen: Trace Explorer (`buddy_live.turn` spans) — proof session `live-3gh4vmj133s5` (2026-06-11) — plus the run-by-run variance table from [JUDGE-TOOLKIT.md](./JUDGE-TOOLKIT.md).

> "Today's live sessions caught things simulation missed — voice drops during silence, the coach dumping a scorecard in one breath, a tool docstring triggering welcome-back when we wanted a fresh greet. Each one: Cloud Trace or Firestore → root cause → code fix → redeploy → re-test."

---

## 3:15 — Close (10s)

> "Buddy Live is live on Vercel, Gemini and ADK on Cloud Run, full stack in the repo. AI that gets kids moving and learning — a real coach in the room, not a chatbot."

---

## Pitfalls to avoid on camera

- Don't promise **welcome-back** — `load_player_memory` is unwired; every session greets fresh (`remember_player_profile` only).
- **Don't push to `main` while filming** — a Cloud Run deploy restarts the ADK process and the coach may forget your name mid-session (reconnect context now re-sends it, but avoid the disruption).
- Use **portrait** camera — landscape clips often score poorly.
- One scored rep per session — don't try to record twice.
- Let the coach **ask before reviewing** the scorecard — don't interrupt the "want to walk through it?" beat.
- Vercel deployment protection — log in with Buddy Tech before filming.
