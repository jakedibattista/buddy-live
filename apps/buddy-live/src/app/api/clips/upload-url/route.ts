import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminStorage } from "@/lib/firebaseAdmin";
import { repStoragePath } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mints a short-lived V4 signed PUT URL so the browser can upload a rep clip
 * DIRECTLY to Firebase Storage. The video bytes never pass through a Vercel
 * serverless function, so we avoid the platform's hard 4.5 MB request-body
 * limit (which returned 413 on multi-second clips). The bucket already allows
 * cross-origin PUT, so the browser upload succeeds without extra CORS config.
 *
 * The client finalizes via /api/clips/upload once the PUT completes.
 */
export async function POST(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json({ ok: true, stub: true });
  }

  const { sessionId, repId, contentType } = (await req.json()) as {
    sessionId?: string;
    repId?: string;
    contentType?: string;
  };
  if (!sessionId || !repId) {
    return NextResponse.json(
      { error: "sessionId and repId are required" },
      { status: 400 },
    );
  }

  const ct =
    typeof contentType === "string" && contentType.includes("mp4")
      ? "video/mp4"
      : "video/webm";
  const ext = ct.includes("mp4") ? "mp4" : "webm";
  const storagePath = repStoragePath(sessionId, repId, ext);

  const file = adminStorage()!.bucket().file(storagePath);
  const [uploadUrl] = await file.getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 1000 * 60 * 15,
    contentType: ct,
  });

  return NextResponse.json({ uploadUrl, storagePath, contentType: ct });
}
