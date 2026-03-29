import type { McqEvaluationResult } from "@/lib/mcq-schemas";

/**
 * PDF text extractors often insert spaces between a consonant cluster and a
 * dependent vowel (matra), which breaks Gujarati/Devanagari shaping (e.g. દ્ર + space + ય → દ્ર + ય with dotted circle).
 * Remove those spurious spaces so matras reattach to the preceding cluster.
 */
const INDIC_SPACE_MATRA_PATTERNS: RegExp[] = [
  // Gujarati: base (letter, virama, nukta, digits) then whitespace then matra / bindu
  /([\u0A85-\u0A94\u0A95-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE6-\u0AEF\u0ACD\u0ABC])\s+([\u0ABE-\u0ACC\u0AE2\u0AE3\u0A81\u0A82])/gu,
  // Devanagari
  /([\u0904-\u0914\u0915-\u0939\u093C\u093D\u094D\u0950\u0958-\u0961\u0966-\u096F])\s+([\u093E-\u094C\u0962\u0963\u0900-\u0902])/gu,
  // Bengali
  /([\u0985-\u0994\u0995-\u09B9\u09BC\u09BD\u09CD\u09CE\u09DC\u09DD\u09DF\u09E6-\u09EF])\s+([\u09BE-\u09CC\u09E2\u09E3\u0981\u0982])/gu,
  // Gurmukhi
  /([\u0A05-\u0A14\u0A15-\u0A39\u0A3C\u0A51\u0A5C\u0A66-\u0A6F\u0A4D])\s+([\u0A3E-\u0A4C\u0A01\u0A02\u0A70])/gu,
];

const MAX_PASSES = 16;

export function fixIndicPdfExtractionArtifacts(input: string): string {
  let s = input.normalize("NFC");
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const pattern of INDIC_SPACE_MATRA_PATTERNS) {
      const next = s.replace(pattern, "$1$2");
      if (next !== s) {
        s = next;
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
  return s.normalize("NFC");
}

export function fixIndicInEvaluationResult(
  result: McqEvaluationResult,
): McqEvaluationResult {
  const fix = fixIndicPdfExtractionArtifacts;
  return {
    ...result,
    inputIncompleteMessage:
      result.inputIncompleteMessage !== undefined
        ? fix(result.inputIncompleteMessage)
        : undefined,
    evaluations: result.evaluations.map((ev) => {
      return {
        ...ev,
        questionText: fix(ev.questionText),
        correctAnswerLabel: fix(ev.correctAnswerLabel),
        explanation: fix(ev.explanation),
        options: ev.options.map((opt) => {
          return {
            ...opt,
            text: fix(opt.text),
          };
        }),
      };
    }),
  };
}
