/**
 * Turns a PDF file name into a short, readable document title (PDF cover line).
 */
export function formatPdfFileNameForDocumentTitle(fileName: string): string {
  let base = fileName.trim();
  if (base.length === 0) {
    return "Uploaded PDF";
  }
  const lower = base.toLowerCase();
  if (lower.endsWith(".pdf")) {
    base = base.slice(0, -4).trim();
  }
  if (base.length === 0) {
    return "Uploaded PDF";
  }
  const spaced = base
    .replace(/[_]+/g, " ")
    .replace(/[-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (spaced.length === 0) {
    return "Uploaded PDF";
  }
  return spaced;
}

/** App name line on generated PDFs (pasted text) and prefix when source is a PDF file. */
export const PDF_APP_DOCUMENT_TITLE = "Cognitive MCQ Analyzer";

/** Separator between product label and file-derived title (used when styling the PDF cover). */
export const PDF_DOCUMENT_TITLE_SEPARATOR = " — ";

/** Cover title when the test came from a PDF file: product name + formatted file name. */
export function buildPdfSourceDocumentTitle(fileName: string): string {
  const formatted = formatPdfFileNameForDocumentTitle(fileName);
  return `${PDF_APP_DOCUMENT_TITLE}${PDF_DOCUMENT_TITLE_SEPARATOR}${formatted}`;
}
