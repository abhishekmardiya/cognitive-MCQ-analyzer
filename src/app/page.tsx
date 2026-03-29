import { McqAnalyzerClient } from "@/components/mcq-analyzer-client";

export default function Home() {
  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 dark:border-zinc-800">
          <p className="text-3xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-400 sm:text-4xl">
            Cognitive MCQ Analyzer
          </p>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
            Upload or paste your MCQ test
          </h1>
        </header>

        <McqAnalyzerClient />
      </div>
    </div>
  );
}
