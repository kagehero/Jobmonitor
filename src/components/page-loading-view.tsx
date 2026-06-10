"use client";

import { motion } from "framer-motion";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type DashboardPageLoadingProps = {
  className?: string;
};

/**
 * フルサイドレイアウトに合わせたルート読み込み／重いクエリ開始時のスケルトン。
 * （App Router の `loading.tsx` やオーバーレイから流用できる）
 */
export function DashboardPageLoading({ className }: DashboardPageLoadingProps) {
  return (
    <div className={cn("space-y-8", className)}>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <LoadingMark />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="mx-auto h-8 max-w-[18rem] sm:mx-0 md:h-9" />
            <Skeleton className="mx-auto h-4 max-w-[14rem] sm:mx-0" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[6.75rem] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[420px] w-full rounded-xl" />
      <LoadingBarThin className="max-w-xl" aria-hidden />
      <p className="text-center text-[11px] uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
        Loading workspace
      </p>
    </div>
  );
}

export function LoadingMark({ className }: { className?: string }) {
  return (
    <motion.div
      className={cn("relative shrink-0", className)}
      initial={{ opacity: 0.45, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.85, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
      aria-hidden
    >
      <span className="relative flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-600 text-xs font-bold text-white shadow-md dark:from-white dark:to-zinc-400 dark:text-zinc-900">
        JH
      </span>
      <span className="pointer-events-none absolute inset-[-4px] rounded-[14px] border border-zinc-300/70 dark:border-zinc-700/70" />
    </motion.div>
  );
}

export function LoadingBarThin({ className }: { className?: string }) {
  return (
    <div
      className={cn("relative mx-auto h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800", className)}
      role="presentation"
    >
      <motion.div
        className="absolute inset-y-0 w-2/5 rounded-full bg-gradient-to-r from-zinc-400 via-zinc-900 to-zinc-400 dark:from-zinc-500 dark:via-zinc-200 dark:to-zinc-500"
        initial={{ x: "-110%" }}
        animate={{ x: "220%" }}
        transition={{
          repeat: Infinity,
          duration: 1.55,
          ease: "easeInOut",
          repeatDelay: 0,
        }}
      />
    </div>
  );
}
