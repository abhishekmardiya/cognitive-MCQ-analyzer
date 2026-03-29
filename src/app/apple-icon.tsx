import { ImageResponse } from "next/og";
import { McqChoiceMark } from "@/lib/og-mcq-mark";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(145deg, #0f172a 0%, #020617 50%, #064e3b 100%)",
        borderRadius: 40,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 36,
          borderRadius: 36,
          background: "rgba(15,23,42,0.65)",
          border: "2px solid rgba(16,185,129,0.45)",
        }}
      >
        <McqChoiceMark dotSize={36} gap={12} borderPx={3} />
      </div>
    </div>,
    {
      ...size,
    },
  );
}
