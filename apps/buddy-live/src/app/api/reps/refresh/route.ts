import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebaseAdmin";
import { repDocPath, sessionDocPath } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface RefreshBody {
  sessionId?: string;
  repId?: string;
}

/**
 * Polls modelforpuckbuddy `/api/job-status/{jobId}` for a single rep and, when
 * the job completes, writes `results` back into the rep doc so the side panel
 * `RepScorecard` updates without waiting for the voice agent to call
 * `get_rep_result`.
 *
 * Auth: server-to-server `X-API-Key` (the anonymous web user has no usable
 * Firebase ID token for the model API).
 */
export async function POST(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json({ ok: false, error: "admin not configured" }, { status: 500 });
  }

  let body: RefreshBody = {};
  try {
    body = (await req.json()) as RefreshBody;
  } catch {
    // empty body is fine
  }
  const sessionId = body.sessionId;
  const repId = body.repId;
  if (!sessionId || !repId) {
    return NextResponse.json(
      { ok: false, error: "sessionId and repId required" },
      { status: 400 },
    );
  }

  const db = adminDb()!;
  const ref = db.doc(repDocPath(sessionId, repId));
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: false, error: "rep not found" }, { status: 404 });
  }
  const rep = snap.data() ?? {};

  if (rep.results) {
    return NextResponse.json({ ok: true, status: "completed", cached: true });
  }
  const jobId = rep.job_id ?? rep.jobId;
  if (!jobId) {
    return NextResponse.json({ ok: true, status: rep.status ?? "pending" });
  }

  const apiUrl = (process.env.MODELFORPUCKBUDDY_API_URL ?? "").replace(/\/$/, "");
  const apiKey = process.env.MODELFORPUCKBUDDY_API_KEY;
  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      { ok: false, error: "model API not configured" },
      { status: 503 },
    );
  }

  let job: { status?: string; results?: unknown; error?: string } = {};
  try {
    const resp = await fetch(`${apiUrl}/api/job-status/${encodeURIComponent(jobId)}`, {
      headers: { "X-API-Key": apiKey },
      cache: "no-store",
    });
    if (resp.status === 404) {
      return NextResponse.json({ ok: true, status: "unknown_job" });
    }
    if (!resp.ok) {
      return NextResponse.json(
        { ok: false, error: `job-status ${resp.status}` },
        { status: 502 },
      );
    }
    job = (await resp.json()) as typeof job;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  if (job.status === "completed" && job.results) {
    await ref.set(
      {
        status: "completed",
        results: job.results,
        completed_at: new Date().toISOString(),
      },
      { merge: true },
    );
    const sessionRef = db.doc(sessionDocPath(sessionId));
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.data()?.results_ready_at) {
      await sessionRef.set(
        { results_ready_at: new Date().toISOString() },
        { merge: true },
      );
    }
    return NextResponse.json({ ok: true, status: "completed" });
  }

  if (job.status === "failed") {
    await ref.set(
      { status: "failed", error: job.error ?? "unknown" },
      { merge: true },
    );
    return NextResponse.json({ ok: true, status: "failed" });
  }

  return NextResponse.json({ ok: true, status: job.status ?? "processing" });
}
