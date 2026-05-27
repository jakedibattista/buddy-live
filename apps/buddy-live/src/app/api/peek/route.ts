import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb, adminStorage } from "@/lib/firebaseAdmin";
import { peekStoragePath, sessionDocPath } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PeekBody {
  sessionId: string;
  /** Base64-encoded JPEG (no data: prefix). */
  imageBase64: string;
}

interface PeekHistoryEntry {
  url: string;
  ts: string;
}

// 8 slots × ~1.5s during warmup ≈ 12s of history, enough to span most
// warm-up moves end-to-end and give peek_warmup richer motion comparisons.
const PEEK_HISTORY_MAX = 8;
// Drop entries older than this so peek_warmup never grabs frames from a
// previous warmup move when a new timer kicks off.
const PEEK_HISTORY_TTL_MS = 60_000;

/**
 * Uploads a single webcam JPEG to Firebase Storage at
 * `live_sessions/{sid}/peek_latest.jpg`, then writes the public-ish URL into
 * the Firestore session doc so the ADK `peek_camera` tool can fetch it.
 */
export async function POST(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json({ ok: true, stub: true });
  }

  let body: PeekBody;
  try {
    body = (await req.json()) as PeekBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body?.sessionId || !body?.imageBase64) {
    return NextResponse.json({ error: "sessionId and imageBase64 required" }, { status: 400 });
  }

  const storage = adminStorage()!;
  const db = adminDb()!;
  const bucket = storage.bucket();
  const file = bucket.file(peekStoragePath(body.sessionId));
  const buf = Buffer.from(body.imageBase64, "base64");
  await file.save(buf, {
    metadata: { contentType: "image/jpeg", cacheControl: "no-store" },
    resumable: false,
  });

  // Use a long-lived signed URL so the ADK service can fetch without auth.
  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 1000 * 60 * 60 * 4,
  });

  const nowIso = new Date().toISOString();
  const sessionRef = db.doc(sessionDocPath(body.sessionId));

  // Maintain a small ring buffer of recent frame URLs so the ADK service
  // can analyze motion across time (used by peek_warmup multi-frame check).
  // Read-modify-write inside a transaction to avoid clobbering concurrent
  // uploads. Trim to PEEK_HISTORY_MAX entries and drop stale ones.
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    const data = snap.exists ? (snap.data() ?? {}) : {};
    const prev = Array.isArray(data.peek_url_history)
      ? (data.peek_url_history as PeekHistoryEntry[])
      : [];
    const nowMs = Date.now();
    const fresh = prev.filter((entry) => {
      if (!entry?.url || !entry?.ts) return false;
      const tsMs = Date.parse(entry.ts);
      return Number.isFinite(tsMs) && nowMs - tsMs <= PEEK_HISTORY_TTL_MS;
    });
    fresh.push({ url: signedUrl, ts: nowIso });
    const trimmed = fresh.slice(-PEEK_HISTORY_MAX);

    tx.set(
      sessionRef,
      {
        peek_url: signedUrl,
        peek_updated_at: nowIso,
        peek_url_history: trimmed,
      },
      { merge: true },
    );
  });

  return NextResponse.json({ ok: true, signedUrl });
}
