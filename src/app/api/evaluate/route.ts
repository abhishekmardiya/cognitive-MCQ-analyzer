import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Output, streamText } from "ai";
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
import {
  buildGeminiModelChain,
  resolvePreferredGeminiModel,
  shouldTryAlternateGeminiModel,
} from "@/lib/gemini-text-models";
import {
  type McqEvaluationResult,
  mcqEvaluationResultSchema,
} from "@/lib/mcq-schemas";
import { MCQ_SYSTEM_PROMPT } from "@/lib/mcq-system-prompt";
import {
  isNonStringFormDataFile,
  rawTextFromBufferAndName,
  rawTextFromFormBlob,
} from "@/lib/read-uploaded-test";

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
        rawText = await rawTextFromFormBlob(fileEntry);
      } catch (parseErr) {
        const msg =
          parseErr instanceof Error ? parseErr.message : "Could not read file.";
        return Response.json({ error: msg }, { status: 400 });
      }
    } else if (typeof pasted === "string") {
      pdfDocumentTitle = PDF_APP_DOCUMENT_TITLE;
      rawText = pasted;
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
        rawText = await rawTextFromBufferAndName(buffer, pdfName);
      } catch (parseErr) {
        const msg =
          parseErr instanceof Error ? parseErr.message : "Could not read PDF.";
        return Response.json({ error: msg }, { status: 400 });
      }
    } else if (typeof body.text === "string") {
      pdfDocumentTitle = PDF_APP_DOCUMENT_TITLE;
      rawText = body.text;
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
  if (trimmed.length === 0) {
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

  const promptText = `The user submitted the following test material. Parse ONLY genuine multiple-choice questions (stem + labeled options). Ignore all non-MCQ content (instructions, cover pages, keys without stems, essays, etc.). Do not invent questions from non-MCQ text.

For each included MCQ, evaluate it fully and populate the structured result. Review ALL such MCQs; do not ask follow-up questions.

For EVERY question, write correctAnswerLabel and explanation in the SAME language as that question (Gujarati questions → fully Gujarati; Hindi → Hindi; English → English). Never switch explanations to English for non-English questions.

---BEGIN TEST---
${trimmed}
---END TEST---`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writeJsonLine = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        const modelsAttempted: string[] = [];
        let output: McqEvaluationResult | null = null;
        let modelUsed = modelChain[0] ?? "gemini-2.5-flash";
        let lastErr: unknown;

        for (let i = 0; i < modelChain.length; i++) {
          const modelId = modelChain[i];
          modelsAttempted.push(modelId);
          try {
            const result = streamText({
              model: google(modelId),
              system: MCQ_SYSTEM_PROMPT,
              prompt: promptText,
              output: Output.object({
                schema: mcqEvaluationResultSchema,
                name: "McqEvaluationResult",
                description:
                  "Complete structured MCQ evaluation for the supplied test",
              }),
              maxOutputTokens: MAX_MCQ_OUTPUT_TOKENS,
              temperature: 0.2,
            });

            for await (const partial of result.partialOutputStream) {
              writeJsonLine({ type: "partial", data: partial });
            }

            const nextOutput = await result.output;
            output = nextOutput;
            modelUsed = modelId;
            break;
          } catch (err) {
            lastErr = err;
            const hasMore = i < modelChain.length - 1;
            if (shouldTryAlternateGeminiModel(err) && hasMore) {
              writeJsonLine({
                type: "status",
                message: "Switching to a fallback model…",
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
        const pdfBytes = await buildMcqPdfBuffer({
          documentTitle: pdfDocumentTitle,
          generatedAt,
          result: resultForClient,
        });
        const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

        writeJsonLine({
          type: "complete",
          result: resultForClient,
          pdfBase64,
          pdfFileName: `cognitive-mcq-analysis-${Date.now()}.pdf`,
          meta: {
            title: pdfDocumentTitle ?? PDF_APP_DOCUMENT_TITLE,
            generatedAt,
            model: modelUsed,
            modelsAttempted,
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
