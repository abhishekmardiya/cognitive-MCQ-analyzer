import { APICallError } from "@ai-sdk/provider";
import { GEMINI_TEXT_MODEL_CHOICES } from "@/lib/gemini-text-model-catalog";

const BASE_ALLOWED_IDS = new Set(
  GEMINI_TEXT_MODEL_CHOICES.map(({ id }) => {
    return id;
  })
);

function parseCommaList(raw: string | undefined): string[] {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [];
  }
  return raw
    .split(",")
    .map((s) => {
      return s.trim();
    })
    .filter((s) => {
      return s.length > 0;
    });
}

function extraAllowedIdsFromEnv(): Set<string> {
  const extra = parseCommaList(process.env.GEMINI_EXTRA_MODEL_IDS);
  return new Set(extra);
}

export function isAllowedGeminiTextModelId(id: string): boolean {
  if (id.length === 0 || id.length > 120) {
    return false;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    return false;
  }
  if (BASE_ALLOWED_IDS.has(id)) {
    return true;
  }
  return extraAllowedIdsFromEnv().has(id);
}

/** Default order when one model hits quota (Flash first, then Pro, previews, Gemma). */
export const DEFAULT_MODEL_FALLBACK_IDS: readonly string[] = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-pro",
  "gemini-pro-latest",
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-2.5-flash-lite-preview-09-2025",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite-001",
  "gemma-3-27b-it",
  "gemma-3-12b-it",
  "gemma-3-4b-it",
  "gemma-3n-e4b-it",
  "gemma-3n-e2b-it",
  "gemma-3-1b-it",
];

function dedupeChain(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!isAllowedGeminiTextModelId(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Selected model first, then built-in fallback order on quota / rate limits. */
export function buildGeminiModelChain(preferredModel: string | null): string[] {
  const base = dedupeChain([...DEFAULT_MODEL_FALLBACK_IDS]);
  const preferred =
    preferredModel !== null &&
    preferredModel.length > 0 &&
    isAllowedGeminiTextModelId(preferredModel)
      ? preferredModel
      : null;
  if (preferred !== null) {
    return dedupeChain([preferred, ...base]);
  }
  return base;
}

export function shouldTryAlternateGeminiModel(error: unknown): boolean {
  let current: unknown = error;
  for (let d = 0; d < 12 && current !== null && current !== undefined; d++) {
    if (APICallError.isInstance(current)) {
      const { statusCode } = current;
      if (statusCode === 429 || statusCode === 503) {
        return true;
      }
      const body = (current.responseBody ?? "").toLowerCase();
      if (
        body.includes("resource_exhausted") ||
        body.includes("quota") ||
        body.includes("rate_limit") ||
        body.includes("rate limit") ||
        body.includes("too_many_requests")
      ) {
        return true;
      }
    }
    if (current instanceof Error) {
      const m = current.message.toLowerCase();
      if (
        m.includes("resource_exhausted") ||
        m.includes("quota") ||
        m.includes("rate limit") ||
        m.includes("429")
      ) {
        return true;
      }
    }
    if (current !== null && typeof current === "object" && "cause" in current) {
      current = (current as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return false;
}

export function resolvePreferredGeminiModel(
  fromClient: string | null
): string | null {
  if (
    fromClient !== null &&
    fromClient.length > 0 &&
    isAllowedGeminiTextModelId(fromClient)
  ) {
    return fromClient;
  }
  const fromEnv = process.env.GEMINI_MODEL;
  if (
    typeof fromEnv === "string" &&
    fromEnv.length > 0 &&
    isAllowedGeminiTextModelId(fromEnv)
  ) {
    return fromEnv;
  }
  return null;
}
