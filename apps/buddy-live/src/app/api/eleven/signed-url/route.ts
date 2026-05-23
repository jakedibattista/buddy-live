import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns a signed conversation URL for a private ElevenLabs agent.
 * Public agents can connect with just the agent ID; this route is only needed
 * when the agent is private.
 *
 * Docs: https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-signed-url
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId =
    req.nextUrl.searchParams.get("agentId") || process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured (only required for private agents)" },
      { status: 500 },
    );
  }
  if (!agentId) {
    return NextResponse.json(
      { error: "agentId query param or NEXT_PUBLIC_ELEVENLABS_AGENT_ID is required" },
      { status: 400 },
    );
  }

  const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`;
  const resp = await fetch(url, { headers: { "xi-api-key": apiKey } });
  if (!resp.ok) {
    return NextResponse.json(
      { error: "ElevenLabs API error", status: resp.status, body: await resp.text() },
      { status: 502 },
    );
  }
  const body = (await resp.json()) as { signed_url?: string };
  return NextResponse.json({ signedUrl: body.signed_url });
}
