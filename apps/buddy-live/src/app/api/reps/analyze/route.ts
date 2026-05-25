import { NextRequest, NextResponse } from "next/server";
import { adminConfigured, adminDb } from "@/lib/firebaseAdmin";
import { repDocPath } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface AnalyzeBody {
  sessionId?: string;
  repId?: string;
}

const DRILL_ID_MAP: Record<string, string> = {
  wristshot: "wristshot",
  snapshot: "snapshot",
  slapshot: "slapshot_form",
  slapshot_form: "slapshot_form",
  backhand: "backhand",
  skating: "skating",
};

function normalizeDrill(drillId: string): string {
  const key = (drillId || "").toLowerCase().trim();
  return DRILL_ID_MAP[key] ?? drillId;
}

/**
 * Idempotent server-side analyze kickoff. Called after clip upload completes
 * so analysis does not depend on the voice agent winning the upload race.
 */
export async function POST(req: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json({ ok: false, error: "admin not configured" }, { status: 500 });
  }

  let body: AnalyzeBody = {};
  try {
    body = (await req.json()) as AnalyzeBody;
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

  if (rep.job_id) {
    return NextResponse.json({ ok: true, status: "already_queued", jobId: rep.job_id });
  }
  if (rep.results) {
    return NextResponse.json({ ok: true, status: "completed", cached: true });
  }

  const storagePath = rep.storage_path as string | undefined;
  if (!storagePath) {
    return NextResponse.json({ ok: true, status: "waiting_for_clip" });
  }

  const apiUrl = (process.env.MODELFORPUCKBUDDY_API_URL ?? "").replace(/\/$/, "");
  const apiKey = process.env.MODELFORPUCKBUDDY_API_KEY;
  const bearer = process.env.MODELFORPUCKBUDDY_BEARER_TOKEN;
  if (!apiUrl) {
    await ref.set(
      { status: "stub_queued", queued_at: new Date().toISOString() },
      { merge: true },
    );
    return NextResponse.json({ ok: true, status: "queued_stub" });
  }
  if (!apiKey && !bearer) {
    return NextResponse.json(
      { ok: false, error: "model API credentials not configured" },
      { status: 503 },
    );
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  if (apiKey) headers["X-API-Key"] = apiKey;

  const drillId = normalizeDrill(String(rep.drill_id ?? "wristshot"));

  let jobId: string | undefined;
  try {
    const resp = await fetch(`${apiUrl}/api/analyze-video`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        storage_path: storagePath,
        drill_id: drillId,
        coach_id: "seth",
      }),
      cache: "no-store",
    });
    if (!resp.ok) {
      const text = await resp.text();
      await ref.set(
        { status: "analyze_error", error: `analyze-video ${resp.status}: ${text.slice(0, 200)}` },
        { merge: true },
      );
      return NextResponse.json(
        { ok: false, error: `analyze-video ${resp.status}` },
        { status: 502 },
      );
    }
    const payload = (await resp.json()) as { jobId?: string; job_id?: string };
    jobId = payload.jobId ?? payload.job_id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ref.set({ status: "analyze_error", error: msg }, { merge: true });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  await ref.set(
    {
      status: "analyzing",
      job_id: jobId ?? null,
      drill_id: drillId,
      queued_at: new Date().toISOString(),
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true, status: "queued", jobId });
}
