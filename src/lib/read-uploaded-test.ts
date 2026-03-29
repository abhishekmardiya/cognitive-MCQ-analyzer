import {
  extractTextFromPdfBuffer,
  shouldParseAsPdf,
} from "@/lib/extract-pdf-text";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/upload-limits";

function assertSize(buffer: Buffer): void {
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large (max ${MAX_UPLOAD_MB} MB).`);
  }
}

function uploadDisplayName(blob: Blob): string {
  const maybe = blob as Blob & { name?: string };
  if (typeof maybe.name === "string" && maybe.name.length > 0) {
    return maybe.name;
  }
  return "upload.bin";
}

export function isNonStringFormDataFile(
  value: FormDataEntryValue | null
): value is File {
  if (value === null || typeof value === "string") {
    return false;
  }
  return (
    typeof value === "object" &&
    typeof (value as Blob).arrayBuffer === "function" &&
    typeof (value as Blob).size === "number"
  );
}

export async function rawTextFromBufferAndName(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  assertSize(buffer);
  if (shouldParseAsPdf(buffer, fileName)) {
    return extractTextFromPdfBuffer(buffer);
  }
  return buffer.toString("utf8");
}

export async function rawTextFromFormBlob(blob: Blob): Promise<string> {
  if (blob.size === 0) {
    throw new Error("Uploaded file is empty.");
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large (max ${MAX_UPLOAD_MB} MB).`);
  }
  const ab = await blob.arrayBuffer();
  const buffer = Buffer.from(ab);
  const fileName = uploadDisplayName(blob);
  return rawTextFromBufferAndName(buffer, fileName);
}
