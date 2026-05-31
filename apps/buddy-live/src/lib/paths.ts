export const SESSIONS_COLLECTION = "live_sessions";

export function sessionDocPath(sessionId: string): string {
  return `${SESSIONS_COLLECTION}/${sessionId}`;
}

export function repDocPath(sessionId: string, repId: string): string {
  return `${sessionDocPath(sessionId)}/reps/${repId}`;
}

export function commandsCollectionPath(sessionId: string): string {
  return `${sessionDocPath(sessionId)}/commands`;
}

/**
 * Session event log (reserved backend collection, also writable by the client
 * per firestore.rules). We log voice-link drops here so reconnect churn is
 * queryable server-side — a dedicated voice_events collection is denied by the
 * rules, which is why earlier drop telemetry silently wrote nothing.
 */
export function coachLogCollectionPath(sessionId: string): string {
  return `${sessionDocPath(sessionId)}/coach_log`;
}

export function peekStoragePath(sessionId: string): string {
  return `${SESSIONS_COLLECTION}/${sessionId}/peek_latest.jpg`;
}

export function repStoragePath(sessionId: string, repId: string, ext = "webm"): string {
  return `${SESSIONS_COLLECTION}/${sessionId}/reps/${repId}.${ext}`;
}
