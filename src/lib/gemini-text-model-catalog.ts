/** Text / structured-output models for the MCQ flow (no image, TTS, video, or specialist APIs). */
export const GEMINI_TEXT_MODEL_CHOICES: readonly {
  id: string;
  label: string;
}[] = [
  {
    id: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite",
  },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },

  { id: "gemma-3-27b-it", label: "Gemma 3 27B IT" },
  { id: "gemma-3-12b-it", label: "Gemma 3 12B IT" },
  { id: "gemma-3-4b-it", label: "Gemma 3 4B IT" },
  { id: "gemma-3-1b-it", label: "Gemma 3 1B IT" },
  { id: "gemma-3n-e4b-it", label: "Gemma 3n E4B IT" },
  { id: "gemma-3n-e2b-it", label: "Gemma 3n E2B IT" },
];
