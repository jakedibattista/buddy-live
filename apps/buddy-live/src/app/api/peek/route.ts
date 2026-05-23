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

  await db.doc(sessionDocPath(body.sessionId)).set(
    {
      peek_url: signedUrl,
      peek_updated_at: new Date().toISOString(),
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true, signedUrl });
}
