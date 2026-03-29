"use client";

import dynamic from "next/dynamic";

const McqAnalyzerClient = dynamic(
  () =>
    import("@/components/mcq-analyzer-client").then(
      (mod) => mod.McqAnalyzerClient
    ),
  {
    ssr: false,
    loading: () => {
      return (
        <section
          aria-hidden="true"
          className="flex min-w-0 flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/40"
        >
          <div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-48 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-11 animate-pulse rounded-xl bg-zinc-200/80 dark:bg-zinc-700" />
        </section>
      );
    },
  }
);

export function McqAnalyzerDynamic() {
  return <McqAnalyzerClient />;
}
