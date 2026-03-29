import { McqAnalyzerDynamic } from "@/components/mcq-analyzer-dynamic";

export default function Home() {
  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6 px-3 py-8 sm:gap-10 sm:px-6 sm:py-12 lg:px-8">
        <header className="flex min-w-0 flex-col gap-2 sm:gap-3 dark:border-zinc-800">
          <p className="text-balance text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-400 sm:text-3xl lg:text-4xl">
            Cognitive MCQ Analyzer
          </p>
          <h1 className="text-balance text-base font-semibold tracking-tight sm:text-xl">
            Upload or paste your MCQ test
          </h1>
        </header>

        <McqAnalyzerDynamic />
      </div>
    </div>
  );
}
