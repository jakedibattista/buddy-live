import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebaseAdmin";
import { SESSIONS_COLLECTION } from "@/lib/paths";
import { shortId } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateSessionBody {
  userId?: string;
  sessionId?: string;
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
    await ref.set({
      session_id: sessionId,
      user_id: userId,
      startedAt: new Date().toISOString(),
      currentPhase: "warmup",
    });
  }

  return NextResponse.json({ sessionId, userId });
}
