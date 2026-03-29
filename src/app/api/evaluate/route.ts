import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { buildMcqPdfBuffer } from "@/lib/build-mcq-pdf";
import { mcqEvaluationResultSchema } from "@/lib/mcq-schemas";
import { MCQ_SYSTEM_PROMPT } from "@/lib/mcq-system-prompt";
import {
  isNonStringFormDataFile,
  rawTextFromBufferAndName,
  rawTextFromFormBlob,
} from "@/lib/read-uploaded-test";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_INPUT_CHARS = 120_000;

const REPORT_TITLE = "Cognitive MCQ Analyzer — Report";

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

function getModelId(): string {
  const id = process.env.GEMINI_MODEL;
  if (typeof id === "string" && id.length > 0) {
    return id;
  }
  return "gemini-2.5-flash";
}

type JsonEvaluateBody = {
  text?: unknown;
  pdfBase64?: unknown;
  pdfFileName?: unknown;
};

export async function POST(request: Request) {
  const apiKey = resolveGeminiApiKey();
  if (apiKey === null) {
    return Response.json(
      {
        error:
          "Missing API key. Set GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY for the Gemini API.",
      },
      { status: 500 }
    );
  }

  let rawText: string;
  const contentType = request.headers.get("content-type") || "";
  const isMultipart = contentType.toLowerCase().includes("multipart/form-data");

  if (isMultipart) {
    const form = await request.formData();
    const fileEntry = form.get("file");
    const pasted = form.get("text");
    if (isNonStringFormDataFile(fileEntry) && fileEntry.size > 0) {
      try {
        rawText = await rawTextFromFormBlob(fileEntry);
      } catch (parseErr) {
        const msg =
          parseErr instanceof Error ? parseErr.message : "Could not read file.";
        return Response.json({ error: msg }, { status: 400 });
      }
    } else if (typeof pasted === "string") {
      rawText = pasted;
    } else {
      return Response.json(
        {
          error:
            "Multipart requests must include a non-empty file or a text field.",
        },
        { status: 400 }
      );
    }
  } else {
    let body: JsonEvaluateBody;
    try {
      body = (await request.json()) as JsonEvaluateBody;
    } catch {
      return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const pdfB64 = body.pdfBase64;
    if (typeof pdfB64 === "string" && pdfB64.trim().length > 0) {
      let buffer: Buffer;
      try {
        buffer = Buffer.from(pdfB64.trim(), "base64");
      } catch {
        return Response.json(
          { error: "Invalid PDF data (base64 decode failed)." },
          { status: 400 }
        );
      }
      if (buffer.length === 0) {
        return Response.json(
          { error: "PDF data was empty after decoding." },
          { status: 400 }
        );
      }
      const pdfName =
        typeof body.pdfFileName === "string" && body.pdfFileName.length > 0
          ? body.pdfFileName
          : "upload.pdf";
      try {
        rawText = await rawTextFromBufferAndName(buffer, pdfName);
      } catch (parseErr) {
        const msg =
          parseErr instanceof Error ? parseErr.message : "Could not read PDF.";
        return Response.json({ error: msg }, { status: 400 });
      }
    } else if (typeof body.text === "string") {
      rawText = body.text;
    } else {
      return Response.json(
        {
          error:
            'JSON body must include a string "text" field, or "pdfBase64" with an optional "pdfFileName".',
        },
        { status: 400 }
      );
    }
  }

  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return Response.json(
      {
        error:
          "No text found to analyze. For PDFs, try a text-based file (not a scan); for scans, use OCR first or paste the questions.",
      },
      { status: 400 }
    );
  }
  if (trimmed.length > MAX_INPUT_CHARS) {
    return Response.json(
      { error: `Input exceeds the maximum of ${MAX_INPUT_CHARS} characters.` },
      { status: 400 }
    );
  }

  const google = createGoogleGenerativeAI({ apiKey });

  try {
    const { output } = await generateText({
      model: google(getModelId()),
      system: MCQ_SYSTEM_PROMPT,
      prompt: `The user submitted the following MCQ test material. Parse every distinct multiple-choice question, evaluate each one fully, and populate the structured result. Review ALL questions; do not ask follow-up questions.

For EVERY question, write correctAnswerLabel and explanation in the SAME language as that question (Gujarati questions → fully Gujarati; Hindi → Hindi; English → English). Never switch explanations to English for non-English questions.

---BEGIN TEST---
${trimmed}
---END TEST---`,
      output: Output.object({
        schema: mcqEvaluationResultSchema,
        name: "McqEvaluationResult",
        description: "Complete structured MCQ evaluation for the supplied test",
      }),
      maxOutputTokens: 16_384,
      temperature: 0.2,
    });

    const generatedAt = new Date().toISOString();
    const pdfBytes = await buildMcqPdfBuffer({
      title: REPORT_TITLE,
      generatedAt,
      result: output,
    });
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    return Response.json({
      result: output,
      pdfBase64,
      pdfFileName: `cognitive-mcq-analysis-${Date.now()}.pdf`,
      meta: {
        title: REPORT_TITLE,
        generatedAt,
        model: getModelId(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Evaluation failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
