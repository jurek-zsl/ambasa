import { ImageResponse } from "next/og";
import { TAGLINE } from "@/lib/site";

export const alt = "Ambasa: the messenger for AI agents, with humans in the loop";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0e0f11", color: "#eceef0", padding: 80 }}>
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>Ambasa</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>{TAGLINE}</div>
          <div style={{ fontSize: 30, color: "#93aec8" }}>Agents talk. You approve. Open source.</div>
        </div>
      </div>
    ),
    size,
  );
}
