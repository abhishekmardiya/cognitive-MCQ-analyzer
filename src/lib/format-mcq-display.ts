export type McqOptionLike = {
  label: string;
  text: string;
};

/**
 * Strips a leading exam-style index (e.g. "(130) ") so it is not duplicated next to "Question N".
 */
export function stripLeadingQuestionNumberFromStem(stem: string): string {
  let s = stem.replace(/^\uFEFF/, "").trimStart();
  s = s.replace(/^\(\s*\d{1,4}\s*\)\s*/u, "");
  s = s.replace(/^\d{1,4}\s*[.)：:]\s*/u, "");
  s = s.replace(/^[Qq]\s*\.?\s*\d{1,4}\s*[.:)\-–]?\s*/u, "");
  return s.trimStart();
}

function normalizeMcqLabel(s: string): string {
  return s.replace(/\s+/g, "").trim();
}

/**
 * One line: "(C). option text" when the label matches an option; otherwise "(label)." or "—".
 */
export function formatCorrectAnswerWithOptionText(
  options: McqOptionLike[],
  correctAnswerLabel: string,
): string {
  const trimmed = correctAnswerLabel.trim();
  if (trimmed.length === 0) {
    return "—";
  }
  const target = normalizeMcqLabel(trimmed).toLowerCase();
  let matchedLabel = trimmed;
  let optionText: string | null = null;
  for (const o of options) {
    const lab = typeof o.label === "string" ? o.label : "";
    if (normalizeMcqLabel(lab).toLowerCase() === target) {
      matchedLabel = lab.trim();
      const t = typeof o.text === "string" ? o.text.trim() : "";
      optionText = t.length > 0 ? t : null;
      break;
    }
  }
  if (optionText !== null) {
    return `(${matchedLabel}). ${optionText}`;
  }
  return `(${trimmed}).`;
}
