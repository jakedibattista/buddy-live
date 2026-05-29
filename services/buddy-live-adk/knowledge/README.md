# Buddy Live drill knowledge corpus

Curated source of truth for Coach Buddy's drill recommendations, metric
explanations, and hockey-IQ basics. Lives in version control so changes are
reviewable; ingested into a Vertex AI Search data store so the agent can
retrieve from it semantically at runtime (see Phase 3 in
[`docs/TRACK2-PLAN.md`](../../../docs/TRACK2-PLAN.md)).

**Provenance:** Authored for Buddy Live (prompt rubrics + legacy
`_DRILL_RECOMMENDATIONS` in `app/tools/coaching.py`). Not scraped from the
Puck Buddy app or YouTube. See [`docs/TRACK2-LAYMAN.md`](../../../docs/TRACK2-LAYMAN.md#phase-3--drill-knowledge-library-vertex-ai-search).

## Structure

Each `.md` file is one retrieval unit. Docs are kept small (~2–5 KB) and
self-contained because Vertex AI Search retrieves chunks independently — a
doc has to make sense without context from its siblings.

| File | Covers |
| --- | --- |
| `drill-wristshot.md` / `drill-slapshot.md` / `drill-backhand.md` | What the drill is, why it matters, key technique cues, kid-level explanation. |
| `metrics-wristshot.md` / `metrics-slapshot.md` / `metrics-backhand.md` | Each scoring metric: what it means, what "good" looks like, the single best at-home fix, recommended follow-up drill. |
| `iq-rules-basics.md` | Offsides, icing, goals, penalties — kid-level. |
| `iq-shot-selection.md` | When to shoot vs pass vs skate. |
| `iq-positioning.md` | Lanes, support, awareness. |

## Doc conventions

- Start with a single `# Title` matching the file topic so semantic search
  has a clean anchor.
- Use `## Section` for sub-topics — Vertex AI Search will chunk on headings.
- Speak in the coach's voice: short sentences, contractions, kid-friendly.
- For drill recommendations, include `Recommended drill:` and
  `Search hint:` lines so the retrieval result has structured fields the
  coach can quote verbatim.

## Updating

Edit the markdown, push to `main`, then re-ingest:

```bash
gsutil -m cp -r services/buddy-live-adk/knowledge/*.md \
  gs://puck-buddy-drill-knowledge/

# Refresh the data store
gcloud alpha discovery-engine data-stores import \
  --data-store=buddy-live-drills \
  --location=global \
  --gcs-source=gs://puck-buddy-drill-knowledge/
```

No Cloud Run redeploy needed — the agent picks up new content on the next
turn.
