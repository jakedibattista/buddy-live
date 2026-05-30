import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETRY_DELAYS_MS = [0, 600, 1500];

async function fetchElevenJson(
  url: string,
  apiKey: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; detail: string }> {
  let lastStatus = 502;
  let lastDetail = "ElevenLabs request failed";

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (RETRY_DELAYS_MS[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }

    const resp = await fetch(url, { headers: { "xi-api-key": apiKey } });
    if (resp.ok) {
      return { ok: true, data: (await resp.json()) as Record<string, unknown> };
    }

    lastStatus = resp.status;
    const bodyText = await resp.text();
    try {
      const parsed = JSON.parse(bodyText) as { detail?: { message?: string } | string };
      if (typeof parsed.detail === "string") {
        lastDetail = parsed.detail;
      } else if (parsed.detail && typeof parsed.detail === "object" && parsed.detail.message) {
        lastDetail = parsed.detail.message;
      } else {
        lastDetail = bodyText.slice(0, 200) || lastDetail;
      }
    } catch {
      lastDetail = bodyText.slice(0, 200) || lastDetail;
    }

    if (resp.status < 500) {
      break;
    }
  }

  return { ok: false, status: lastStatus, detail: lastDetail };
}

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
    const signedUrlResult = await fetchElevenJson(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      apiKey,
    );
    const tokenResult = await fetchElevenJson(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
      apiKey,
    );

    const result: { signedUrl?: string; conversationToken?: string } = {};
    if (signedUrlResult.ok && typeof signedUrlResult.data.signed_url === "string") {
      result.signedUrl = signedUrlResult.data.signed_url;
    }
    if (tokenResult.ok && typeof tokenResult.data.token === "string") {
      result.conversationToken = tokenResult.data.token;
    }

    if (!result.signedUrl && !result.conversationToken) {
      const status =
        tokenResult.ok === false && tokenResult.status >= 500
          ? 503
          : tokenResult.ok === false
            ? tokenResult.status
            : 502;
      const detail =
        tokenResult.ok === false
          ? tokenResult.detail
          : signedUrlResult.ok === false
            ? signedUrlResult.detail
            : "Failed to generate conversation credentials from ElevenLabs";

      return NextResponse.json(
        {
          error: `ElevenLabs voice service unavailable (${status}). ${detail}`,
          retryable: status >= 500,
        },
        { status },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error", retryable: true },
      { status: 500 },
    );
  }
}
