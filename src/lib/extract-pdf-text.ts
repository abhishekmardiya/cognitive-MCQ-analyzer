import { fixIndicPdfExtractionArtifacts } from "@/lib/fix-indic-extraction-spaces";

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
