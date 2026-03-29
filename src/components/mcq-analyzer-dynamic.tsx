"use client";

import dynamic from "next/dynamic";

const McqAnalyzerClient = dynamic(
  () =>
    import("@/components/mcq-analyzer-client").then(
      (mod) => mod.McqAnalyzerClient,
    ),
  {
    ssr: false,
    loading: () => {
      return (
        <div
          aria-hidden="true"
          className="pointer-events-none flex w-full min-w-0 flex-col gap-8 lg:flex-row lg:items-start lg:gap-8"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-8">
            <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/40">
              <div className="flex w-full min-w-0 flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-950/50 sm:flex-row sm:items-stretch sm:gap-4 sm:p-3 sm:pr-4">
                <div className="h-11 w-full shrink-0 animate-pulse rounded-lg bg-emerald-600/25 sm:h-10 sm:w-34 dark:bg-emerald-500/20" />
                <div className="flex min-h-10 min-w-0 flex-1 items-center border-t border-zinc-200 pt-3 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0 dark:border-zinc-700">
                  <div className="h-3.5 w-full max-w-56 animate-pulse rounded bg-zinc-200/90 dark:bg-zinc-700/90" />
                </div>
              </div>
              <div className="h-5 w-44 animate-pulse rounded bg-zinc-200/80 dark:bg-zinc-700/60" />
              <div className="min-h-44 w-full min-w-0 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 sm:min-h-55" />
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="h-11 w-full animate-pulse rounded-xl bg-emerald-600/25 sm:h-10 sm:w-30 dark:bg-emerald-500/20" />
              </div>
            </section>
          </div>
          <aside className="w-full shrink-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40 lg:sticky lg:top-6 lg:max-h-[min(80vh,40rem)] lg:w-80 lg:overflow-y-auto lg:p-5">
            <div className="h-5 w-20 animate-pulse rounded-md bg-zinc-200/90 dark:bg-zinc-700/80" />
            <div className="mt-2 h-3 w-full max-w-72 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="mt-4 flex flex-col gap-3">
              <div className="h-18 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-950/50" />
              <div className="h-18 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50/80 dark:border-zinc-700 dark:bg-zinc-950/50" />
            </div>
          </aside>
        </div>
      );
    },
  },
);

export function McqAnalyzerDynamic() {
  return <McqAnalyzerClient />;
}
