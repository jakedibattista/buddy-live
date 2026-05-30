# Infra scripts

One-off operational helpers (not deployed with Cloud Run or Vercel).

| Script | Purpose |
| --- | --- |
| [`seed_demo_memory.py`](./seed_demo_memory.py) | Seed `session_summaries` for returning-player demo |
| [`setup_vertex_search.py`](./setup_vertex_search.py) | Create Vertex AI Search data store and import `knowledge/*.md` |

Run from repo root, e.g. `python3 infra/scripts/seed_demo_memory.py <firebase_user_id>`.
