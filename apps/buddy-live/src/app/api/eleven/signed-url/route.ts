import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns signed conversation credentials (WebRTC token + signed WebSocket URL)
 * for a private ElevenLabs agent. Public agents can connect with just the agent ID;
 * this route is only needed when the agent is private.
 *
 * Docs:
 *   - WebRTC token: https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token
 *   - Signed URL: https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-signed-url
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

  try {
    const signedUrlPromise = fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } }
    ).then((r) => (r.ok ? r.json() : null));

    const tokenPromise = fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } }
    ).then((r) => (r.ok ? r.json() : null));

    const [signedUrlData, tokenData] = await Promise.all([signedUrlPromise, tokenPromise]);

    const result: { signedUrl?: string; conversationToken?: string } = {};
    if (signedUrlData?.signed_url) {
      result.signedUrl = signedUrlData.signed_url;
    }
    if (tokenData?.token) {
      result.conversationToken = tokenData.token;
    }

    if (!result.signedUrl && !result.conversationToken) {
      return NextResponse.json(
        { error: "Failed to generate conversation credentials from ElevenLabs" },
        { status: 502 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
