"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { formatGeneratedTimestampIst } from "@/lib/format-timestamp-ist";
import {
  inputStatusBadgeClasses,
  inputStatusLabel,
  sortEvaluations,
} from "@/lib/mcq-eval-display";
import type { McqEvaluationResult } from "@/lib/mcq-schemas";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/upload-limits";

type EvaluateSuccess = {
  result: McqEvaluationResult;
  pdfBase64: string;
  pdfFileName: string;
  meta: {
    title: string;
    generatedAt: string;
    model: string;
    modelsAttempted: string[];
  };
};

type EvaluateErrorBody = {
  error: string;
};

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
  const [plainTextSourceName, setPlainTextSourceName] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<EvaluateSuccess | null>(null);
  const [filePickerMounted, setFilePickerMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFilePickerMounted(true);
  }, []);

  const onSubmit = useCallback(async () => {
    setError(null);
    setSuccess(null);
    const trimmed = testText.trim();
    if (pendingPdfFile === null && trimmed.length === 0) {
      setError(
        "Paste your test, upload a text file, or upload a PDF before running the review."
      );
      return;
    }
    if (pendingPdfFile !== null && pendingPdfFile.size > MAX_UPLOAD_BYTES) {
      setError(`PDF must be under ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    setLoading(true);
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
    } catch (submitErr) {
      const msg =
        submitErr instanceof Error ? submitErr.message : "Request failed.";
      setError(
        msg.includes("Could not read")
          ? msg
          : "Network error. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, [pendingPdfFile, testText]);

  const onFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      setError(null);
      setSuccess(null);
      if (file.size > MAX_UPLOAD_BYTES) {
        setPlainTextSourceName(null);
        setError(`File must be under ${MAX_UPLOAD_MB} MB.`);
        event.target.value = "";
        return;
      }
      if (isPdfFile(file)) {
        setPendingPdfFile(file);
        setPlainTextSourceName(null);
        setTestText("");
      } else {
        setPendingPdfFile(null);
        try {
          const text = await file.text();
          setPlainTextSourceName(file.name);
          setTestText(text);
        } catch {
          setPlainTextSourceName(null);
          setError("Could not read that file. Try .txt, .md, or .pdf.");
        }
      }
      event.target.value = "";
    },
    []
  );

  const hasMcqInput = pendingPdfFile !== null || testText.trim().length > 0;

  return (
    <>
      <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40">
        {filePickerMounted ? (
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-950/50 sm:flex-row sm:items-center sm:gap-0 sm:p-2 sm:pr-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.pdf,.text,text/plain,text/markdown,application/pdf"
              onChange={onFileChange}
              className="sr-only"
              aria-label="Upload a .txt, .md, or .pdf file"
            />
            <button
              type="button"
              onClick={() => {
                fileInputRef.current?.click();
              }}
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 sm:mr-3 sm:py-2"
            >
              Choose file
            </button>
            <div className="min-h-10 flex flex-1 items-center border-t border-zinc-200 pt-3 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0 dark:border-zinc-700">
              {pendingPdfFile ? (
                <p className="flex w-full min-w-0 flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:gap-2">
                  <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-300">
                    PDF
                  </span>
                  <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {pendingPdfFile.name}
                  </span>
                </p>
              ) : null}
              {!pendingPdfFile && plainTextSourceName ? (
                <p className="flex w-full min-w-0 flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:gap-2">
                  <span className="shrink-0 rounded-md bg-zinc-200/80 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                    Text
                  </span>
                  <span className="truncate text-zinc-700 dark:text-zinc-300">
                    Loaded from{" "}
                    <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">
                      {plainTextSourceName}
                    </span>
                  </span>
                </p>
              ) : null}
              {!pendingPdfFile && !plainTextSourceName ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No file selected · .txt, .md, or .pdf (max {MAX_UPLOAD_MB} MB)
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div
            className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-950/50 sm:flex-row sm:items-center sm:gap-0 sm:p-2 sm:pr-4"
            aria-hidden="true"
          >
            <div className="h-10 w-[7.25rem] shrink-0 rounded-lg bg-zinc-200 dark:bg-zinc-700" />
            <div className="min-h-10 flex flex-1 items-center border-t border-zinc-200 pt-3 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0 dark:border-zinc-700">
              <div className="h-4 w-full max-w-md rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
          </div>
        )}
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
            setPlainTextSourceName(null);
            setTestText(e.target.value);
          }}
          rows={14}
          placeholder="Paste full exam text, or pick a PDF."
          className="min-h-55 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 p-4 font-mono text-sm leading-relaxed text-zinc-900 outline-none ring-emerald-600/0 transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-emerald-500"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void onSubmit();
            }}
            disabled={loading || !hasMcqInput}
            title={
              hasMcqInput
                ? undefined
                : "Paste your test or upload a .txt, .md, or .pdf file first."
            }
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-600"
          >
            {loading ? "Reviewing…" : "Submit"}
          </button>
          {success ? (
            <button
              type="button"
              onClick={() => {
                downloadPdfFromBase64(success.pdfBase64, success.pdfFileName);
              }}
              className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Download PDF
            </button>
          ) : null}
        </div>
        {error ? (
          <p
            className="whitespace-pre-wrap break-words rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </section>

      {success ? (
        <section className="flex flex-col gap-6">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="flex flex-col gap-3 border-b border-zinc-200 bg-gradient-to-r from-emerald-50/90 to-zinc-50 px-5 py-4 dark:border-zinc-800 dark:from-emerald-950/35 dark:to-zinc-950/80 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  Summary
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Review run metadata
                </p>
              </div>
              <p className="inline-flex w-fit items-center rounded-full border border-emerald-200/80 bg-white/90 px-3 py-1 text-xs font-semibold text-emerald-800 shadow-sm dark:border-emerald-800/60 dark:bg-zinc-900/90 dark:text-emerald-300">
                {success.result.evaluations.length}{" "}
                {success.result.evaluations.length === 1
                  ? "question"
                  : "questions"}{" "}
                reviewed
              </p>
            </div>
            <dl className="grid gap-3 p-5 sm:grid-cols-3 sm:gap-4">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Model
                </dt>
                <dd className="mt-1.5 break-all font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {success.meta.model}
                </dd>
                {success.meta.modelsAttempted.length > 1 ? (
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
                  {formatGeneratedTimestampIst(success.meta.generatedAt)}
                </dd>
              </div>
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Input status
                </dt>
                <dd className="mt-1.5">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${inputStatusBadgeClasses(success.result.inputStatus)}`}
                  >
                    {inputStatusLabel(success.result.inputStatus)}
                  </span>
                </dd>
              </div>
            </dl>
            {success.result.inputIncompleteMessage ? (
              <div className="border-t border-zinc-200 bg-amber-50/80 px-5 py-4 dark:border-zinc-800 dark:bg-amber-950/25">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                  Note
                </p>
                <p className="mt-1 text-sm leading-relaxed text-amber-950 dark:text-amber-100">
                  {success.result.inputIncompleteMessage}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-8">
            {sortEvaluations(success.result.evaluations).map((ev) => {
              return (
                <article
                  key={`${ev.index}-${ev.questionText.slice(0, 24)}`}
                  className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40"
                >
                  <h3 className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
                    Question {ev.index + 1}
                  </h3>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                    {ev.questionText}
                  </p>
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Options
                    </p>
                    <ul className="mt-2 flex flex-col gap-2">
                      {ev.options.map((opt) => {
                        return (
                          <li
                            key={`${ev.index}-${opt.label}`}
                            className="rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-950/60"
                          >
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                              {opt.label}.
                            </span>{" "}
                            <span className="text-zinc-800 dark:text-zinc-200">
                              {opt.text}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200">
                      Correct answer
                    </p>
                    <p className="mt-1 text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                      {ev.correctAnswerLabel}
                    </p>
                  </div>
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Explanation
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                      {ev.explanation}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}
