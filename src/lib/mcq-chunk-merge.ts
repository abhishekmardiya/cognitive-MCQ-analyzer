import type { McqEvaluation, McqEvaluationResult } from "@/lib/mcq-schemas";
import { normalizeMcqDedupeKey } from "@/lib/mcq-test-chunking";

export function mergeMcqEvaluationChunkResults(
  parts: McqEvaluationResult[],
): McqEvaluationResult {
  const seen = new Set<string>();
  const evaluations: McqEvaluation[] = [];
  let inputStatus: "complete" | "incomplete" = "complete";

  for (const p of parts) {
    if (p.inputStatus === "incomplete") {
      inputStatus = "incomplete";
    }
    for (const e of p.evaluations) {
      const key = normalizeMcqDedupeKey(e.questionText);
      if (key.length >= 8 && seen.has(key)) {
        continue;
      }
      if (key.length >= 8) {
        seen.add(key);
      }
      evaluations.push({
        ...e,
        index: evaluations.length,
      });
    }
  }

  const withMessage = parts.find((p) => {
    return p.inputIncompleteMessage !== undefined;
  });

  return {
    inputStatus,
    ...(withMessage?.inputIncompleteMessage !== undefined
      ? { inputIncompleteMessage: withMessage.inputIncompleteMessage }
      : {}),
    evaluations,
  };
}
