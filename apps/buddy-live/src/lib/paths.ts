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

export function peekStoragePath(sessionId: string): string {
  return `${SESSIONS_COLLECTION}/${sessionId}/peek_latest.jpg`;
}

export function repStoragePath(sessionId: string, repId: string, ext = "webm"): string {
  return `${SESSIONS_COLLECTION}/${sessionId}/reps/${repId}.${ext}`;
}
