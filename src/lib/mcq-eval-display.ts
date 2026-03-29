import type { McqEvaluation, McqEvaluationResult } from "@/lib/mcq-schemas";

export function sortEvaluations(list: McqEvaluation[]) {
  return [...list].sort((a, b) => {
    return a.index - b.index;
  });
}

export function inputStatusBadgeClasses(
  status: McqEvaluationResult["inputStatus"]
): string {
  switch (status) {
    case "complete":
      return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-600/15 dark:bg-emerald-950/60 dark:text-emerald-200 dark:ring-emerald-500/25";
    case "incomplete":
      return "bg-amber-100 text-amber-950 ring-1 ring-amber-600/20 dark:bg-amber-950/45 dark:text-amber-100 dark:ring-amber-500/30";
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return "";
    }
  }
}

export function inputStatusLabel(
  status: McqEvaluationResult["inputStatus"]
): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "incomplete":
      return "Incomplete";
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return "";
    }
  }
}
