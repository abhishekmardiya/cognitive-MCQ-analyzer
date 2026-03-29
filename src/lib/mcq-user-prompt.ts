const MCQ_PARSE_RULES = `Parse ONLY genuine multiple-choice questions (stem + labeled options). Ignore all non-MCQ content (instructions, cover pages, keys without stems, essays, etc.). Do not invent questions from non-MCQ text.

For each included MCQ, evaluate it fully and populate the structured result. Review ALL such MCQs in scope for this response; do not ask follow-up questions.

For EVERY question, write correctAnswerLabel and explanation in the SAME language as that question (Gujarati questions → fully Gujarati; Hindi → Hindi; English → English). Never switch explanations to English for non-English questions.

Keep each explanation short (target under ~350 Unicode characters, max 560), **one line** (no newline inside the string), and **JSON-safe**: never use ASCII double-quote (Unicode U+0022) inside explanations or question/option text — use single quotes or other marks. Shorter explanations prevent truncated JSON and failed runs.`;

export function buildFullTextUserPrompt(trimmed: string): string {
  return `The user submitted the following test material.

${MCQ_PARSE_RULES}

---BEGIN TEST---
${trimmed}
---END TEST---`;
}

/** When the PDF text layer is empty or useless but bytes are available. */
export function buildPdfOnlyUserPrompt(): string {
  return `The user attached a test document as a PDF file.

${MCQ_PARSE_RULES}

Read the attached PDF and extract exact question stems and option text as shown in the document (use the PDF as the source of truth for all scripts and symbols).`;
}

/**
 * PDF is attached; do not embed the text-layer extract (often mojibake for Indic fonts).
 */
export function buildPdfBackedFullDocumentUserPrompt(): string {
  return `The user attached their test as a PDF file (included in this message).

${MCQ_PARSE_RULES}

CRITICAL — transcription source:
* Fill **questionText** and every option **text** field only from what you read in the **attached PDF** (correct Gujarati/Devanagari/etc.).
* This message intentionally does **not** include a plaintext dump. Do **not** paste random Latin symbols or mojibake into those fields.
* Return every multiple-choice question in the PDF in reading order. Set inputStatus to "complete" when you have included all such MCQs from the document.`;
}

export function buildChunkUserPrompt(
  chunk: string,
  partIndex: number,
  totalParts: number,
  hasPdfAttachment: boolean,
): string {
  const pdfNote = hasPdfAttachment
    ? "The attached PDF is the **only** trusted source for **questionText** and option **text** (exact Unicode script as shown). The excerpt below often has broken encoding — use it **only** to guess which MCQs belong in this part (position in file), **never** to copy characters into JSON.\n\n"
    : "";

  const scopeLine = hasPdfAttachment
    ? `Return MCQs that belong to this part of the document (use excerpt + PDF layout to decide). Omit questions that clearly belong to other parts.`
    : `Return a McqEvaluationResult containing ONLY multiple-choice questions that **substantially appear in the excerpt below** (stem + labeled options). Omit questions that belong to other parts.`;

  return `${pdfNote}This is part ${String(partIndex + 1)} of ${String(totalParts)} of the test material.

${scopeLine} Use index as 0-based order **within this part only** (indices will be renumbered when parts are merged).

${MCQ_PARSE_RULES}

---BEGIN EXCERPT (part ${String(partIndex + 1)} of ${String(totalParts)})---
${chunk}
---END EXCERPT---`;
}

/**
 * Multi-pass with PDF: no plaintext excerpt (avoids copying mojibake from a broken text layer).
 */
export function buildPdfPageRangeChunkUserPrompt(options: {
  partIndex: number;
  totalParts: number;
  startPage: number;
  endPage: number;
  totalPages: number;
}): string {
  const { partIndex, totalParts, startPage, endPage, totalPages } = options;
  return `The attached PDF has ${String(totalPages)} page(s), numbered 1–${String(totalPages)} in normal reading order.

This is part ${String(partIndex + 1)} of ${String(totalParts)} of the evaluation pass.

SCOPE (mandatory):
* Include only multiple-choice questions whose **question stem starts** on PDF page ${String(startPage)} through ${String(endPage)} (inclusive).
* If a stem starts on an earlier page but the labeled options for that same MCQ appear inside this page range, include the **entire** MCQ (stem + all options) from the PDF.
* If a stem starts in range but options continue on later pages, still include the **full** MCQ.
* Omit MCQs that belong only outside this page window.

TRANSCRIPTION (mandatory):
* **questionText** and every option **text** must be copied from the **attached PDF** in correct Unicode (Gujarati, Devanagari, Latin, etc.).
* This message has **no** plaintext dump of the exam. Do **not** invent stems or paste mojibake / Latin-accent gibberish. If something is unreadable, use a short tag like "[illegible]" instead of random symbols.

Use index as 0-based order **within this part only** (indices will be renumbered when parts are merged).

${MCQ_PARSE_RULES}`;
}

/**
 * Fallback when page count is unavailable: segment the PDF by approximate position without an excerpt.
 */
export function buildPdfFractionChunkUserPrompt(
  partIndex: number,
  totalParts: number,
): string {
  return `The user attached a full test PDF (this message). This is part ${String(partIndex + 1)} of ${String(totalParts)}.

SCOPE:
* Consider the PDF in **reading order** from start to end. Restrict this response to MCQs that fall in the **${String(partIndex + 1)}-th of ${String(totalParts)} equal segments** by position (same idea as slicing the document into ${String(totalParts)} sequential blocks).
* At segment boundaries, if unsure whether an MCQ belongs here or the adjacent part, **include** it here so it is not dropped (duplicates are merged later).

TRANSCRIPTION:
* **questionText** and option **text** only from the **PDF** — never from memory or guesswork. No mojibake.

${MCQ_PARSE_RULES}

Use index as 0-based order **within this part only**.`;
}
