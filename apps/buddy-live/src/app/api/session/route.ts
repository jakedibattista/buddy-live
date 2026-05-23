import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebaseAdmin";
import { SESSIONS_COLLECTION } from "@/lib/paths";
import type { FocusDrill } from "@/lib/types";
import { shortId } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateSessionBody {
  userId?: string;
  sessionId?: string;
  focusDrill?: string;
}

const VALID_FOCUS_DRILLS: ReadonlySet<FocusDrill> = new Set<FocusDrill>([
  "wristshot",
  "slapshot",
  "backhand",
]);

function normalizeFocusDrill(input: string | undefined): FocusDrill {
  const candidate = (input ?? "").toLowerCase().trim() as FocusDrill;
  return VALID_FOCUS_DRILLS.has(candidate) ? candidate : "wristshot";
}

/**
 * Create-or-touch a live coaching session document.
 * The returned `sessionId` is the same value the client passes to ElevenLabs
 * via `customLlmExtraBody.arbitrary_identifier`, and that the ADK service uses
 * to address tool state in Firestore.
 *
 * `focusDrill` is locked in at session-create time and the ADK agent reads it
 * from the session doc to set the single drill the player will work on.
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
  const focusDrill = normalizeFocusDrill(body.focusDrill);

  if (!adminConfigured()) {
    return NextResponse.json({
      sessionId,
      userId,
      focusDrill,
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
      focus_drill: focusDrill,
      startedAt: new Date().toISOString(),
      currentPhase: "warmup",
    });
  } else if (!(snap.data() ?? {}).focus_drill) {
    // Backfill focus_drill for sessions created before this field existed.
    await ref.update({ focus_drill: focusDrill });
  }

  return NextResponse.json({ sessionId, userId, focusDrill });
}
