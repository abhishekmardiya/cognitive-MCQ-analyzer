import type { McqEvaluationResult } from "@/lib/mcq-schemas";

export type EvaluateSuccessMeta = {
  title: string;
  generatedAt: string;
  model: string;
  modelsAttempted: string[];
  /** Set when PDF generation failed but structured results succeeded. */
  pdfGenerationError?: string;
};

export type EvaluateSuccess = {
  result: McqEvaluationResult;
  pdfBase64: string;
  pdfFileName: string;
  meta: EvaluateSuccessMeta;
};
