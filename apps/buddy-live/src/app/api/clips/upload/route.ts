import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb, adminStorage } from "@/lib/firebaseAdmin";
import { repDocPath, repStoragePath } from "@/lib/paths";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Accepts a multipart form-data upload of a single recorded rep clip and stores
 * it at `live_sessions/{sid}/reps/{repId}.webm` plus updates the rep doc with
 * the storage path. The ADK `analyze_rep` tool then forwards the storage path
 * to the existing modelforpuckbuddy /api/analyze-video endpoint.
 */
export async function POST(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json({ ok: true, stub: true });
  }

  const form = await req.formData();
  const sessionId = String(form.get("sessionId") || "");
  const repId = String(form.get("repId") || "");
  const drillId = String(form.get("drillId") || "");
  const blob = form.get("clip");
  if (!sessionId || !repId || !(blob instanceof Blob)) {
    return NextResponse.json(
      { error: "sessionId, repId and clip are required" },
      { status: 400 },
    );
  }

  const arrayBuf = await blob.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  const contentType = blob.type || "video/webm";
  const ext = contentType.includes("mp4") ? "mp4" : "webm";
  const storagePath = repStoragePath(sessionId, repId, ext);

  const storage = adminStorage()!;
  const db = adminDb()!;
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);
  await file.save(buf, {
    metadata: { contentType, cacheControl: "no-store" },
    resumable: false,
  });

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 1000 * 60 * 60 * 24,
  });

  await db.doc(repDocPath(sessionId, repId)).set(
    {
      rep_id: repId,
      drill_id: drillId,
      storage_path: storagePath,
      storage_url: signedUrl,
      status: "uploaded",
      uploaded_at: new Date().toISOString(),
    },
    { merge: true },
  );

  return NextResponse.json({
    ok: true,
    storage_path: storagePath,
    storage_url: signedUrl,
    bytes: buf.byteLength,
  });
}
