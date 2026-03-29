import { z } from "zod";

export const mcqOptionSchema = z.object({
  label: z.string().describe("Option label, e.g. A, B, C, D"),
  text: z.string().describe("Full option text"),
});

export const mcqEvaluationSchema = z.object({
  index: z
    .number()
    .int()
    .min(0)
    .describe("Zero-based position of the question in the supplied test"),
  questionText: z
    .string()
    .describe(
      "Verbatim question stem as shown in the source; when a PDF was provided, transcribe from the PDF (correct script), not from a broken text extract",
    ),
  options: z
    .array(mcqOptionSchema)
    .describe(
      "All choices; option text must match the PDF when applicable, not mojibake",
    ),
  correctAnswerLabel: z
    .string()
    .describe(
      "Label of the correct option (must match one of the option labels)",
    ),
  explanation: z
    .string()
    .max(560)
    .describe(
      "Short explanation (target under ~350 Unicode chars, hard max 560): why the correct option is right; one line only (no newline); never use ASCII double-quote (U+0022) inside this string. Must be a fully closed JSON string or the whole response fails.",
    ),
});

export const mcqEvaluationResultSchema = z.object({
  inputStatus: z
    .enum(["complete", "incomplete"])
    .describe("Whether the input contained a full test"),
  inputIncompleteMessage: z
    .string()
    .optional()
    .describe("When incomplete, the mandated incomplete-input message"),
  evaluations: z
    .array(mcqEvaluationSchema)
    .describe("One entry per MCQ reviewed"),
});

export type McqOption = z.infer<typeof mcqOptionSchema>;
export type McqEvaluation = z.infer<typeof mcqEvaluationSchema>;
export type McqEvaluationResult = z.infer<typeof mcqEvaluationResultSchema>;

export const mcqPdfPayloadSchema = z.object({
  title: z.string().optional(),
  generatedAt: z.string().optional(),
  result: mcqEvaluationResultSchema,
});

export type McqPdfPayload = z.infer<typeof mcqPdfPayloadSchema>;
