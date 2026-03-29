import { AISDKError, APICallError } from "@ai-sdk/provider";
import { NoObjectGeneratedError, NoOutputGeneratedError } from "ai";

const MAX_RAW_BODY_IN_MESSAGE = 1800;
const MAX_MODEL_TEXT_SNIPPET = 500;

function tryGoogleApiMessage(responseBody: string): string | null {
  try {
    const parsed = JSON.parse(responseBody) as {
      error?: { message?: string; status?: string; code?: number };
    };
    const e = parsed.error;
    if (e === undefined || typeof e.message !== "string") {
      return null;
    }
    const bits: string[] = [e.message];
    if (typeof e.status === "string" && e.status.length > 0) {
      bits.push(`[${e.status}]`);
    }
    if (typeof e.code === "number") {
      bits.push(`(code ${e.code})`);
    }
    return bits.join(" ");
  } catch {
    return null;
  }
}

function appendCauseLines(err: unknown, lines: string[], depth: number): void {
  if (depth > 8 || err === null || err === undefined) {
    return;
  }

  if (APICallError.isInstance(err)) {
    lines.push(err.message);
    if (err.statusCode !== undefined) {
      lines.push(`HTTP ${String(err.statusCode)}`);
    }
    if (typeof err.responseBody === "string" && err.responseBody.length > 0) {
      const googleMsg = tryGoogleApiMessage(err.responseBody);
      if (googleMsg !== null) {
        lines.push(googleMsg);
      } else if (err.responseBody.length <= MAX_RAW_BODY_IN_MESSAGE) {
        lines.push(err.responseBody.trim());
      } else {
        lines.push(
          `${err.responseBody.slice(0, MAX_RAW_BODY_IN_MESSAGE).trim()}…`
        );
      }
    }
    appendCauseLines(err.cause, lines, depth + 1);
    return;
  }

  if (NoObjectGeneratedError.isInstance(err)) {
    lines.push(err.message);
    if (err.finishReason !== undefined) {
      lines.push(`Finish reason: ${err.finishReason}`);
      if (err.finishReason === "length") {
        lines.push(
          "The model hit its output token limit before finishing the JSON. Try fewer questions per run, or ensure the deployment uses a high maxOutputTokens."
        );
      }
    }
    if (
      typeof err.text === "string" &&
      err.text.length > 0 &&
      err.text.length < 50_000
    ) {
      const t =
        err.text.length > MAX_MODEL_TEXT_SNIPPET
          ? `${err.text.slice(0, MAX_MODEL_TEXT_SNIPPET)}…`
          : err.text;
      lines.push(`Partial model output: ${t}`);
    }
    appendCauseLines(err.cause, lines, depth + 1);
    return;
  }

  if (NoOutputGeneratedError.isInstance(err)) {
    lines.push(err.message);
    appendCauseLines(err.cause, lines, depth + 1);
    return;
  }

  if (AISDKError.isInstance(err)) {
    lines.push(`${err.name}: ${err.message}`);
    appendCauseLines(err.cause, lines, depth + 1);
    return;
  }

  if (err instanceof Error) {
    lines.push(err.message);
    appendCauseLines(err.cause, lines, depth + 1);
  }
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.length === 0 || seen.has(t)) {
      continue;
    }
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function formatEvaluateErrorMessage(err: unknown): string {
  const lines: string[] = [];
  appendCauseLines(err, lines, 0);
  const cleaned = dedupeLines(lines);
  if (cleaned.length === 0) {
    return "Evaluation failed.";
  }
  return cleaned.join(" ");
}

export function evaluateErrorHttpStatus(err: unknown): number {
  if (APICallError.isInstance(err)) {
    const c = err.statusCode;
    if (c === 429) {
      return 429;
    }
    if (c === 403) {
      return 403;
    }
    if (c === 401) {
      return 401;
    }
    if (c !== undefined && c >= 400 && c < 500) {
      return 502;
    }
  }
  let current: unknown = err;
  for (let d = 0; d < 10 && current !== undefined; d++) {
    if (APICallError.isInstance(current)) {
      const c = current.statusCode;
      if (c === 429) {
        return 429;
      }
      if (c === 403) {
        return 403;
      }
      if (c === 401) {
        return 401;
      }
    }
    if (current !== null && typeof current === "object" && "cause" in current) {
      current = (current as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return 502;
}
