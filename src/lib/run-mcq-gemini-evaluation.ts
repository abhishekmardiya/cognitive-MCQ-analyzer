import type { DeepPartial, LanguageModel } from "ai";
import { Output, streamText } from "ai";
import { mergeMcqEvaluationChunkResults } from "@/lib/mcq-chunk-merge";
import {
  type McqEvaluationResult,
  mcqEvaluationResultSchema,
} from "@/lib/mcq-schemas";
import {
  shouldUseMultiPassEvaluation,
  splitPdfPageRangesForMultiPass,
  splitTestMaterialForMultiPass,
} from "@/lib/mcq-test-chunking";
import {
  buildChunkUserPrompt,
  buildFullTextUserPrompt,
  buildPdfBackedFullDocumentUserPrompt,
  buildPdfFractionChunkUserPrompt,
  buildPdfOnlyUserPrompt,
  buildPdfPageRangeChunkUserPrompt,
} from "@/lib/mcq-user-prompt";

export type McqEvalStreamSink = {
  writeJsonLine: (payload: unknown) => void;
  onProviderStreamError?: (error: unknown) => void;
};

function modelAcceptsPdfAttachment(modelId: string): boolean {
  return !modelId.startsWith("gemma-");
}

function collectErrorMessageChain(
  err: unknown,
  out: string[],
  depth: number,
): void {
  if (depth > 12 || err === null || err === undefined) {
    return;
  }
  if (err instanceof Error) {
    if (err.message.length > 0) {
      out.push(err.message);
    }
    collectErrorMessageChain(err.cause, out, depth + 1);
    return;
  }
  if (typeof err === "string" && err.length > 0) {
    out.push(err);
  }
}

function isLikelyTruncatedStructuredOutputError(err: unknown): boolean {
  const parts: string[] = [];
  collectErrorMessageChain(err, parts, 0);
  const blob = parts.join("\n").toLowerCase();
  if (blob.length === 0) {
    return false;
  }
  return (
    blob.includes("unterminated string") ||
    blob.includes("json parse") ||
    blob.includes("could not parse") ||
    blob.includes("no object generated") ||
    blob.includes("failed to parse") ||
    blob.includes("invalid json")
  );
}

function buildStructuredJsonRetrySuffix(maxExplanationChars: number): string {
  const cap = String(maxExplanationChars);
  return `

---
RETRY (required): The last structured JSON was incomplete or invalid (e.g. unterminated string).

Hard limits for this attempt:
* Each **explanation**: at most **${cap} Unicode characters**, **one line only** (no newline inside the string).
* Do **not** use the ASCII double-quote character (") inside **explanation**, **questionText**, or option **text** — use single quotes or other punctuation so JSON stays valid.
* End every string with a closing quote; close all objects and arrays. Prefer dropping detail over truncation.`;
}

/** Prefer output tokens for JSON; thinking/reasoning can exhaust the budget and truncate structured output. */
function providerOptionsForGeminiStructured(
  modelId: string,
): { google: { thinkingConfig: { thinkingBudget: number } } } | undefined {
  const id = modelId.toLowerCase();
  if (!id.startsWith("gemini-")) {
    return undefined;
  }
  return {
    google: {
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  };
}

export async function runMcqGeminiEvaluationForModel(options: {
  google: (modelId: string) => LanguageModel;
  modelId: string;
  systemPrompt: string;
  trimmed: string;
  pdfBuffer: Buffer | null;
  /** When set, multi-pass PDF runs chunk by page range instead of embedding a corrupt text extract. */
  pdfPageCount: number | null;
  maxOutputTokens: number;
  sink: McqEvalStreamSink;
}): Promise<McqEvaluationResult> {
  const {
    google,
    modelId,
    systemPrompt,
    trimmed,
    pdfBuffer,
    pdfPageCount,
    maxOutputTokens,
    sink,
  } = options;

  const canAttachPdf = pdfBuffer !== null && modelAcceptsPdfAttachment(modelId);

  const outputSpec = Output.object({
    schema: mcqEvaluationResultSchema,
    name: "McqEvaluationResult",
    description:
      "Structured MCQ evaluation for the supplied test material in scope",
  });

  async function streamOne(
    userText: string,
    attachPdf: boolean,
    emitPartial: ((p: DeepPartial<McqEvaluationResult>) => void) | null,
    callOptions?: { temperature?: number },
  ): Promise<McqEvaluationResult> {
    let providerStreamError: unknown;
    const providerOptions = providerOptionsForGeminiStructured(modelId);
    const temperature =
      callOptions !== undefined && callOptions.temperature !== undefined
        ? callOptions.temperature
        : 0.2;

    const shared = {
      model: google(modelId),
      system: systemPrompt,
      output: outputSpec,
      maxOutputTokens,
      temperature,
      maxRetries: 0,
      ...(providerOptions !== undefined ? { providerOptions } : {}),
      onError: ({ error }: { error: unknown }) => {
        providerStreamError = error;
        sink.onProviderStreamError?.(error);
      },
    } as const;

    const result =
      attachPdf && pdfBuffer !== null
        ? streamText({
            ...shared,
            messages: [
              {
                role: "user" as const,
                content: [
                  {
                    type: "file" as const,
                    data: pdfBuffer,
                    mediaType: "application/pdf",
                    filename: "test.pdf",
                  },
                  { type: "text" as const, text: userText },
                ],
              },
            ],
          })
        : streamText({
            ...shared,
            prompt: userText,
          });

    for await (const partial of result.partialOutputStream) {
      if (emitPartial !== null) {
        emitPartial(partial);
      }
    }

    const out = await result.output;
    if (out === null || out === undefined) {
      throw providerStreamError ?? new Error("Evaluation produced no output.");
    }
    return out;
  }

  async function streamOneWithRetry(
    userText: string,
    attachPdf: boolean,
    emitPartial: ((p: DeepPartial<McqEvaluationResult>) => void) | null,
  ): Promise<McqEvaluationResult> {
    try {
      return await streamOne(userText, attachPdf, emitPartial, {
        temperature: 0.2,
      });
    } catch (firstErr) {
      if (!isLikelyTruncatedStructuredOutputError(firstErr)) {
        throw firstErr;
      }
      sink.writeJsonLine({
        type: "status",
        message:
          "Retrying with shorter explanations (previous JSON was incomplete)…",
      });
      try {
        return await streamOne(
          `${userText}${buildStructuredJsonRetrySuffix(320)}`,
          attachPdf,
          emitPartial,
          {
            temperature: 0,
          },
        );
      } catch (secondErr) {
        if (!isLikelyTruncatedStructuredOutputError(secondErr)) {
          throw secondErr;
        }
        sink.writeJsonLine({
          type: "status",
          message:
            "Second retry with minimal explanations (JSON still incomplete)…",
        });
        return await streamOne(
          `${userText}${buildStructuredJsonRetrySuffix(160)}`,
          attachPdf,
          emitPartial,
          {
            temperature: 0,
          },
        );
      }
    }
  }

  if (trimmed.length === 0 && canAttachPdf) {
    return streamOneWithRetry(buildPdfOnlyUserPrompt(), true, (p) => {
      sink.writeJsonLine({ type: "partial", data: p });
    });
  }

  const multiPass = shouldUseMultiPassEvaluation(trimmed, pdfBuffer !== null);

  if (!multiPass) {
    if (canAttachPdf) {
      return streamOneWithRetry(
        buildPdfBackedFullDocumentUserPrompt(),
        true,
        (p) => {
          sink.writeJsonLine({ type: "partial", data: p });
        },
      );
    }
    return streamOneWithRetry(buildFullTextUserPrompt(trimmed), false, (p) => {
      sink.writeJsonLine({ type: "partial", data: p });
    });
  }

  if (canAttachPdf && pdfPageCount !== null && pdfPageCount > 0) {
    const pageChunks = splitPdfPageRangesForMultiPass(pdfPageCount, trimmed);
    const totalPages = pdfPageCount;
    const parts: McqEvaluationResult[] = [];

    for (let i = 0; i < pageChunks.length; i++) {
      const { startPage, endPage } = pageChunks[i];
      sink.writeJsonLine({
        type: "status",
        message: `Processing PDF pages ${String(startPage)}–${String(endPage)} (part ${String(i + 1)} of ${String(pageChunks.length)})…`,
      });
      const chunkPrompt = buildPdfPageRangeChunkUserPrompt({
        partIndex: i,
        totalParts: pageChunks.length,
        startPage,
        endPage,
        totalPages,
      });
      const part = await streamOneWithRetry(chunkPrompt, true, null);
      parts.push(part);
      const merged = mergeMcqEvaluationChunkResults(parts);
      sink.writeJsonLine({ type: "partial", data: merged });
    }

    return mergeMcqEvaluationChunkResults(parts);
  }

  const chunks = splitTestMaterialForMultiPass(trimmed);
  const parts: McqEvaluationResult[] = [];

  for (let i = 0; i < chunks.length; i++) {
    sink.writeJsonLine({
      type: "status",
      message: `Processing part ${String(i + 1)} of ${String(chunks.length)}…`,
    });
    const chunkPrompt = canAttachPdf
      ? buildPdfFractionChunkUserPrompt(i, chunks.length)
      : buildChunkUserPrompt(chunks[i], i, chunks.length, canAttachPdf);
    const part = await streamOneWithRetry(chunkPrompt, canAttachPdf, null);
    parts.push(part);
    const merged = mergeMcqEvaluationChunkResults(parts);
    sink.writeJsonLine({ type: "partial", data: merged });
  }

  return mergeMcqEvaluationChunkResults(parts);
}
