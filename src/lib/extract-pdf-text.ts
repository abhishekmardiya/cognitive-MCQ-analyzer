import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { fixIndicPdfExtractionArtifacts } from "@/lib/fix-indic-extraction-spaces";

/**
 * Absolute file URL for pdf.js fake worker. Do not use require.resolve() here: the
 * production bundler can replace it with a numeric module id, which then breaks path.*.
 */
function resolvePdfJsWorkerFileUrl(): string {
  const candidates = [
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs",
    ),
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "node_modules",
      "pdf-parse",
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.mjs",
    ),
  ];
  for (const workerPath of candidates) {
    if (existsSync(workerPath)) {
      return pathToFileURL(workerPath).href;
    }
  }
  throw new Error(
    "pdf.worker.mjs not found under node_modules. Ensure pdfjs-dist is installed and included in the serverless bundle.",
  );
}

/**
 * pdfjs (used by pdf-parse) references DOMMatrix at module top-level before its
 * own Node polyfill runs. Next externalizes pdf-parse, so we attach globals first.
 */
async function ensurePdfCanvasGlobals(): Promise<void> {
  if (typeof globalThis.DOMMatrix !== "undefined") {
    return;
  }
  const mod = await import("@napi-rs/canvas");
  const canvas =
    mod !== null &&
    typeof mod === "object" &&
    "default" in mod &&
    mod.default !== undefined
      ? mod.default
      : mod;
  const { DOMMatrix, Path2D, ImageData } = canvas as {
    DOMMatrix: typeof globalThis.DOMMatrix;
    Path2D: typeof globalThis.Path2D;
    ImageData: typeof globalThis.ImageData;
  };
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = DOMMatrix;
  }
  if (!globalThis.Path2D) {
    globalThis.Path2D = Path2D;
  }
  if (!globalThis.ImageData) {
    globalThis.ImageData = ImageData;
  }
}

function isPdfMagic(buffer: Buffer): boolean {
  if (buffer.length < 5) {
    return false;
  }
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

export function shouldParseAsPdf(buffer: Buffer, fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return true;
  }
  return isPdfMagic(buffer);
}

export async function extractTextFromPdfBuffer(
  buffer: Buffer,
): Promise<string> {
  await ensurePdfCanvasGlobals();
  const { PDFParse } = await import("pdf-parse");
  PDFParse.setWorker(resolvePdfJsWorkerFileUrl());
  const data = new Uint8Array(buffer.length);
  data.set(buffer);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return fixIndicPdfExtractionArtifacts(result.text);
  } finally {
    await parser.destroy();
  }
}
