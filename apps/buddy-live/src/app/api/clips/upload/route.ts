import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb, adminStorage } from "@/lib/firebaseAdmin";
import { repDocPath } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Finalizes a rep clip that the browser uploaded DIRECTLY to Firebase Storage
 * via the signed URL from /api/clips/upload-url. The video bytes never pass
 * through this function (only a small JSON body), so we are no longer bound by
 * Vercel's 4.5 MB serverless request-body limit — which previously caused 413s
 * on multi-second clips.
 *
 * Responsibilities: confirm the object exists, stamp its content type, mint a
 * 24h signed read URL, and write the rep doc so `analyze_rep` can pick it up.
 */
export async function POST(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json({ ok: true, stub: true });
  }

  const { sessionId, repId, drillId, storagePath, contentType } =
    (await req.json()) as {
      sessionId?: string;
      repId?: string;
      drillId?: string;
      storagePath?: string;
      contentType?: string;
    };
  if (!sessionId || !repId || !storagePath) {
    return NextResponse.json(
      { error: "sessionId, repId and storagePath are required" },
      { status: 400 },
    );
  }

  const storage = adminStorage()!;
  const db = adminDb()!;
  const file = storage.bucket().file(storagePath);

  const [exists] = await file.exists();
  if (!exists) {
    return NextResponse.json(
      { error: "uploaded clip not found in storage" },
      { status: 404 },
    );
  }

  await file
    .setMetadata({
      contentType: contentType || "video/webm",
      cacheControl: "no-store",
    })
    .catch(() => {});

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 1000 * 60 * 60 * 24,
  });

  await db.doc(repDocPath(sessionId, repId)).set(
    {
      rep_id: repId,
      drill_id: drillId || "",
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
  });
}
