# Demo talking points (~3 min video)

Use this as a script outline. Speak naturally — contractions, kid-friendly energy matches the product.

**URLs to show on screen:** [buddy-live-indol.vercel.app/coach](https://buddy-live-indol.vercel.app/coach) · [ARCHITECTURE.md](../ARCHITECTURE.md)

---

## 0:00 — Hook (15s)

> "This is Buddy Live — a voice AI hockey coach for kids practicing in a basement or garage. You talk, it watches your webcam, scores your shot, and tells you what to fix. The brain is **Google ADK** on Cloud Run; the voice layer is ElevenLabs."

---

## 0:15 — Architecture flash (20s)

Show the diagram in [ARCHITECTURE-DIAGRAM.md](./ARCHITECTURE-DIAGRAM.md) or README.

> "ElevenLabs handles real-time voice — mic, transcription, TTS. On every turn it calls our ADK agent over an OpenAI-compatible SSE bridge. ADK runs Gemini Flash, calls tools, and streams the reply back as speech. Shot mechanics go through our existing video analysis API — not Gemini Live — because a wristshot release is faster than 1 FPS video can catch."

---

## 0:35 — Shooting flow demo (90s) — **primary path**

**Setup:** Portrait camera, stick + puck, ~10 ft space. Say a new name (not Marcus welcome-back — we don't run that in opening anymore).

| Beat | Say / do |
| --- | --- |
| Connect | Tap Start practice. Coach greets: name → age → **space check** → drill pick. |
| Warm-up | One timed move (or "skip warm-up" chip if short on time). Point at on-screen countdown. |
| Hand-off | Coach transfers to drill mode — one **scored rep**. |
| Shoot | "Ready" → record → one shot → coach reviews scorecard on screen **and** over voice. |
| Recap | Homework cue from weakest metric. Mention `lookup_drill_knowledge` if you ask a drill question. |

**If analysis takes a moment:** Coach should keep you moving (recovery stretch + optional verbal hockey IQ) — then push results-ready and walk the scorecard.

**Proof you can cite without re-filming:** Session `live-3oxrisz06vae` (2026-06-03) — wristshot, 1 rep, recap, real scores in Firestore `session_summaries`.

---

## 2:05 — IQ path (30s) — **optional B-roll**

> "No stick or space? Space check routes to Hockey IQ — visual scenario cards on screen while you talk through the play."

Say you don't have room to shoot → accept IQ practice → answer one on-screen scenario.

Recent proof: `live-c6vkymv41exc` (2026-06-07), `iq_practice` phase.

---

## 2:35 — ADK + Track 2 (35s)

> "We didn't stop at a demo agent. Track 2 is the engineering loop:"

1. **Simulation** — `make eval` runs fake kids against mocked tools; judges groundedness.
2. **Observability** — Cloud Trace shows `buddy_live.turn` → tool spans per live session.
3. **Sub-agents** — vision, drill, and IQ specialists with `phase_guard` callbacks so the model can't skip framing or double-record.
4. **Grounding** — Vertex AI Search backs drill recommendations at recap.

Screenshot or quick cut: Trace Explorer + eval PASS table from [JUDGE-TOOLKIT.md](./JUDGE-TOOLKIT.md).

---

## 3:10 — Close (10s)

> "Buddy Live is live on Vercel, ADK on Cloud Run, full stack in the repo. Built for kids who want a real coach in the room — not a chatbot."

---

## Pitfalls to avoid on camera

- Don't promise **welcome-back** — opening uses name/age fresh each session (`remember_player_profile` only).
- Use **portrait** camera — landscape clips often score poorly.
- One scored rep per session — don't try to record twice.
- Vercel deployment protection — log in with Buddy Tech before filming.
