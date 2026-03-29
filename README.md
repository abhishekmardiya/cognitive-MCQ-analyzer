# Cognitive MCQ Analyzer

A Next.js app that ingests multiple-choice question material (PDF or pasted text), uses **Google Gemini** via the [AI SDK](https://sdk.vercel.ai/docs) to parse and evaluate each question, and returns structured results plus a downloadable **PDF report**.

## Features

- Upload a **PDF** (text-based PDFs work best; scanned pages need OCR elsewhere first) or **paste** raw question text. Plain **text files** are also accepted when uploaded.
- Server-side extraction with `pdf-parse` for supported PDFs, plus light **post-processing** for **Indic-script** PDFs where extraction drops spaces between syllables (improves Gujarati/Hindi and similar text before the model sees it).
- **Streaming responses**: evaluation is streamed with **NDJSON** so the UI can show **partial structured results** as the model fills them in, then the final payload includes the complete evaluation and PDF report.
- **Summary panel** shows model used, **India Standard Time (IST)** for the run, and an **input status** badge when the model flags incomplete or ambiguous input.
- **Model choice**: pick a Gemini (or Gemma) text model in the UI. The server uses an **ordered fallback chain** on quota, rate limits, or overload (you’ll see `status` lines and `modelsAttempted` in the final metadata when a fallback ran).
- Structured evaluation per question: options, inferred correct answer, and explanations (explanations follow each question’s language when possible).
- **Download** a generated analysis report as PDF (`pdfmake`); report timestamps use **IST** for readability.
- **Review history (this browser only)**: successful runs are saved to **IndexedDB**. Reopen a past review, delete entries, and get a notice if storage is tight and the **PDF bytes were omitted** from a saved session (structured results are still kept).

## Requirements

- Node.js 20+ (recommended; aligns with typical Next.js tooling)
- A [Google AI Studio](https://aistudio.google.com/) API key for the Gemini API

## Environment variables

Create `.env.local` (or `.env`) in the project root:

| Variable                                           | Required | Description                                                                                                                           |
| -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY` | Yes      | Gemini API key                                                                                                                        |
| `GEMINI_MODEL`                                     | No       | Default model id when the client does not send one (must be in the built-in allowlist; default catalog default is `gemini-2.5-flash`) |
| `GEMINI_EXTRA_MODEL_IDS`                           | No       | Comma-separated extra model ids allowed for client/env selection (each id must match `[a-zA-Z0-9._-]`, max length 120)                |

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
