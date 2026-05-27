# Storage cleanup + session learning loop

## What gets auto-deleted

| Layer | Path | TTL | Mechanism |
| --- | --- | --- | --- |
| GCS | `gs://puck-buddy.firebasestorage.app/live_sessions/**` | 1 day | Object Lifecycle rule (`infra/storage-lifecycle.json`) |
| Firestore | `live_sessions/{sid}` and all subcollections (`reps`, `commands`) | ~24h | TTL policy on field `expires_at` |
| Firestore | `session_summaries/{sid}` | **forever** (intentional) | Lean per-session row written by `end_session_recap` |

The `session_summaries/` collection lives at the project root (not under
`live_sessions/`), so the live-session TTL does **not** delete it. That is the
durable record we use for the weekly review.

## Re-apply / change the rules

```bash
# GCS lifecycle (re-apply after editing the JSON)
gcloud storage buckets update gs://puck-buddy.firebasestorage.app \
  --lifecycle-file=infra/storage-lifecycle.json

# Firestore TTL on live_sessions.expires_at (one-time; safe to re-run)
gcloud firestore fields ttls update expires_at \
  --collection-group=live_sessions \
  --enable-ttl
```

Note: Firestore TTL deletes are best-effort within ~24h of the timestamp;
they're not guaranteed instant. Plan demos around that, not against it.

## Weekly review workflow (Sunday)

The `session_summaries/{sessionId}` doc captures the signal we care about for
prompt iteration. One row per session, written automatically when the agent
calls `end_session_recap`.

### Schema

```ts
{
  session_id: string;
  created_at: string;          // recap time (ISO)
  started_at: string | null;   // session-create time (ISO)
  drill: string | null;        // wristshot | slapshot | backhand
  rep_count: number;
  by_drill: Record<string, number>;
  weakest_metric: string | null;     // e.g. "front_knee_bend"
  average_scores: Record<string, number>;
  framing_struggles: number;         // # of times framing went pass -> fail
  warmup_motion_misses: number;      // # of peek_warmup calls with no motion
  warmup_moves_checked: number;      // total peek_warmup calls
  final_phase: string | null;        // recap | ended | (something else = drop-off)
}
```

### Where to look

1. **Firebase console → Firestore → `session_summaries`** — flat list, newest at
   top. Each doc id is the session id, so you can cross-reference Cloud Run
   logs or ElevenLabs transcripts.
2. **Cloud Logging** — full per-tool log lines for that session: search
   `jsonPayload.message =~ "<session_id>"`.
3. **ElevenLabs dashboard** — server-side voice transcript + every tool call
   the agent made.
4. **Sentry** — `buddy-live-adk` project, filter by `session_id` tag once a
   session id is in hand (we attach it via the structured logging integration).

### Triage questions (5 min per session, 5 sessions/week)

- `final_phase != "recap"` → the session was abandoned. Listen to the
  ElevenLabs transcript: where did the kid drop off?
- `warmup_motion_misses >= 2` → the warm-up loop felt sticky. Was the agent
  too strict, or did the kid actually not move? Sample 2-3 of the peek frames
  from Cloud Logging (`peek_url_history`) to judge.
- `framing_struggles >= 3` → camera placement guidance isn't landing. Tweak
  the `CAMERA HINTS` section of `services/buddy-live-adk/app/prompts.py`.
- `weakest_metric` consistent across kids → either the metric definition is
  too harsh in `modelforpuckbuddy`, or the prompt isn't cueing it well — pick
  one to fix that week.

### Prompt iteration loop

1. Pick the single most common issue from the week's summaries.
2. Read the relevant section of `app/prompts.py`. Make ONE surgical change.
3. Push to main. The `deploy-backend.yml` GitHub Action ships it to Cloud
   Run in ~3 min.
4. Next Sunday, compare counters. Repeat.
