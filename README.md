# Cognitive MCQ Analyzer

A Next.js app that ingests multiple-choice question material (PDF or pasted text), uses **Google Gemini** via the [AI SDK](https://sdk.vercel.ai/docs) to parse and evaluate each question, and returns structured results plus a downloadable **PDF report**.

## Features

- Upload a **PDF** (text-based PDFs work best; scanned pages need OCR elsewhere first) or **paste** raw question text.
- Server-side extraction with `pdf-parse` for supported PDFs.
- Structured evaluation per question: options, inferred correct answer, and explanations (explanations follow each question’s language when possible).
- **Download** a generated analysis report as PDF (`pdfmake`).

## Requirements

- Node.js 20+ (recommended; aligns with typical Next.js tooling)
- A [Google AI Studio](https://aistudio.google.com/) API key for the Gemini API

## Environment variables

Create `.env.local` (or `.env`) in the project root:

| Variable                                           | Required | Description                            |
| -------------------------------------------------- | -------- | -------------------------------------- |
| `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY` | Yes      | Gemini API key                         |
| `GEMINI_MODEL`                                     | No       | Model id (default: `gemini-2.5-flash`) |

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command          | Description             |
| ---------------- | ----------------------- |
| `npm run dev`    | Development server      |
| `npm run build`  | Production build        |
| `npm run start`  | Start production server |
| `npm run lint`   | Biome check             |
| `npm run format` | Biome format (write)    |

## API: `POST /api/evaluate`

The UI calls this route; you can also integrate programmatically.

**Multipart** (`multipart/form-data`):

- `file` — PDF or text file (max **4.5 MB**), or
- `text` — plain string of the test content.

**JSON** (`application/json`):

- `{ "text": "..." }`, or
- `{ "pdfBase64": "...", "pdfFileName": "optional.pdf" }`.

Successful responses include `result` (structured evaluations), `pdfBase64`, `pdfFileName`, and `meta` (title, timestamp, model). Errors return `{ "error": "..." }` with an appropriate status code.

The route sets `maxDuration` to **300** seconds for long generations on supported hosts (e.g. Vercel).

## Tech stack

- **Next.js** 16 (App Router), **React** 19
- **ai** + **@ai-sdk/google** for Gemini and structured output (`Output.object` + Zod schemas)
- **pdf-parse**, **pdfmake**, **zod**
- **Tailwind CSS** 4, **Biome** for lint/format
