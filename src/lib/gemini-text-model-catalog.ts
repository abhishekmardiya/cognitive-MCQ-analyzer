export const DEFAULT_GEMINI_TEXT_MODEL_ID = "gemini-2.5-flash";

/** Text / structured-output models for the MCQ flow (no image, TTS, video, or specialist APIs). */
export const GEMINI_TEXT_MODEL_CHOICES: readonly {
  id: string;
  label: string;
}[] = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (default)" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  {
    id: "gemini-2.5-flash-lite-preview-09-2025",
    label: "Gemini 2.5 Flash-Lite Preview (09-2025)",
  },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { id: "gemini-2.0-flash-001", label: "Gemini 2.0 Flash 001" },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite" },
  { id: "gemini-2.0-flash-lite-001", label: "Gemini 2.0 Flash-Lite 001" },
  { id: "gemini-flash-latest", label: "Gemini Flash (latest alias)" },
  { id: "gemini-flash-lite-latest", label: "Gemini Flash-Lite (latest alias)" },
  { id: "gemini-pro-latest", label: "Gemini Pro (latest alias)" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
  {
    id: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash-Lite Preview",
  },
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview" },
  { id: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview" },
  { id: "gemma-3-1b-it", label: "Gemma 3 1B IT" },
  { id: "gemma-3-4b-it", label: "Gemma 3 4B IT" },
  { id: "gemma-3n-e2b-it", label: "Gemma 3n E2B IT" },
  { id: "gemma-3n-e4b-it", label: "Gemma 3n E4B IT" },
  { id: "gemma-3-12b-it", label: "Gemma 3 12B IT" },
  { id: "gemma-3-27b-it", label: "Gemma 3 27B IT" },
];
