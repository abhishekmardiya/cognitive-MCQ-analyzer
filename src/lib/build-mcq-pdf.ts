import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  formatCorrectAnswerWithOptionText,
  stripLeadingQuestionNumberFromStem,
} from "@/lib/format-mcq-display";
import { PDF_DOCUMENT_TITLE_SEPARATOR } from "@/lib/format-pdf-document-title";
import { formatGeneratedTimestampIst } from "@/lib/format-timestamp-ist";
import type { McqEvaluationResult } from "@/lib/mcq-schemas";

const require = createRequire(import.meta.url);

function pdfFontPath(fileName: string): string {
  return join(process.cwd(), "public", "pdf-fonts", fileName);
}

type PdfFontFamily = "NotoSans" | "NotoGujarati" | "NotoDevanagari";

type PdfMakeInstance = {
  virtualfs: {
    writeFileSync: (
      filename: string,
      content: string | Buffer,
      options?: string,
    ) => void;
  };
  setFonts: (fonts: Record<string, Record<string, string>>) => void;
  setUrlAccessPolicy: (fn: (url: string) => boolean) => void;
  createPdf: (doc: Record<string, unknown>) => {
    getBuffer: () => Promise<Buffer>;
  };
};

let pdfMakeSingleton: PdfMakeInstance | null = null;

const MARK_CHAR_RE = /\p{M}/u;

function isJoinerOrFormat(cp: number): boolean {
  if (cp === 0x200c || cp === 0x200d) {
    return true;
  }
  if (cp >= 0xfe00 && cp <= 0xfe0f) {
    return true;
  }
  if (cp >= 0xe0100 && cp <= 0xe01ef) {
    return true;
  }
  return false;
}

function fontForScalar(
  ch: string,
  cp: number,
  lastResolved: PdfFontFamily,
): { font: PdfFontFamily; resolves: boolean } {
  if (isJoinerOrFormat(cp) || MARK_CHAR_RE.test(ch)) {
    return { font: lastResolved, resolves: false };
  }
  if (cp >= 0x0a80 && cp <= 0x0aff) {
    return { font: "NotoGujarati", resolves: true };
  }
  if (cp >= 0x0900 && cp <= 0x097f) {
    return { font: "NotoDevanagari", resolves: true };
  }
  return { font: "NotoSans", resolves: true };
}

function segmentTextByScript(
  text: string,
): { text: string; font: PdfFontFamily }[] {
  if (text.length === 0) {
    return [];
  }
  const out: { text: string; font: PdfFontFamily }[] = [];
  let lastResolved: PdfFontFamily = "NotoSans";
  let currentFont: PdfFontFamily = "NotoSans";
  let buffer = "";

  const flush = () => {
    if (buffer.length > 0) {
      out.push({ text: buffer, font: currentFont });
      buffer = "";
    }
  };

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) {
      continue;
    }
    const { font, resolves } = fontForScalar(ch, cp, lastResolved);
    if (resolves) {
      lastResolved = font;
    }
    if (font !== currentFont) {
      flush();
      currentFont = font;
    }
    buffer += ch;
  }
  flush();
  return out;
}

function scriptedParagraph(
  text: string,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const runs = segmentTextByScript(text);
  if (runs.length === 0) {
    return { text: " ", ...extra };
  }
  if (runs.length === 1) {
    const [only] = runs;
    return { text: only.text, font: only.font, ...extra };
  }
  return {
    text: runs.map(({ text: t, font }) => {
      return { text: t, font };
    }),
    ...extra,
  };
}

function loadFontToVfs(pdfMake: PdfMakeInstance, fileName: string): void {
  const buf = readFileSync(pdfFontPath(fileName));
  pdfMake.virtualfs.writeFileSync(fileName, buf);
}

function getPdfMake(): PdfMakeInstance {
  if (pdfMakeSingleton) {
    return pdfMakeSingleton;
  }
  const pdfMake = require("pdfmake") as PdfMakeInstance;

  const fontFiles = [
    "NotoSans-Regular.ttf",
    "NotoSans-Bold.ttf",
    "NotoSansGujarati-Regular.ttf",
    "NotoSansGujarati-Bold.ttf",
    "NotoSansDevanagari-Regular.ttf",
    "NotoSansDevanagari-Bold.ttf",
  ];
  for (const name of fontFiles) {
    loadFontToVfs(pdfMake, name);
  }

  pdfMake.setFonts({
    NotoSans: {
      normal: "NotoSans-Regular.ttf",
      bold: "NotoSans-Bold.ttf",
      italics: "NotoSans-Regular.ttf",
      bolditalics: "NotoSans-Bold.ttf",
    },
    NotoGujarati: {
      normal: "NotoSansGujarati-Regular.ttf",
      bold: "NotoSansGujarati-Bold.ttf",
      italics: "NotoSansGujarati-Regular.ttf",
      bolditalics: "NotoSansGujarati-Bold.ttf",
    },
    NotoDevanagari: {
      normal: "NotoSansDevanagari-Regular.ttf",
      bold: "NotoSansDevanagari-Bold.ttf",
      italics: "NotoSansDevanagari-Regular.ttf",
      bolditalics: "NotoSansDevanagari-Bold.ttf",
    },
  });
  pdfMake.setUrlAccessPolicy(() => {
    return false;
  });
  pdfMakeSingleton = pdfMake;
  return pdfMake;
}

/** Emerald / teal accents aligned with the app UI. */
const PDF_TITLE_BRAND_COLOR = "#047857";
const PDF_TITLE_FILE_COLOR = "#0f766e";
const PDF_TITLE_SEP_COLOR = "#9ca3af";

function buildPdfCoverTitleBlock(
  trimmedTitle: string,
): Record<string, unknown> {
  const sep = PDF_DOCUMENT_TITLE_SEPARATOR;
  const sepIdx = trimmedTitle.indexOf(sep);
  const margin: [number, number, number, number] = [0, 0, 0, 12];
  if (sepIdx < 0) {
    return {
      text: trimmedTitle,
      font: "NotoSans",
      fontSize: 28,
      bold: true,
      color: PDF_TITLE_BRAND_COLOR,
      margin,
    };
  }
  const brandPart = trimmedTitle.slice(0, sepIdx);
  const filePart = trimmedTitle.slice(sepIdx + sep.length);
  return {
    font: "NotoSans",
    text: [
      {
        text: brandPart,
        bold: true,
        fontSize: 28,
        color: PDF_TITLE_BRAND_COLOR,
      },
      {
        text: sep,
        bold: true,
        fontSize: 22,
        color: PDF_TITLE_SEP_COLOR,
      },
      {
        text: filePart,
        bold: true,
        fontSize: 26,
        color: PDF_TITLE_FILE_COLOR,
      },
    ],
    margin,
  };
}

function buildContentBlocks({
  documentTitle,
  generatedAt,
  result,
}: {
  /** When null or empty, no title line is rendered (e.g. pasted text input). */
  documentTitle: string | null;
  generatedAt: string;
  result: McqEvaluationResult;
}): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const trimmedTitle =
    documentTitle !== null && documentTitle.trim().length > 0
      ? documentTitle.trim()
      : null;
  if (trimmedTitle !== null) {
    blocks.push(buildPdfCoverTitleBlock(trimmedTitle));
  }
  blocks.push({
    text: `Generated: ${formatGeneratedTimestampIst(generatedAt)}`,
    style: "muted",
    font: "NotoSans",
    margin: [0, trimmedTitle !== null ? 4 : 0, 0, 16],
  });

  if (result.inputStatus === "incomplete" && result.inputIncompleteMessage) {
    blocks.push({
      ...scriptedParagraph(result.inputIncompleteMessage, {
        style: "warning",
        margin: [0, 0, 0, 16],
      }),
    });
  }

  const sorted = [...result.evaluations].sort((a, b) => {
    return a.index - b.index;
  });

  for (const ev of sorted) {
    blocks.push({
      text: `Question ${ev.index + 1}`,
      style: "questionHeading",
      font: "NotoSans",
    });
    blocks.push({
      ...scriptedParagraph(
        stripLeadingQuestionNumberFromStem(ev.questionText),
        {
          style: "body",
          margin: [0, 4, 0, 10],
        },
      ),
    });
    blocks.push({ text: "Options", style: "subheading", font: "NotoSans" });
    for (const opt of ev.options) {
      blocks.push({
        ...scriptedParagraph(`${opt.label}. ${opt.text}`, {
          style: "optionLine",
          margin: [12, 2, 0, 0],
        }),
      });
    }
    blocks.push({
      text: "Correct answer",
      style: "subheading",
      font: "NotoSans",
      margin: [0, 10, 0, 4],
    });
    blocks.push({
      ...scriptedParagraph(
        formatCorrectAnswerWithOptionText(ev.options, ev.correctAnswerLabel),
        {
          style: "answer",
          margin: [0, 0, 0, 10],
        },
      ),
    });
    blocks.push({ text: "Explanation", style: "subheading", font: "NotoSans" });
    blocks.push({
      ...scriptedParagraph(ev.explanation, {
        style: "body",
        margin: [0, 4, 0, 20],
      }),
    });
  }

  return blocks;
}

export async function buildMcqPdfBuffer({
  documentTitle,
  generatedAt,
  result,
}: {
  documentTitle: string | null;
  generatedAt: string;
  result: McqEvaluationResult;
}): Promise<Uint8Array> {
  const pdfMake = getPdfMake();
  const docDefinition = {
    pageSize: "LETTER" as const,
    pageMargins: [48, 56, 48, 56] as [number, number, number, number],
    content: buildContentBlocks({ documentTitle, generatedAt, result }),
    styles: {
      muted: { fontSize: 10, color: "#555555" },
      warning: { fontSize: 11, color: "#b45309", bold: true },
      questionHeading: { fontSize: 14, bold: true, margin: [0, 12, 0, 0] },
      subheading: { fontSize: 11, bold: true },
      body: { fontSize: 11, alignment: "justify" as const },
      optionLine: { fontSize: 11 },
      answer: { fontSize: 12, bold: true, color: "#166534" },
    },
    defaultStyle: {
      font: "NotoSans",
      fontSize: 11,
    },
  };

  const buffer = await pdfMake.createPdf(docDefinition).getBuffer();
  return new Uint8Array(buffer);
}
