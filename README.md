# Cognitive MCQ Analyzer

A Next.js app that ingests multiple-choice question material (PDF or pasted text), uses **Google Gemini** via the [AI SDK](https://sdk.vercel.ai/docs) to parse and evaluate each question, and returns structured results plus a downloadable **PDF report**.

## Features

- Upload a **PDF** or **paste** raw question text. Plain **text files** are also accepted when uploaded.
- Server-side extraction with `pdf-parse` (pdf.js) for searchability and chunking hints, plus light **post-processing** for **Indic-script** spacing. For **PDF uploads**, the same bytes are also sent to Gemini as **`application/pdf`** (multimodal) so stems and options match what you see in a viewer even when the PDF text layer uses legacy font encoding (mojibake from extraction alone). **Gemma** models use extracted text only (no PDF attachment).
- **Large tests**: long material or many numbered questions trigger **multi-pass evaluation**. For **PDF uploads** (Gemini path), each pass now scopes by **PDF page ranges** aligned with the old part count—**no plaintext excerpt** in the prompt—so stems and options are not copied from a broken text layer while explanations stay correct. Results are **merged and deduped**; the stream shows `Processing PDF pages …` or `Processing part N of M…` between passes.
- **Streaming responses**: evaluation is streamed with **NDJSON** so the UI can show **partial structured results** as the model fills them in, then the final payload includes the complete evaluation and PDF report.
- **Summary panel** shows model used, **India Standard Time (IST)** for the run, and an **input status** badge when the model flags incomplete or ambiguous input.
- **Model choice**: optional `GEMINI_MODEL` env (or JSON `model` on `/api/evaluate`) selects a built-in Gemini or Gemma text id; otherwise the server starts from the catalog default. The server uses an **ordered fallback chain** when quota/rate limits apply: it combines the thrown error with **`streamText` `onError`** (stream failures often become `NoOutputGeneratedError` without attaching `AI_APICallError` to `catch`), treats that SDK message as retryable, and uses **`maxRetries: 0`** so the same model is not retried in the SDK. Gemma ids are tried after the Gemini entries in the chain. You’ll see `status` lines and `modelsAttempted` when a fallback ran.
- Structured evaluation per question: options, inferred correct answer, and explanations (explanations follow each question’s language when possible). Explanations are **short and JSON-safe** (schema max **560** Unicode chars, one line, no raw `"` inside strings) so the model does not truncate mid-JSON. If parsing still fails, the server **retries** the same pass with stricter caps (then once more with minimal explanations).
- **Download** a generated analysis report as PDF (`pdfmake`); report timestamps use **IST** for readability.
- **Review history (this browser only)**: successful runs are saved to **IndexedDB**. Reopen a past review, delete entries, and get a notice if storage is tight and the **PDF bytes were omitted** from a saved session (structured results are still kept).

## Requirements

- Node.js 20+ (recommended; aligns with typical Next.js tooling)
- A [Google AI Studio](https://aistudio.google.com/) API key for the Gemini API

## Environment variables

Create `.env.local` (or `.env`) in the project root:

| Variable                                           | Required | Description                                                                                                                                                                                                                                                                          |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY` | Yes      | Gemini API key                                                                                                                                                                                                                                                                       |
| `GEMINI_MODEL`                                     | No       | Default model id when the client does not send one (must be in the built-in allowlist; default is `gemini-3.1-flash-lite-preview`). The built-in catalog favors common free-tier quotas; add ids via `GEMINI_EXTRA_MODEL_IDS` if your project still has access to models we omitted. |
| `GEMINI_EXTRA_MODEL_IDS`                           | No       | Comma-separated extra model ids allowed for client/env selection (each id must match `[a-zA-Z0-9._-]`, max length 120)                                                                                                                                                               |

The app only accepts model ids from its **catalog** plus any ids listed in `GEMINI_EXTRA_MODEL_IDS`, so arbitrary strings from the client cannot be used to probe unknown endpoints.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command          | Description                    |
| ---------------- | ------------------------------ |
| `npm run dev`    | Development server             |
| `npm run build`  | Production build               |
| `npm run start`  | Start production server        |
| `npm run lint`   | Biome check                    |
| `npm run format` | Biome format (write)           |
| `npm run ts`     | TypeScript check in watch mode |

## API: `POST /api/evaluate`

The UI calls this route; you can also integrate programmatically.

**Multipart** (`multipart/form-data`):

- `file` — PDF, text file, or other upload (max **4.5 MB**), or
- `text` — plain string of the test content.
- `model` — optional Gemini text model id (must be allowed; see environment section).

**JSON** (`application/json`):

- `{ "text": "..." }`, or
- `{ "pdfBase64": "...", "pdfFileName": "optional.pdf" }`.
- `"model"` — optional, same semantics as multipart.

### Streaming (successful evaluation)

On success, the response uses **`Content-Type: application/x-ndjson`** — one JSON object per line (newline-delimited JSON). Read the body as a stream and parse each complete line as JSON.

| `type`     | Meaning                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `partial`  | Incremental structured output (`data` matches the evaluation schema in progress).                                                                             |
| `status`   | Optional human-readable `message` (e.g. switching to a fallback model).                                                                                       |
| `complete` | Final payload: `result`, `pdfBase64`, `pdfFileName`, `meta` (`title`, `generatedAt` ISO UTC, `model` used, `modelsAttempted` full chain including fallbacks). |
| `error`    | Streamed failure: `error` string (same line format; connection may still end with HTTP 200).                                                                  |

Validation and setup failures **before** generation starts still return **`application/json`** with `{ "error": "..." }` and a 4xx/5xx status.

The route sets `maxDuration` to **300** seconds for long generations on supported hosts (e.g. Vercel).

## Privacy and local data

- **API**: Question text is sent to **Google’s Gemini API** for analysis; follow Google’s terms and your own compliance needs.
- **History**: Saved reviews live only in the user’s **browser (IndexedDB)**; they are not uploaded to your server by the history feature. Clearing site data removes them.

## Tech stack

- **Next.js** 16 (App Router), **React** 19
- **ai** + **@ai-sdk/google** for Gemini, structured output (`Output.object` + Zod), and **`streamText` + `partialOutputStream`** for streamed evaluation
- **pdf-parse**, **pdfmake**, **zod**
- **Tailwind CSS** 4, **Biome** for lint/format
- Client **IndexedDB** for optional review history
