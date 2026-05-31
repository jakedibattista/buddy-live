import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminConfigured, adminDb } from "@/lib/firebaseAdmin";
import { SESSIONS_COLLECTION } from "@/lib/paths";
import type { SessionMode } from "@/lib/types";
import { shortId } from "@/lib/utils";

const SESSION_TTL_HOURS = 24;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateSessionBody {
  userId?: string;
  sessionId?: string;
  sessionMode?: SessionMode;
}

/**
 * Create-or-touch a live coaching session document.
 * The returned `sessionId` is the same value the client passes to ElevenLabs
 * via `customLlmExtraBody.arbitrary_identifier`, and that the ADK service uses
 * to address tool state in Firestore.
 *
 * The drill choice is no longer set here -- Coach Buddy asks the player at the
 * top of the voice session and remembers their answer via ADK session memory.
 */
export async function POST(req: NextRequest) {
  let body: CreateSessionBody = {};
  try {
    body = (await req.json()) as CreateSessionBody;
  } catch {
    // empty body is fine
  }
  const sessionId = body.sessionId || shortId("live");
  const userId = body.userId || "anonymous";
  const sessionMode: SessionMode = body.sessionMode === "iq" ? "iq" : "full";

  if (!adminConfigured()) {
    return NextResponse.json({
      sessionId,
      userId,
      stub: true,
      warning: "firebase admin not configured -- session not persisted",
    });
  }

  const db = adminDb()!;
  const ref = db.collection(SESSIONS_COLLECTION).doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) {
    const now = new Date();
    const expiresAt = Timestamp.fromMillis(
      now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000,
    );
    await ref.set({
      session_id: sessionId,
      user_id: userId,
      startedAt: now.toISOString(),
      sessionMode,
      // Opening conversation (name/age/space/drill pick) shows "Intro". Flips to
      // "warmup" once the player commits to shooting (set_focus_drill /
      // start_warmup_timer) or to "iq_practice" on hand-off to the IQ coach.
      currentPhase: "intro",
      // Firestore TTL policy on `live_sessions.expires_at` auto-deletes the
      // doc (and its subcollections) ~24h after creation. See
      // infra/storage-lifecycle.md for the matching GCS prefix cleanup.
      expires_at: expiresAt,
    });
  }

  return NextResponse.json({ sessionId, userId, sessionMode });
}
