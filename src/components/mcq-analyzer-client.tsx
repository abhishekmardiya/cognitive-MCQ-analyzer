"use client";

import type { DeepPartial } from "ai";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  formatCorrectAnswerWithOptionText,
  stripLeadingQuestionNumberFromStem,
} from "@/lib/format-mcq-display";
import { formatGeneratedTimestampIst } from "@/lib/format-timestamp-ist";
import {
  inputStatusBadgeClasses,
  inputStatusLabel,
  sortEvaluations,
} from "@/lib/mcq-eval-display";
import type { EvaluateSuccess } from "@/lib/mcq-evaluate-success";
import {
  addMcqHistorySession,
  deleteMcqHistorySession,
  deriveMcqHistorySourceLabel,
  isMcqHistoryIdbAvailable,
  listMcqHistorySessions,
  type McqHistorySession,
} from "@/lib/mcq-history-idb";
import type { McqEvaluation, McqEvaluationResult } from "@/lib/mcq-schemas";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/upload-limits";

type EvaluateErrorBody = {
  error: string;
};

type NdjsonEvent =
  | { type: "partial"; data: DeepPartial<McqEvaluationResult> }
  | { type: "status"; message: string }
  | {
      type: "complete";
      result: McqEvaluationResult;
      pdfBase64: string;
      pdfFileName: string;
      meta: EvaluateSuccess["meta"];
    }
  | { type: "error"; error: string };

function sortPartialEvaluations(
  list: (DeepPartial<McqEvaluation> | undefined)[] | undefined,
): DeepPartial<McqEvaluation>[] {
  if (!Array.isArray(list)) {
    return [];
  }
  const defined = list.filter(
    (x): x is DeepPartial<McqEvaluation> => x !== undefined,
  );
  return [...defined].sort((a, b) => {
    return (Number(a.index) || 0) - (Number(b.index) || 0);
  });
}

function downloadPdfFromBase64(base64: string, fileName: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}

function isPdfFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return true;
  }
  if (file.type === "application/pdf") {
    return true;
  }
  return false;
}

const PAGE_SCROLL_BOTTOM_THRESHOLD_PX = 80;

function getPageScrollMetrics(): {
  scrollTop: number;
  viewport: number;
  scrollHeight: number;
} {
  const de = document.documentElement;
  const body = document.body;
  const scrollTop = window.scrollY;
  const viewport = window.innerHeight;
  const scrollHeight = Math.max(de.scrollHeight, body ? body.scrollHeight : 0);
  return { scrollTop, viewport, scrollHeight };
}

function isPageNearBottom(thresholdPx: number): boolean {
  const { scrollTop, viewport, scrollHeight } = getPageScrollMetrics();
  return scrollHeight - scrollTop - viewport <= thresholdPx;
}

function blobToBase64Payload(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== "string") {
        reject(new Error("Could not read file."));
        return;
      }
      const i = r.indexOf(",");
      resolve(i >= 0 ? r.slice(i + 1) : r);
    };
    reader.onerror = () => {
      reject(new Error("Could not read file."));
    };
    reader.readAsDataURL(blob);
  });
}

export function McqAnalyzerClient() {
  const [testText, setTestText] = useState("");
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<EvaluateSuccess | null>(null);
  const [partialResult, setPartialResult] =
    useState<DeepPartial<McqEvaluationResult> | null>(null);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<McqHistorySession[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPdfNotice, setHistoryPdfNotice] = useState<string | null>(null);
  const [historyDeleteTarget, setHistoryDeleteTarget] =
    useState<McqHistorySession | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const answersSectionRef = useRef<HTMLElement>(null);
  const stickToBottomRef = useRef(true);
  const suppressScrollHandlerRef = useRef(false);
  const hadPartialThisRunRef = useRef(false);

  const refreshHistory = useCallback(async () => {
    if (!isMcqHistoryIdbAvailable()) {
      return;
    }
    try {
      const list = await listMcqHistorySessions();
      setHistoryItems(list);
      setHistoryError(null);
    } catch {
      setHistoryError("Could not load review history from this browser.");
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const persistSuccessToHistory = useCallback(
    async (ok: EvaluateSuccess) => {
      if (!isMcqHistoryIdbAvailable()) {
        return;
      }
      const sourceLabel = deriveMcqHistorySourceLabel({
        pdfFileName: pendingPdfFile?.name ?? null,
        pastedText: testText,
      });
      try {
        const { pdfOmitted } = await addMcqHistorySession({
          sourceLabel,
          success: ok,
        });
        if (pdfOmitted) {
          setHistoryPdfNotice(
            "This run was saved without the PDF file — storage is full. Download the report now if you still need it.",
          );
        } else {
          setHistoryPdfNotice(null);
        }
        await refreshHistory();
      } catch {
        setHistoryError("Could not save this review to browser history.");
      }
    },
    [pendingPdfFile, testText, refreshHistory],
  );

  const openHistorySession = useCallback((session: McqHistorySession) => {
    setError(null);
    setPartialResult(null);
    setStreamStatus(null);
    stickToBottomRef.current = false;
    hadPartialThisRunRef.current = false;
    setSuccess(session.success);
    if (session.pdfOmitted === true) {
      setHistoryPdfNotice(
        "This saved session has no PDF — only questions and explanations are stored.",
      );
    } else {
      setHistoryPdfNotice(null);
    }
  }, []);

  const removeHistorySession = useCallback(
    async (id: string) => {
      try {
        await deleteMcqHistorySession(id);
        setHistoryError(null);
        await refreshHistory();
      } catch {
        setHistoryError("Could not delete that history entry.");
      }
    },
    [refreshHistory],
  );

  useEffect(() => {
    if (historyDeleteTarget === null) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setHistoryDeleteTarget(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [historyDeleteTarget]);

  const onSubmit = useCallback(async () => {
    setError(null);
    setSuccess(null);
    setPartialResult(null);
    setStreamStatus(null);
    setHistoryPdfNotice(null);
    const trimmed = testText.trim();
    if (pendingPdfFile === null && trimmed.length === 0) {
      setError("Paste your test or upload a PDF before running the review.");
      return;
    }
    if (pendingPdfFile !== null && pendingPdfFile.size > MAX_UPLOAD_BYTES) {
      setError(`PDF must be under ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    setLoading(true);
    stickToBottomRef.current = true;
    hadPartialThisRunRef.current = false;
    try {
      let response: Response;
      if (pendingPdfFile !== null) {
        const pdfBase64 = await blobToBase64Payload(pendingPdfFile);
        response = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pdfBase64,
            pdfFileName: pendingPdfFile.name,
          }),
        });
      } else {
        response = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed }),
        });
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = (await response.json()) as
          | EvaluateSuccess
          | EvaluateErrorBody;
        if (!response.ok) {
          const errBody = data as EvaluateErrorBody;
          setError(errBody.error || "Request failed.");
          return;
        }
        const ok = data as EvaluateSuccess;
        setSuccess(ok);
        void persistSuccessToHistory(ok);
        return;
      }

      if (!response.ok) {
        setError("Request failed.");
        return;
      }

      const body = response.body;
      if (body === null) {
        setError("Empty response from server.");
        return;
      }

      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim().length === 0) {
            continue;
          }
          let evt: NdjsonEvent;
          try {
            evt = JSON.parse(line) as NdjsonEvent;
          } catch {
            streamError = "Could not parse server stream.";
            break;
          }
          if (evt.type === "partial") {
            hadPartialThisRunRef.current = true;
            setPartialResult(evt.data);
            setStreamStatus(null);
          } else if (evt.type === "status") {
            setStreamStatus(evt.message);
          } else if (evt.type === "complete") {
            const completed: EvaluateSuccess = {
              result: evt.result,
              pdfBase64: evt.pdfBase64,
              pdfFileName: evt.pdfFileName,
              meta: evt.meta,
            };
            setSuccess(completed);
            void persistSuccessToHistory(completed);
            setPartialResult(null);
            setStreamStatus(null);
          } else if (evt.type === "error") {
            streamError = evt.error;
            setPartialResult(null);
            setStreamStatus(null);
          }
        }
        if (streamError !== null) {
          break;
        }
      }

      if (streamError !== null) {
        setError(streamError);
        setPartialResult(null);
        setStreamStatus(null);
      }
    } catch (submitErr) {
      const msg =
        submitErr instanceof Error ? submitErr.message : "Request failed.";
      setError(
        msg.includes("Could not read")
          ? msg
          : "Network error. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [pendingPdfFile, testText, persistSuccessToHistory]);

  const onFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setError(null);
    setSuccess(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`PDF must be under ${MAX_UPLOAD_MB} MB.`);
      event.target.value = "";
      return;
    }
    if (!isPdfFile(file)) {
      setError("Only PDF files are supported.");
      event.target.value = "";
      return;
    }
    setPendingPdfFile(file);
    setTestText("");
    event.target.value = "";
  }, []);

  const hasMcqInput = pendingPdfFile !== null || testText.trim().length > 0;
  const showResults = success !== null || partialResult !== null;
  const streamingIncomplete = partialResult !== null && success === null;
  const evaluationsForList: Array<McqEvaluation | DeepPartial<McqEvaluation>> =
    success !== null
      ? sortEvaluations(success.result.evaluations)
      : sortPartialEvaluations(partialResult?.evaluations);
  const summaryResult = success?.result ?? partialResult;
  const inputStatusLive = summaryResult?.inputStatus;

  useLayoutEffect(() => {
    if (!streamingIncomplete || partialResult === null) {
      return;
    }
    if (!stickToBottomRef.current) {
      return;
    }
    suppressScrollHandlerRef.current = true;
    window.scrollTo({
      top: getPageScrollMetrics().scrollHeight,
      behavior: "auto",
    });
    requestAnimationFrame(() => {
      suppressScrollHandlerRef.current = false;
    });
  }, [partialResult, streamingIncomplete]);

  useLayoutEffect(() => {
    if (success === null || partialResult !== null) {
      return;
    }
    if (hadPartialThisRunRef.current) {
      if (!stickToBottomRef.current) {
        return;
      }
      suppressScrollHandlerRef.current = true;
      window.scrollTo({
        top: getPageScrollMetrics().scrollHeight,
        behavior: "auto",
      });
      requestAnimationFrame(() => {
        suppressScrollHandlerRef.current = false;
      });
      return;
    }
    const id = requestAnimationFrame(() => {
      answersSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, [success, partialResult]);

  useEffect(() => {
    if (!streamingIncomplete) {
      return;
    }
    const onScroll = () => {
      if (suppressScrollHandlerRef.current) {
        return;
      }
      stickToBottomRef.current = isPageNearBottom(
        PAGE_SCROLL_BOTTOM_THRESHOLD_PX,
      );
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [streamingIncomplete]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-8 lg:flex-row lg:items-start lg:gap-8">
      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex w-full min-w-0 flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-950/50 sm:flex-row sm:items-stretch sm:gap-4 sm:p-3 sm:pr-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={onFileChange}
              className="sr-only"
              aria-label="Upload a PDF file"
            />
            <button
              type="button"
              onClick={() => {
                fileInputRef.current?.click();
              }}
              className="inline-flex h-11 w-full min-h-11 shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:active:bg-emerald-700 sm:h-auto sm:w-auto sm:min-h-10 sm:self-center sm:py-2 sm:pl-4 sm:pr-4"
            >
              Choose file
            </button>
            <div className="flex min-h-10 min-w-0 flex-1 items-center border-t border-zinc-200 pt-3 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0 dark:border-zinc-700">
              {pendingPdfFile ? (
                <p className="flex w-full min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-300">
                    PDF
                  </span>
                  <span className="min-w-0 max-w-full wrap-break-word font-medium text-zinc-900 sm:truncate dark:text-zinc-100">
                    {pendingPdfFile.name}
                  </span>
                </p>
              ) : (
                <p className="text-pretty text-xs leading-relaxed text-zinc-500 sm:text-sm dark:text-zinc-400">
                  No file selected · PDF only (max {MAX_UPLOAD_MB} MB)
                </p>
              )}
            </div>
          </div>
          <label
            className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
            htmlFor="mcq-text"
          >
            Questions and options
          </label>
          <textarea
            id="mcq-text"
            value={testText}
            onChange={(e) => {
              setPendingPdfFile(null);
              setTestText(e.target.value);
            }}
            rows={12}
            placeholder="Paste full exam text, or upload a PDF."
            className="field-sizing-content max-h-[min(28rem,60vh)] min-h-44 w-full min-w-0 resize-y overflow-x-auto overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 font-mono text-sm leading-relaxed text-zinc-900 outline-none ring-emerald-600/0 transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/15 sm:min-h-55 sm:p-4 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500"
          />
          <p className="text-pretty text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            The model is limited to its knowledge cutoff: it cannot see events
            or facts newer than that, and it does not browse the web or supply
            live updates. Your pasted or uploaded text is the only extra context
            it gets—add anything recent there if the review should rely on it.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => {
                void onSubmit();
              }}
              disabled={loading || !hasMcqInput}
              title={
                hasMcqInput
                  ? undefined
                  : "Paste your test or upload a PDF first."
              }
              className="inline-flex h-11 min-h-11 w-full items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 sm:h-auto sm:w-auto sm:min-h-10 sm:py-2.5 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:active:bg-emerald-700"
            >
              {loading
                ? partialResult !== null
                  ? "Streaming results…"
                  : "Reviewing…"
                : "Submit"}
            </button>
          </div>
          {streamStatus ? (
            <output className="block text-sm text-zinc-600 dark:text-zinc-400">
              {streamStatus}
            </output>
          ) : null}
          {error ? (
            <p
              className="whitespace-pre-wrap wrap-break-word rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {historyPdfNotice ? (
            <output className="text-pretty block rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              {historyPdfNotice}
            </output>
          ) : null}
        </section>

        {showResults ? (
          <section
            ref={answersSectionRef}
            id="mcq-results"
            className="flex min-w-0 scroll-mt-6 flex-col gap-6"
            aria-busy={streamingIncomplete}
            aria-live={streamingIncomplete ? "polite" : undefined}
          >
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="flex flex-col gap-3 border-b border-zinc-200 bg-linear-to-r from-emerald-50/90 to-zinc-50 px-4 py-4 dark:border-zinc-800 dark:from-emerald-950/35 dark:to-zinc-950/80 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight text-zinc-900 sm:text-lg dark:text-zinc-50">
                    Summary
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {streamingIncomplete
                      ? "Partial results appear as the model generates them."
                      : "Review run metadata"}
                  </p>
                </div>
                <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
                  <p className="inline-flex w-full max-w-full items-center justify-center rounded-full border border-emerald-200/80 bg-white/90 px-3 py-2 text-center text-xs font-semibold text-emerald-800 shadow-sm sm:w-fit sm:justify-center sm:py-1 dark:border-emerald-800/60 dark:bg-zinc-900/90 dark:text-emerald-300">
                    {evaluationsForList.length}{" "}
                    {evaluationsForList.length === 1 ? "question" : "questions"}{" "}
                    {streamingIncomplete ? "so far" : "reviewed"}
                  </p>
                  {success ? (
                    <button
                      type="button"
                      onClick={() => {
                        downloadPdfFromBase64(
                          success.pdfBase64,
                          success.pdfFileName,
                        );
                      }}
                      disabled={success.pdfBase64.length === 0}
                      title={
                        success.pdfBase64.length > 0
                          ? undefined
                          : success.meta.pdfGenerationError !== undefined &&
                              success.meta.pdfGenerationError.length > 0
                            ? success.meta.pdfGenerationError
                            : "PDF was not generated for this session."
                      }
                      className="inline-flex h-11 min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-md shadow-emerald-900/25 ring-1 ring-emerald-400/40 transition hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-900/30 active:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:h-auto sm:w-auto sm:min-h-10 sm:py-2.5 dark:bg-emerald-500 dark:ring-emerald-300/30 dark:hover:bg-emerald-400 dark:active:bg-emerald-600"
                    >
                      <svg
                        className="size-4 shrink-0 opacity-95"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <title>Download</title>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" x2="12" y1="15" y2="3" />
                      </svg>
                      Download PDF
                    </button>
                  ) : null}
                </div>
                {success !== null && success.pdfBase64.length === 0 ? (
                  <output
                    className="mt-3 border-t border-zinc-200 pt-3 text-pretty text-xs leading-relaxed text-amber-950 dark:border-zinc-700 dark:text-amber-100"
                    aria-live="polite"
                  >
                    <span className="font-semibold">
                      PDF report unavailable.
                    </span>{" "}
                    {success.meta.pdfGenerationError !== undefined &&
                    success.meta.pdfGenerationError.length > 0
                      ? success.meta.pdfGenerationError
                      : "The downloadable file was not produced for this run."}
                  </output>
                ) : null}
              </div>
              <dl className="grid min-w-0 gap-3 p-4 sm:grid-cols-3 sm:gap-4 sm:p-5">
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Model
                  </dt>
                  <dd className="mt-1.5 break-all font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {success !== null ? success.meta.model : "Streaming…"}
                  </dd>
                  {success !== null &&
                  success.meta.modelsAttempted.length > 1 ? (
                    <dd className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      Fallback chain: {success.meta.modelsAttempted.join(" → ")}{" "}
                      (earlier models hit quota, rate limits, or overload).
                    </dd>
                  ) : null}
                </div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Generated
                  </dt>
                  <dd className="mt-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {success !== null
                      ? formatGeneratedTimestampIst(success.meta.generatedAt)
                      : "—"}
                  </dd>
                </div>
                <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Input status
                  </dt>
                  <dd className="mt-1.5">
                    {inputStatusLive === "complete" ||
                    inputStatusLive === "incomplete" ? (
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${inputStatusBadgeClasses(inputStatusLive)}`}
                      >
                        {inputStatusLabel(inputStatusLive)}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-zinc-200/90 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                        Streaming…
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
              {typeof summaryResult?.inputIncompleteMessage === "string" &&
              summaryResult.inputIncompleteMessage.length > 0 ? (
                <div className="border-t border-zinc-200 bg-amber-50/80 px-4 py-4 sm:px-5 dark:border-zinc-800 dark:bg-amber-950/25">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                    Note
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-amber-950 dark:text-amber-100">
                    {summaryResult.inputIncompleteMessage}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-8">
              {evaluationsForList.map((ev, idx) => {
                const qIndex = typeof ev.index === "number" ? ev.index : idx;
                const rawStem =
                  typeof ev.questionText === "string"
                    ? ev.questionText
                    : "Receiving question text…";
                const stem = stripLeadingQuestionNumberFromStem(rawStem);
                const stemKey =
                  typeof ev.questionText === "string"
                    ? ev.questionText.slice(0, 24)
                    : `p-${idx}`;
                const rawOptions = Array.isArray(ev.options) ? ev.options : [];
                const options = rawOptions.filter(
                  (o): o is NonNullable<(typeof rawOptions)[number]> =>
                    o != null,
                );
                const correctLabel =
                  typeof ev.correctAnswerLabel === "string"
                    ? ev.correctAnswerLabel
                    : "";
                const correctLine =
                  correctLabel.length > 0
                    ? formatCorrectAnswerWithOptionText(
                        options.map((o) => {
                          return {
                            label: typeof o.label === "string" ? o.label : "",
                            text: typeof o.text === "string" ? o.text : "",
                          };
                        }),
                        correctLabel,
                      )
                    : "…";
                const expl =
                  typeof ev.explanation === "string"
                    ? ev.explanation
                    : "Receiving explanation…";
                return (
                  <article
                    key={`${qIndex}-${stemKey}`}
                    className={`min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/40 ${streamingIncomplete ? "ring-1 ring-emerald-500/15" : ""}`}
                  >
                    <h3 className="text-sm font-semibold text-emerald-800 sm:text-base dark:text-emerald-300">
                      Question {qIndex + 1}
                    </h3>
                    <p className="mt-3 whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                      {stem}
                    </p>
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Options
                      </p>
                      <ul className="mt-2 flex flex-col gap-2">
                        {options.map((opt) => {
                          const label =
                            typeof opt.label === "string" ? opt.label : "?";
                          const text =
                            typeof opt.text === "string"
                              ? opt.text
                              : "Receiving option…";
                          const optKey = `${qIndex}-${label}-${text.slice(0, 48)}`;
                          return (
                            <li
                              key={optKey}
                              className="min-w-0 rounded-lg bg-zinc-50 px-3 py-2 text-sm wrap-break-word dark:bg-zinc-950/60"
                            >
                              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                                {label}.
                              </span>{" "}
                              <span className="text-zinc-800 dark:text-zinc-200">
                                {text}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                      <p className="text-xs font-semibold tracking-wide text-emerald-900 dark:text-emerald-200">
                        Correct answer
                      </p>
                      <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                        {correctLine}
                      </p>
                    </div>
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Explanation
                      </p>
                      <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                        {expl}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      <aside
        className="w-full shrink-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40 lg:sticky lg:top-6 lg:max-h-[min(80vh,40rem)] lg:w-80 lg:overflow-y-auto lg:p-5"
        aria-label="Saved review history"
      >
        <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          History
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          If storage fills up, the oldest review is removed to make room for new
          ones.
        </p>
        {historyError ? (
          <p
            className="mt-3 whitespace-pre-wrap wrap-break-word rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
            role="alert"
          >
            {historyError}
          </p>
        ) : null}
        {!isMcqHistoryIdbAvailable() ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            History is unavailable in this environment.
          </p>
        ) : historyItems.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
            No saved reviews yet.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {historyItems.map((item) => {
              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-950/50"
                >
                  <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    <span className="line-clamp-2 wrap-break-word">
                      {item.sourceLabel}
                    </span>
                  </p>
                  <p className="mt-1 text-[0.65rem] text-zinc-500 dark:text-zinc-400">
                    {formatGeneratedTimestampIst(item.savedAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        openHistorySession(item);
                      }}
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryDeleteTarget(item);
                      }}
                      className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {historyDeleteTarget !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 dark:bg-black/60"
            aria-label="Dismiss"
            onClick={() => {
              setHistoryDeleteTarget(null);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-delete-dialog-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h3
              id="history-delete-dialog-title"
              className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              Delete this saved review?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              <span className="line-clamp-3 wrap-break-word font-medium text-zinc-800 dark:text-zinc-200">
                {historyDeleteTarget.sourceLabel}
              </span>{" "}
              will be removed from history in this browser. You cannot undo
              this.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setHistoryDeleteTarget(null);
                }}
                className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 sm:w-auto dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = historyDeleteTarget.id;
                  void removeHistorySession(id).finally(() => {
                    setHistoryDeleteTarget(null);
                  });
                }}
                className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 sm:w-auto dark:bg-red-600 dark:hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
