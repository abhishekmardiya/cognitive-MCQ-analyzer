import { fixIndicPdfExtractionArtifacts } from "@/lib/fix-indic-extraction-spaces";

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
