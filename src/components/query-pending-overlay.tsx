"use client";

import * as React from "react";
import { useIsFetching } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";

import { LoadingMark } from "@/components/page-loading-view";

const SHOW_AFTER_MS = 400;

/**
 * 初回フェッチのみ（キャッシュ済みのバックグラウンド再取得はカウントしない）。
 * 遅延表示でフラッシュを抑える。
 */
export function QueryPendingOverlay() {
  const pendingRoots = useIsFetching({
    predicate: (q) => q.state.status === "pending",
  });
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (pendingRoots === 0) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [pendingRoots]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="qh-overlay"
          className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-zinc-50/72 backdrop-blur-[2px] dark:bg-zinc-950/76"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          aria-busy="true"
          aria-live="polite"
          aria-label="Loading data"
        >
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-zinc-200/90 bg-white/95 px-10 py-8 shadow-xl dark:border-zinc-700/90 dark:bg-zinc-950/95">
            <LoadingMark />
            <div className="space-y-1 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                Fetching
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">This may take a moment</p>
            </div>
            <motion.div
              className="h-0.5 w-40 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.span
                className="block h-full w-1/2 rounded-full bg-gradient-to-r from-sky-500 via-violet-500 to-sky-500"
                animate={{ x: ["-100%", "280%"] }}
                transition={{
                  repeat: Infinity,
                  duration: 1.2,
                  ease: "easeInOut",
                }}
              />
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
