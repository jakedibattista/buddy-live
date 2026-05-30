# Pre-human test checklist

Run through this before live sessions on [buddy-live-indol.vercel.app/coach](https://buddy-live-indol.vercel.app/coach).

## Production ops (done 2026-05-30)

| Check | Status |
| --- | --- |
| Cloud Trace `BUDDY_ENABLE_CLOUD_TRACE=1` on Cloud Run | Done (rev `00053-2rw`+) |
| Vertex Search data store + 9 docs indexed | Done — `buddy-live-drills` |
| `BUDDY_VERTEX_SEARCH_DATA_STORE_ID` on Cloud Run | Done |
| Memory scoped to Firebase `user_id` + name | Done (`ff8083c`) |
| Marcus demo seed (Jake browsers) | Done — see below |

## Synthetic eval gate

From `services/buddy-live-adk/`:

```bash
make eval          # 6 scenarios happy path
make eval-failures # 6 scenarios + edge injections
```

Baselines saved under `evals/baselines/pre-human-*.log`. All scenarios should **PASS** hallucinations_v1 (≥ 0.5).

## Returning-player demo (Marcus)

Memory is **per browser** (Firebase anonymous uid). Seeded rows:

| Firestore doc | `user_id` | Say on mic |
| --- | --- | --- |
| `demo-prior-marcus-jake` | `UXNBjXXvmXhVt29u7o1ZVGKZW5n1` | "I'm Marcus, I'm 11" |
| `demo-prior-marcus-alt` | `PZGWer4sYrREQ7FRLyhYC3MIZD22` | same |

Seed another tester:

```bash
python3 infra/scripts/seed_demo_memory.py <their user_id from live_sessions>
```

## Live session smoke (you)

Same browser as seeded uid → Marcus welcome-back → full shooting flow → drill_coach handoff → scorecard → recap.

Optional: ask a metric question during recap to trigger `lookup_drill_knowledge` (grounded if Vertex Search indexed).

## Cloud Trace verify

After one live turn: [Cloud Trace](https://console.cloud.google.com/traces/list?project=puck-buddy) → filter `buddy_live.turn` → child spans for tools.

## Deferred (not blocking human test)

- GEPA re-run (seed was best)
- Vertex ADC for `safety_v1` in local evals
- Hackathon video / 1-pager (after your smoke passes)
- Workflow graph rewrite
