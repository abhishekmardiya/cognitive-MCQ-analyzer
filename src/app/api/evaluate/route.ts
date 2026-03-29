import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { buildMcqPdfBuffer } from "@/lib/build-mcq-pdf";
import {
  fixIndicInEvaluationResult,
  fixIndicPdfExtractionArtifacts,
} from "@/lib/fix-indic-extraction-spaces";
import { formatEvaluateErrorMessage } from "@/lib/format-evaluate-error";
import {
  buildPdfSourceDocumentTitle,
  PDF_APP_DOCUMENT_TITLE,
} from "@/lib/format-pdf-document-title";
import { DEFAULT_GEMINI_TEXT_MODEL_ID } from "@/lib/gemini-text-model-catalog";
import {
  buildGeminiModelChain,
  resolvePreferredGeminiModel,
  shouldTryAlternateGeminiModelWithStreamContext,
} from "@/lib/gemini-text-models";
import type { McqEvaluationResult } from "@/lib/mcq-schemas";
import { MCQ_SYSTEM_PROMPT } from "@/lib/mcq-system-prompt";
import {
  isNonStringFormDataFile,
  rawTestMaterialFromBufferAndName,
  rawTestMaterialFromFormBlob,
} from "@/lib/read-uploaded-test";
import { runMcqGeminiEvaluationForModel } from "@/lib/run-mcq-gemini-evaluation";

export const maxDuration = 300;

/** Large exams need enough room for structured JSON (many questions × explanations). */
const MAX_MCQ_OUTPUT_TOKENS = 65_536;

function resolveGeminiApiKey(): string | null {
  const googleEnv = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const geminiEnv = process.env.GEMINI_API_KEY;
  if (typeof googleEnv === "string" && googleEnv.length > 0) {
    return googleEnv;
  }
  if (typeof geminiEnv === "string" && geminiEnv.length > 0) {
    return geminiEnv;
  }
  return null;
}

type JsonEvaluateBody = {
  text?: unknown;
  pdfBase64?: unknown;
  pdfFileName?: unknown;
  model?: unknown;
};

export async function POST(request: Request) {
  const apiKey = resolveGeminiApiKey();
  if (apiKey === null) {
    return Response.json(
      {
        error:
          "Missing API key. Set GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY for the Gemini API.",
      },
      { status: 500 },
    );
  }

  let rawText: string;
  /** Set for PDF uploads so Gemini can read the file natively (fixes broken text-layer encoding). */
  let pdfBuffer: Buffer | null = null;
  let pdfPageCount: number | null = null;
  let clientModelHint: string | null = null;
  /** Shown as the PDF cover title (app name for pasted text; app name + file for PDF upload). */
  let pdfDocumentTitle: string | null = null;
  const contentType = request.headers.get("content-type") || "";
  const isMultipart = contentType.toLowerCase().includes("multipart/form-data");

  if (isMultipart) {
    const form = await request.formData();
    const modelField = form.get("model");
    if (typeof modelField === "string" && modelField.length > 0) {
      clientModelHint = modelField;
    }
    const fileEntry = form.get("file");
    const pasted = form.get("text");
    if (isNonStringFormDataFile(fileEntry) && fileEntry.size > 0) {
      pdfDocumentTitle = buildPdfSourceDocumentTitle(fileEntry.name);
      try {
        const material = await rawTestMaterialFromFormBlob(fileEntry);
        rawText = material.text;
        pdfBuffer = material.pdfBuffer;
        pdfPageCount = material.pdfPageCount;
      } catch (parseErr) {
        const msg =
          parseErr instanceof Error ? parseErr.message : "Could not read file.";
        return Response.json({ error: msg }, { status: 400 });
      }
    } else if (typeof pasted === "string") {
      pdfDocumentTitle = PDF_APP_DOCUMENT_TITLE;
      rawText = pasted;
      pdfBuffer = null;
    } else {
      return Response.json(
        {
          error:
            "Multipart requests must include a non-empty file or a text field.",
        },
        { status: 400 },
      );
    }
  } else {
    let body: JsonEvaluateBody;
    try {
      body = (await request.json()) as JsonEvaluateBody;
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (typeof body.model === "string" && body.model.length > 0) {
      clientModelHint = body.model;
    }

    const pdfB64 = body.pdfBase64;
    if (typeof pdfB64 === "string" && pdfB64.trim().length > 0) {
      let buffer: Buffer;
      try {
        buffer = Buffer.from(pdfB64.trim(), "base64");
      } catch {
        return Response.json(
          { error: "Invalid PDF data (base64 decode failed)." },
          { status: 400 },
        );
      }
      if (buffer.length === 0) {
        return Response.json(
          { error: "PDF data was empty after decoding." },
          { status: 400 },
        );
      }
      const pdfName =
        typeof body.pdfFileName === "string" && body.pdfFileName.length > 0
          ? body.pdfFileName
          : "upload.pdf";
      pdfDocumentTitle = buildPdfSourceDocumentTitle(pdfName);
      try {
        const material = await rawTestMaterialFromBufferAndName(
          buffer,
          pdfName,
        );
        rawText = material.text;
        pdfBuffer = material.pdfBuffer;
        pdfPageCount = material.pdfPageCount;
      } catch (parseErr) {
        const msg =
          parseErr instanceof Error ? parseErr.message : "Could not read PDF.";
        return Response.json({ error: msg }, { status: 400 });
      }
    } else if (typeof body.text === "string") {
      pdfDocumentTitle = PDF_APP_DOCUMENT_TITLE;
      rawText = body.text;
      pdfBuffer = null;
    } else {
      return Response.json(
        {
          error:
            'JSON body must include a string "text" field, or "pdfBase64" with an optional "pdfFileName".',
        },
        { status: 400 },
      );
    }
  }

  const trimmed = fixIndicPdfExtractionArtifacts(rawText.trim());
  if (trimmed.length === 0 && pdfBuffer === null) {
    return Response.json(
      {
        error:
          "No text found to analyze. For PDFs, try a text-based file (not a scan); for scans, use OCR first or paste the questions.",
      },
      { status: 400 },
    );
  }

  const preferred = resolvePreferredGeminiModel(clientModelHint);
  const modelChain = buildGeminiModelChain(preferred);

  const google = createGoogleGenerativeAI({ apiKey });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writeJsonLine = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        const modelsAttempted: string[] = [];
        let output: McqEvaluationResult | null = null;
        let modelUsed = modelChain[0] ?? DEFAULT_GEMINI_TEXT_MODEL_ID;
        let lastErr: unknown;

        for (let i = 0; i < modelChain.length; i++) {
          const modelId = modelChain[i];
          modelsAttempted.push(modelId);
          let providerStreamError: unknown;
          try {
            providerStreamError = undefined;
            const nextOutput: McqEvaluationResult =
              await runMcqGeminiEvaluationForModel({
                google,
                modelId,
                systemPrompt: MCQ_SYSTEM_PROMPT,
                trimmed,
                pdfBuffer,
                pdfPageCount,
                maxOutputTokens: MAX_MCQ_OUTPUT_TOKENS,
                sink: {
                  writeJsonLine,
                  onProviderStreamError: (e) => {
                    providerStreamError = e;
                  },
                },
              });
            output = nextOutput;
            modelUsed = modelId;
            break;
          } catch (err) {
            lastErr = err;
            const hasMore = i < modelChain.length - 1;
            if (
              shouldTryAlternateGeminiModelWithStreamContext(
                err,
                providerStreamError,
              ) &&
              hasMore
            ) {
              writeJsonLine({
                type: "status",
                message: `Switching model after ${modelId} failed (trying next in chain)…`,
              });
              continue;
            }
            throw err;
          }
        }

        if (output === null) {
          throw lastErr ?? new Error("Evaluation failed.");
        }

        const resultForClient = fixIndicInEvaluationResult(output);

        const generatedAt = new Date().toISOString();
        let pdfBase64 = "";
        let pdfGenerationError: string | null = null;
        try {
          const pdfBytes = await buildMcqPdfBuffer({
            documentTitle: pdfDocumentTitle,
            generatedAt,
            result: resultForClient,
          });
          pdfBase64 = Buffer.from(pdfBytes).toString("base64");
        } catch (pdfErr) {
          pdfGenerationError = formatEvaluateErrorMessage(pdfErr);
        }

        writeJsonLine({
          type: "complete",
          result: resultForClient,
          pdfBase64,
          pdfFileName:
            pdfBase64.length > 0
              ? `cognitive-mcq-analysis-${Date.now()}.pdf`
              : "",
          meta: {
            title: pdfDocumentTitle ?? PDF_APP_DOCUMENT_TITLE,
            generatedAt,
            model: modelUsed,
            modelsAttempted,
            ...(pdfGenerationError !== null ? { pdfGenerationError } : {}),
          },
        });
      } catch (err) {
        const message = formatEvaluateErrorMessage(err);
        writeJsonLine({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
