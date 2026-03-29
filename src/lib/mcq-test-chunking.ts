/** Rough count of numbered / parenthesized question starters (lines). */
export function estimateLikelyMcqCountFromText(text: string): number {
  const matches = text.match(/^\s*\(?\d{1,3}[).\s]/gm);
  if (matches === null) {
    return 0;
  }
  return matches.length;
}

const CHUNK_TARGET_CHARS = 20_000;
const CHUNK_OVERLAP_CHARS = 900;
const CHUNK_TRIGGER_LEN = 22_000;

/**
 * When true, run several model calls with overlapping excerpts and merge (smaller JSON per call).
 */
export function shouldUseMultiPassEvaluation(
  trimmed: string,
  hasPdf: boolean,
): boolean {
  if (trimmed.length === 0) {
    return false;
  }
  if (trimmed.length >= CHUNK_TRIGGER_LEN) {
    return true;
  }
  const n = estimateLikelyMcqCountFromText(trimmed);
  if (n >= 14) {
    return true;
  }
  if (hasPdf && (trimmed.length >= 14_000 || n >= 10)) {
    return true;
  }
  return false;
}

/**
 * Split long material near paragraph boundaries with overlap so an MCQ split across a boundary
 * can still appear complete in one of two adjacent chunks (merge dedupes duplicates).
 */
export function splitTestMaterialIntoOverlappingChunks(text: string): string[] {
  if (text.length <= CHUNK_TRIGGER_LEN) {
    return [text];
  }
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_TARGET_CHARS, text.length);
    if (end < text.length) {
      const windowStart = Math.max(start, end - 4000);
      const searchWindow = text.slice(windowStart, end);
      const breakAt = searchWindow.lastIndexOf("\n\n");
      if (breakAt >= 0) {
        end = windowStart + breakAt + 2;
      }
    }
    chunks.push(text.slice(start, end));
    if (end >= text.length) {
      break;
    }
    start = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1);
  }
  return chunks;
}

function splitIntoRoughlyEqualCharChunks(
  text: string,
  partCount: number,
  overlap: number,
): string[] {
  if (partCount <= 1 || text.length === 0) {
    return [text];
  }
  const out: string[] = [];
  let start = 0;
  for (let p = 0; p < partCount; p++) {
    if (start >= text.length) {
      break;
    }
    const isLast = p === partCount - 1;
    const targetEnd = isLast
      ? text.length
      : Math.min(text.length, Math.ceil((text.length * (p + 1)) / partCount));
    let end = targetEnd;
    if (!isLast && end < text.length) {
      const searchFrom = Math.max(start, end - 2500);
      const slice = text.slice(searchFrom, Math.min(text.length, end + 1500));
      const breakAt = slice.lastIndexOf("\n\n");
      if (breakAt >= 0) {
        end = searchFrom + breakAt + 2;
      }
    }
    if (end <= start) {
      end = Math.min(text.length, start + 1);
    }
    out.push(text.slice(start, end));
    if (isLast) {
      break;
    }
    start = Math.max(end - overlap, start + 1);
  }
  return out.filter((c) => {
    return c.trim().length > 0;
  });
}

/**
 * Chunks for multi-pass evaluation: long text windows, or forced splits when many
 * question markers suggest a huge JSON response from a single call.
 */
export function splitTestMaterialForMultiPass(text: string): string[] {
  let chunks = splitTestMaterialIntoOverlappingChunks(text);
  const n = estimateLikelyMcqCountFromText(text);
  if (chunks.length === 1 && n >= 14) {
    const partCount = Math.min(10, Math.max(2, Math.ceil(n / 12)));
    chunks = splitIntoRoughlyEqualCharChunks(
      text,
      partCount,
      CHUNK_OVERLAP_CHARS,
    );
  }
  return chunks.length > 0 ? chunks : [text];
}

/** Max pages per Gemini call when chunking by page (keeps JSON size manageable). */
const PDF_CHUNK_MAX_PAGES = 4;
const PDF_CHUNK_PAGE_OVERLAP = 1;

export type PdfPageRangeChunk = { startPage: number; endPage: number };

/**
 * Overlapping page windows so an MCQ split across pages appears in one chunk.
 * Page numbers are 1-based, inclusive.
 */
export function splitPdfIntoOverlappingPageChunks(
  pageCount: number,
): PdfPageRangeChunk[] {
  if (pageCount <= 0) {
    return [];
  }
  if (pageCount <= PDF_CHUNK_MAX_PAGES) {
    return [{ startPage: 1, endPage: pageCount }];
  }
  const chunks: PdfPageRangeChunk[] = [];
  let start = 1;
  while (start <= pageCount) {
    const end = Math.min(pageCount, start + PDF_CHUNK_MAX_PAGES - 1);
    chunks.push({ startPage: start, endPage: end });
    if (end === pageCount) {
      break;
    }
    start = end - PDF_CHUNK_PAGE_OVERLAP + 1;
  }
  return chunks;
}

/**
 * Same number of parts as {@link splitTestMaterialForMultiPass} would use, but each part is a
 * page range (1-based) so PDF-backed runs never need a plaintext excerpt.
 */
function splitPageCountIntoRoughlyEqualOverlappingChunks(
  pageCount: number,
  partCount: number,
  overlapPages: number,
): PdfPageRangeChunk[] {
  if (pageCount <= 0) {
    return [];
  }
  if (partCount <= 1) {
    return [{ startPage: 1, endPage: pageCount }];
  }
  const effectiveParts = Math.min(partCount, pageCount);
  const out: PdfPageRangeChunk[] = [];
  let start = 1;
  for (let p = 0; p < effectiveParts; p++) {
    if (start > pageCount) {
      break;
    }
    const isLast = p === effectiveParts - 1;
    const targetEnd = isLast
      ? pageCount
      : Math.min(pageCount, Math.ceil((pageCount * (p + 1)) / effectiveParts));
    let end = targetEnd;
    if (end < start) {
      end = start;
    }
    out.push({ startPage: start, endPage: end });
    if (isLast) {
      break;
    }
    start = Math.max(end - overlapPages + 1, start + 1);
  }
  return out.filter((c) => {
    return c.startPage <= c.endPage;
  });
}

export function splitPdfPageRangesForMultiPass(
  pageCount: number,
  trimmed: string,
): PdfPageRangeChunk[] {
  if (pageCount <= 0) {
    return [];
  }
  const textChunks = splitTestMaterialForMultiPass(trimmed);
  const textPartCount = textChunks.length;
  const nFromMarkers = estimateLikelyMcqCountFromText(trimmed);
  const pageHeuristicMcqs = Math.ceil(pageCount * 1.6);
  const mcqHint = Math.max(nFromMarkers, pageHeuristicMcqs);
  const mcqDrivenParts =
    mcqHint >= 8
      ? Math.min(18, Math.max(textPartCount, Math.ceil(mcqHint / 3)))
      : textPartCount;

  if (mcqDrivenParts <= 1) {
    return splitPdfIntoOverlappingPageChunks(pageCount);
  }
  return splitPageCountIntoRoughlyEqualOverlappingChunks(
    pageCount,
    mcqDrivenParts,
    PDF_CHUNK_PAGE_OVERLAP,
  );
}

export function normalizeMcqDedupeKey(questionText: string): string {
  return questionText.replace(/\s+/g, " ").trim().slice(0, 200).toLowerCase();
}
