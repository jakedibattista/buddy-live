# Firestore & Storage rules — safe merge for Buddy Live

Buddy Live adds a `live_sessions/` collection to the **existing** `puck-buddy` Firebase project. The Puck Buddy app already has strict rules with a **catch-all deny** at the bottom. Buddy Live rules must be inserted **above** that block.

## Do not deploy standalone rules

`infra/firestore.rules` in this repo (Buddy Live-only) is **not safe to deploy alone** — it would wipe access to `jobs/`, `users/`, etc.

Use the **merged** files instead:

| File | Purpose |
|---|---|
| [`infra/firestore.rules.merged`](../infra/firestore.rules.merged) | Full Firestore rules: existing Puck Buddy + `live_sessions/` |
| [`infra/storage.rules.merged`](../infra/storage.rules.merged) | Full Storage rules: existing `users/` + `live_sessions/` |

## How to deploy (recommended)

1. Copy the merged file into the canonical Firebase repo:

   ```bash
   cp infra/firestore.rules.merged /path/to/modelforpuckbuddy/firebase/firestore.rules
   cp infra/storage.rules.merged   /path/to/modelforpuckbuddy/firebase/storage.rules
   ```

2. Review the diff — confirm `jobs/`, `users/`, `scoreboards/` blocks are unchanged.

3. Deploy from **modelforpuckbuddy** (or puck-buddy app repo if that's where `firebase.json` lives):

   ```bash
   firebase deploy --only firestore:rules,storage:rules --project puck-buddy
   ```

4. Smoke-test Puck Buddy (upload a video, check job status) **and** Buddy Live (`/coach` session start).

## What changed for Buddy Live

### Firestore — `live_sessions/{sessionId}`

- Session owner = `user_id` field must match `request.auth.uid` (works with anonymous Auth).
- **Reps**: client read-only; writes come from Admin SDK (ADK tools + Vercel API routes).
- **Commands**: client can read + mark `handled: true` only (MediaRecorder hook).
- Placed **before** the existing `match /{document=**}` catch-all deny.

### Storage — `live_sessions/{sessionId}/...`

- Authenticated users can read/write under the `live_sessions/` prefix (30 MB cap on writes).
- Existing `users/{uid}/...` rules unchanged.
- Most Buddy Live uploads today go through Vercel API routes (Admin SDK), which bypass Storage rules. These rules cover future client-direct uploads.

## Hackathon vs production

Current merged rules are **hackathon-pragmatic**:

- Any authenticated user can access storage under `live_sessions/` if they know the path.
- Tighten for production by scoping Storage writes to session owners (custom metadata or server-only uploads).

For analyze-video during testing, use the **dev API**:

```bash
# services/buddy-live-adk/.env
MODELFORPUCKBUDDY_API_URL=https://puck-buddy-model-api-dev-22317830094.us-central1.run.app
```
