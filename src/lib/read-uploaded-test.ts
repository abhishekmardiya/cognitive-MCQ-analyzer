import {
  extractTextFromPdfBuffer,
  shouldParseAsPdf,
} from "@/lib/extract-pdf-text";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/upload-limits";

export type RawTestMaterial = {
  text: string;
  /** Raw PDF bytes when the upload is a PDF (for native multimodal + model). */
  pdfBuffer: Buffer | null;
  /** Populated for PDFs; used to chunk by page without embedding a corrupt text layer. */
  pdfPageCount: number | null;
};

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
  value: FormDataEntryValue | null,
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

export async function rawTestMaterialFromBufferAndName(
  buffer: Buffer,
  fileName: string,
): Promise<RawTestMaterial> {
  assertSize(buffer);
  if (shouldParseAsPdf(buffer, fileName)) {
    const { text, pageCount } = await extractTextFromPdfBuffer(buffer);
    return {
      text,
      pdfBuffer: buffer,
      pdfPageCount: pageCount > 0 ? pageCount : null,
    };
  }
  return {
    text: buffer.toString("utf8"),
    pdfBuffer: null,
    pdfPageCount: null,
  };
}

export async function rawTextFromBufferAndName(
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  const { text } = await rawTestMaterialFromBufferAndName(buffer, fileName);
  return text;
}

export async function rawTestMaterialFromFormBlob(
  blob: Blob,
): Promise<RawTestMaterial> {
  if (blob.size === 0) {
    throw new Error("Uploaded file is empty.");
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large (max ${MAX_UPLOAD_MB} MB).`);
  }
  const ab = await blob.arrayBuffer();
  const buffer = Buffer.from(ab);
  const fileName = uploadDisplayName(blob);
  return rawTestMaterialFromBufferAndName(buffer, fileName);
}

export async function rawTextFromFormBlob(blob: Blob): Promise<string> {
  const { text } = await rawTestMaterialFromFormBlob(blob);
  return text;
}
