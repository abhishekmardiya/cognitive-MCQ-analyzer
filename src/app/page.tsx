import { McqAnalyzerDynamic } from "@/components/mcq-analyzer-dynamic";

export default function Home() {
  return (
    <div className="flex min-h-full min-w-0 w-full flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto box-border flex w-full min-w-0 max-w-[80vw] flex-1 flex-col gap-6 px-4 py-8 sm:gap-10 sm:px-6 sm:py-12 lg:px-8">
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 dark:border-zinc-800">
          <div className="min-w-0 flex flex-col gap-2 sm:gap-3">
            <p className="text-balance text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-400 sm:text-3xl lg:text-4xl">
              Cognitive MCQ Analyzer
            </p>
            <h1 className="text-balance text-base font-semibold tracking-tight sm:text-xl">
              Upload or paste your MCQ test
            </h1>
          </div>
          <a
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            href="https://github.com/abhishekmardiya/cognitive-MCQ-analyzer"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg
              aria-hidden
              className="h-5 w-5"
              viewBox="0 0 98 96"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title>GitHub</title>
              <path
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
                d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.23-5.378-22.23-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
              />
            </svg>
            GitHub
          </a>
        </header>

        <McqAnalyzerDynamic />
      </div>
    </div>
  );
}
