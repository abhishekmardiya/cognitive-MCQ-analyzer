import { ImageResponse } from "next/og";
import { OgShareCard } from "@/lib/og-share-card";

export const alt =
  "Cognitive MCQ Analyzer — Gemini-powered MCQ evaluation and PDF reports";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(<OgShareCard />, {
    ...size,
  });
}
