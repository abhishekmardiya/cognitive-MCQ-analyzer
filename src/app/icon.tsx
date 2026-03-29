import { ImageResponse } from "next/og";
import { McqChoiceMark } from "@/lib/og-mcq-mark";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(145deg, #0f172a 0%, #020617 55%, #022c22 100%)",
      }}
    >
      <McqChoiceMark dotSize={6} gap={2} borderPx={1} />
    </div>,
    {
      ...size,
    }
  );
}
