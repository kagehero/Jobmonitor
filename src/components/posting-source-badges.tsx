"use client";

import type { ReactNode } from "react";

import { abbreviatePostingPlatform, postingBoardCategory } from "@/lib/posting-board-meta";
import { cn } from "@/lib/utils";

function platformToneClass(platformKey: string): string {
  const p = platformKey.toLowerCase();
  if (p.includes("lancers")) {
    return "border-sky-600/35 bg-sky-100 dark:border-sky-400/40 dark:bg-sky-950/50 text-sky-950 dark:text-sky-100";
  }
  if (p.includes("crowd") || p.includes("cloudwork")) {
    return "border-violet-600/35 bg-violet-100 dark:border-violet-400/40 dark:bg-violet-950/45 text-violet-950 dark:text-violet-100";
  }
  return "border-zinc-400 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100";
}

function SourcePill(props: { className?: string; title?: string; children: ReactNode }) {
  return (
    <span
      role="presentation"
      title={props.title}
      className={cn(
        "inline-flex items-center justify-center rounded-lg border px-2 py-1 text-xs shadow-sm [&_*]:text-inherit",
        props.className,
      )}
    >
      {props.children}
    </span>
  );
}

/**
 * 「どのプラットフォーム由来か」（LW/CW）と「どの求人ボード一覧カテゴリか」（監視URL由来）を1つの短いバッジにする。
 *
 * （旧 ScrapingType の HTML/API/HYBRID ではなく **投稿側の一覧カテゴリ** を示す）
 */
export function PostingSourceBadges(props: {
  platform: string;
  listingUrl?: string | null;
  orientation?: "row" | "col";
  className?: string;
  dense?: boolean;
}) {
  const { platform, listingUrl, orientation = "col", className, dense } = props;
  const pf = abbreviatePostingPlatform(platform);
  const cat = postingBoardCategory(platform, listingUrl ?? null);

  const textSz = dense ? "text-[11px]" : "text-xs";
  const abbrSz = dense ? "text-[11px]" : "text-sm";

  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-1.5 align-top",
        orientation === "col" ? "flex-col items-start" : "flex-row items-start",
        className,
      )}
    >
      <span
        className="inline-flex"
        aria-label={`プラットフォーム ${pf.abbr}、求人ボード一覧カテゴリ ${cat.short}`}
      >
        <SourcePill className={platformToneClass(pf.tonesKey)} title={listingUrl ?? undefined}>
          <span className={cn("flex flex-wrap items-baseline gap-1 tracking-tight", textSz)}>
            <span className={cn("font-bold tabular-nums tracking-tighter", abbrSz)}>{pf.abbr}</span>
            <span className="select-none opacity-50" aria-hidden>
              ·
            </span>
            <span className={cn("min-w-0 max-w-[7.5rem] truncate font-semibold", textSz)}>{cat.short}</span>
          </span>
        </SourcePill>
      </span>
    </div>
  );
}
