import { APICallError } from "@ai-sdk/provider";
import { NoOutputGeneratedError, RetryError } from "ai";
import { GEMINI_TEXT_MODEL_CHOICES } from "@/lib/gemini-text-model-catalog";

const BASE_ALLOWED_IDS = new Set(
  GEMINI_TEXT_MODEL_CHOICES.map(({ id }) => {
    return id;
  }),
);

const MAX_ERROR_SIGNAL_DEPTH = 16;

function pushErrorSignal(out: string[], value: unknown): void {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    if (value.length > 0) {
      out.push(value);
    }
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return;
  }
  if (value instanceof Error) {
    if (value.message.length > 0) {
      out.push(value.message);
    }
    return;
  }
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      if (s.length > 0 && s !== "{}") {
        out.push(s);
      }
    } catch {
      return;
    }
  }
}

function collectGeminiErrorSignals(
  error: unknown,
  depth: number,
  out: string[],
): void {
  if (depth > MAX_ERROR_SIGNAL_DEPTH || error === null || error === undefined) {
    return;
  }

  if (APICallError.isInstance(error)) {
    pushErrorSignal(out, error.message);
    pushErrorSignal(out, error.responseBody);
    pushErrorSignal(out, error.data);
    if (error.statusCode !== undefined) {
      pushErrorSignal(out, `HTTP_STATUS_${String(error.statusCode)}`);
    }
    collectGeminiErrorSignals(error.cause, depth + 1, out);
    return;
  }

  if (RetryError.isInstance(error)) {
    pushErrorSignal(out, error.message);
    for (const e of error.errors) {
      collectGeminiErrorSignals(e, depth + 1, out);
    }
    return;
  }

  if (error instanceof Error) {
    pushErrorSignal(out, error.message);
    collectGeminiErrorSignals(error.cause, depth + 1, out);
    return;
  }

  if (typeof error === "object") {
    const o = error as Record<string, unknown>;
    pushErrorSignal(out, o.message);
    pushErrorSignal(out, o.responseBody);
    pushErrorSignal(out, o.errorText);
    pushErrorSignal(out, o.value);
    if ("cause" in o) {
      collectGeminiErrorSignals(o.cause, depth + 1, out);
    }
  }
}

/** True when concatenated API / SDK text looks like Gemini quota or rate limiting. */
function textSuggestsGeminiQuotaOrRateLimit(lower: string): boolean {
  if (lower.length === 0) {
    return false;
  }
  const phrases = [
    "resource_exhausted",
    "resource exhausted",
    "quota exceeded",
    "exceeded your current quota",
    "exceeded your quota",
    "quota exceeded for metric",
    "generate_content_free_tier",
    "rate_limit",
    "rate limit",
    "too_many_requests",
    "too many requests",
    "please retry in ",
  ];
  for (const p of phrases) {
    if (lower.includes(p)) {
      return true;
    }
  }
  if (lower.includes("quota")) {
    return true;
  }
  return false;
}

function hasRetryableHttpStatusInChain(error: unknown): boolean {
  const stack: unknown[] = [error];
  let seen = 0;
  while (stack.length > 0 && seen <= 48) {
    seen++;
    const current = stack.pop();
    if (current === null || current === undefined) {
      continue;
    }
    if (APICallError.isInstance(current)) {
      const c = current.statusCode;
      if (c === 402 || c === 429 || c === 503) {
        return true;
      }
    }
    if (RetryError.isInstance(current)) {
      for (const e of current.errors) {
        stack.push(e);
      }
      continue;
    }
    if (current instanceof Error && current.cause !== undefined) {
      stack.push(current.cause);
      continue;
    }
    if (current !== null && typeof current === "object" && "cause" in current) {
      const next = (current as { cause?: unknown }).cause;
      if (next !== undefined) {
        stack.push(next);
      }
    }
  }
  return false;
}

export function isAllowedGeminiTextModelId(id: string): boolean {
  if (id.length === 0 || id.length > 120) {
    return false;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    return false;
  }
  return BASE_ALLOWED_IDS.has(id);
}

/**
 * Fallback when the preferred model hits quota or rate limits.
 * Order matches the catalog: newer / higher-RPD Flash-Lite first, then 2.5 Flash-Lite,
 * then 2.5 Flash, then Gemma (separate TPM/RPD bucket; larger Gemma first for quality).
 * @see https://ai.google.dev/gemini-api/docs/models
 */
export const DEFAULT_MODEL_FALLBACK_IDS: readonly string[] = [
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash-lite-preview-09-2025",
  "gemini-2.5-flash",
  "gemma-3-27b-it",
  "gemma-3-12b-it",
  "gemma-3-4b-it",
  "gemma-3-1b-it",
  "gemma-3n-e4b-it",
  "gemma-3n-e2b-it",
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

/**
 * Whether to try the next model in the chain. Collects messages, response bodies,
 * JSON `data`, and nested causes so Gemini quota errors embedded in SDK wrappers still match.
 */
export function shouldTryAlternateGeminiModel(error: unknown): boolean {
  if (NoOutputGeneratedError.isInstance(error)) {
    const hint = error.message.toLowerCase();
    if (hint.includes("check the stream for errors")) {
      return true;
    }
  }

  const signals: string[] = [];
  collectGeminiErrorSignals(error, 0, signals);
  const blob = signals.join("\n").toLowerCase();
  if (textSuggestsGeminiQuotaOrRateLimit(blob)) {
    return true;
  }
  if (blob.includes("429")) {
    return true;
  }
  if (hasRetryableHttpStatusInChain(error)) {
    return true;
  }
  return false;
}

/** Use in /api/evaluate: stream errors are reported to `onError` while `catch` may only see NoOutputGeneratedError. */
export function shouldTryAlternateGeminiModelWithStreamContext(
  caught: unknown,
  providerStreamError: unknown,
): boolean {
  return (
    shouldTryAlternateGeminiModel(caught) ||
    shouldTryAlternateGeminiModel(providerStreamError)
  );
}

export function resolvePreferredGeminiModel(
  fromClient: string | null,
): string | null {
  if (
    fromClient !== null &&
    fromClient.length > 0 &&
    isAllowedGeminiTextModelId(fromClient)
  ) {
    return fromClient;
  }
  const fromEnv = process.env.DEFAULT_GEMINI_MODEL;
  if (
    typeof fromEnv === "string" &&
    fromEnv.length > 0 &&
    isAllowedGeminiTextModelId(fromEnv)
  ) {
    return fromEnv;
  }
  return null;
}
