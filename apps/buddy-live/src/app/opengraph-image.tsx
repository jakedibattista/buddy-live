import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Buddy Live — practice your shot with Coach Buddy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const mascotPath = join(process.cwd(), "public/mascot/coach-puck.png");
  const mascot = await readFile(mascotPath);
  const mascotSrc = `data:image/png;base64,${mascot.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "#000000",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 70% 45% at 50% 8%, rgba(0, 102, 204, 0.18) 0%, transparent 62%), radial-gradient(ellipse 90% 35% at 50% 100%, rgba(0, 48, 96, 0.28) 0%, transparent 55%)",
          }}
        />
        <img
          src={mascotSrc}
          alt=""
          width={220}
          height={220}
          style={{ marginBottom: 28 }}
        />
        <div
          style={{
            fontSize: 72,
            fontWeight: 600,
            color: "#ffffff",
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
          }}
        >
          Buddy Live.
        </div>
        <div
          style={{
            marginTop: 16,
            maxWidth: 760,
            textAlign: "center",
            fontSize: 32,
            color: "#a1a1aa",
            lineHeight: 1.4,
          }}
        >
          Practice your shot with Coach Buddy.
        </div>
      </div>
    ),
    { ...size },
  );
}
