"use client";

import * as React from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import { sanitizeClientExtrasText } from "@/lib/client-extras-text";
import { cn } from "@/lib/utils";

/** フィードバック 良n・悪m */
export const FEEDBACK_PAIR = /フィードバック\s*良(\d+)\s*[・·]\s*悪(\d+)/u;
/** フィードバック（良）n件 */
export const FEEDBACK_GOOD_ONLY = /フィードバック\s*（良）(\d+)\s*件/u;

function MidDot({ className }: { className?: string }) {
  return (
    <span className={cn("shrink-0 text-zinc-300 dark:text-zinc-600", className)} aria-hidden>
      ·
    </span>
  );
}

function FeedbackBadge({
  good,
  bad,
  compact,
}: {
  good: string;
  bad?: string;
  compact: boolean;
}) {
  const hasBad = bad !== undefined;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900",
        compact ? "gap-1 px-1 py-0.5" : "gap-1.5 px-1.5 py-0.5",
      )}
      role="group"
      aria-label={hasBad ? `フィードバック 良${good} 悪${bad}` : `フィードバック 良${good}件`}
    >
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium tabular-nums text-emerald-700 dark:text-emerald-400",
          compact ? "text-[10px]" : "text-[11px]",
        )}
      >
        <ThumbsUp className={cn("shrink-0 stroke-[2.25]", compact ? "size-2.5" : "size-3")} aria-hidden />
        良{good}
      </span>
      {hasBad ? (
        <>
          <MidDot />
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium tabular-nums text-rose-700 dark:text-rose-400",
              compact ? "text-[10px]" : "text-[11px]",
            )}
          >
            <ThumbsDown className={cn("shrink-0 stroke-[2.25]", compact ? "size-2.5" : "size-3")} aria-hidden />
            悪{bad}
          </span>
        </>
      ) : null}
    </span>
  );
}

export function parseLancersFeedbackCounts(haystack: string): { good: number; bad: number } | null {
  const norm = haystack.replace(/\s+/g, " ").trim();
  if (!norm) return null;
  const pair = FEEDBACK_PAIR.exec(norm);
  if (pair) return { good: parseInt(pair[1]!, 10), bad: parseInt(pair[2]!, 10) };
  const go = FEEDBACK_GOOD_ONLY.exec(norm);
  if (go) return { good: parseInt(go[1]!, 10), bad: 0 };
  return null;
}

/** 補足プレビューからフィードバック文言を除く（専用チップと重複しないように）。 */
export function stripLancersFeedbackPhrases(extrasPreview: string): string {
  let t = extrasPreview.replace(/\s+/g, " ");
  t = t.replace(FEEDBACK_PAIR, " ").replace(FEEDBACK_GOOD_ONLY, " ");
  t = t.replace(/\s*·\s*/g, " · ").replace(/\s+/g, " ").trim();
  return t
    .replace(/^\s*·\s*|\s*·\s*$/g, "")
    .trim();
}

/**
 * ランサーズ: フィードバック良・悪をサムズアイコン付きで表示。
 * 補足に無い場合はダッシュで揃える。
 */
export function LancersClientFeedbackStrip({ haystack, compact = true }: { haystack: string; compact?: boolean }) {
  const parsed = parseLancersFeedbackCounts(haystack);
  if (!parsed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-dashed border-zinc-300/90 bg-zinc-50/90 px-1.5 py-0.5 dark:border-zinc-600 dark:bg-zinc-900/70",
          compact ? "text-[10px]" : "text-[11px]",
        )}
        role="group"
        aria-label="フィードバック件数は取得できていません"
      >
        <span className="inline-flex items-center gap-0.5 font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
          <ThumbsUp className={cn("shrink-0 opacity-75", compact ? "size-2.5" : "size-3")} aria-hidden />
          良 —
        </span>
        <MidDot />
        <span className="inline-flex items-center gap-0.5 font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
          <ThumbsDown className={cn("shrink-0 opacity-75", compact ? "size-2.5" : "size-3")} aria-hidden />
          悪 —
        </span>
      </span>
    );
  }
  return <FeedbackBadge good={String(parsed.good)} bad={String(parsed.bad)} compact={compact} />;
}

function buildFeedbackLayout(text: string, compact: boolean): React.ReactNode {
  let m = FEEDBACK_PAIR.exec(text);
  let pattern: typeof FEEDBACK_PAIR | typeof FEEDBACK_GOOD_ONLY = FEEDBACK_PAIR;

  if (!m) {
    m = FEEDBACK_GOOD_ONLY.exec(text);
    pattern = FEEDBACK_GOOD_ONLY;
  }
  if (!m || m.index === undefined) return text;

  const full = m[0]!;
  const idx = m.index;
  const before = text.slice(0, idx).replace(/\s*·\s*$/u, "").trimEnd();
  const after = text.slice(idx + full.length).replace(/^\s*·\s*/u, "").trimStart();

  const badge =
    pattern === FEEDBACK_PAIR ? (
      <FeedbackBadge good={m[1]!} bad={m[2]!} compact={compact} />
    ) : (
      <FeedbackBadge good={m[1]!} compact={compact} />
    );

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-x-1 gap-y-1 align-middle">
      {before ? <span className="min-w-0 break-words">{before}</span> : null}
      {before ? <MidDot className={compact ? "translate-y-[1px]" : undefined} /> : null}
      {badge}
      {after ? (
        <>
          <MidDot />
          <span className="min-w-0 break-words">{after}</span>
        </>
      ) : null}
    </span>
  );
}

type Props = {
  text: string;
  /** Dense tables / job list meta strip */
  compact?: boolean;
  className?: string;
};

/** Renders client extras with industry segments stripped and thumbs icons for Lancers feedback when possible. */
export function ClientExtrasInline({ text, compact = false, className }: Props) {
  const cleaned = sanitizeClientExtrasText(text);
  if (!cleaned) return null;

  const hasFeedbackPattern =
    cleaned.match(FEEDBACK_PAIR) !== null || cleaned.match(FEEDBACK_GOOD_ONLY) !== null;
  const node = hasFeedbackPattern ? buildFeedbackLayout(cleaned, compact) : cleaned;

  return <span className={cn("inline leading-snug", className)}>{node}</span>;
}
