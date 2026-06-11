/**
 * 応募管理ステータス（DB の JobStatus enum と一致）。
 * 表示ラベルとバッジ配色を一元管理する。
 */

export const JOB_STATUS_VALUES = [
  "NONE",
  "CONSIDERING",
  "APPLIED",
  "INTERVIEW",
  "WON",
  "REJECTED",
] as const;

export type JobStatusValue = (typeof JOB_STATUS_VALUES)[number];

export type JobStatusMeta = {
  value: JobStatusValue;
  label: string;
  /** バッジ用 Tailwind クラス（light/dark 両対応）。 */
  badgeClass: string;
};

export const JOB_STATUS_META: Record<JobStatusValue, JobStatusMeta> = {
  NONE: {
    value: "NONE",
    label: "未対応",
    badgeClass:
      "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
  },
  CONSIDERING: {
    value: "CONSIDERING",
    label: "検討中",
    badgeClass:
      "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
  },
  APPLIED: {
    value: "APPLIED",
    label: "応募済",
    badgeClass:
      "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300",
  },
  INTERVIEW: {
    value: "INTERVIEW",
    label: "面談",
    badgeClass:
      "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  WON: {
    value: "WON",
    label: "受注",
    badgeClass:
      "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  REJECTED: {
    value: "REJECTED",
    label: "見送り",
    badgeClass:
      "border-red-300 bg-red-100 text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400",
  },
};

export const JOB_STATUS_LIST: JobStatusMeta[] = JOB_STATUS_VALUES.map(
  (v) => JOB_STATUS_META[v],
);

export function jobStatusMeta(value: string | null | undefined): JobStatusMeta {
  if (value && value in JOB_STATUS_META) {
    return JOB_STATUS_META[value as JobStatusValue];
  }
  return JOB_STATUS_META.NONE;
}

/** 応募見積もりを入力できるステータス（応募済・面談・受注）。 */
const AMOUNT_EDITABLE: ReadonlySet<JobStatusValue> = new Set([
  "APPLIED",
  "INTERVIEW",
  "WON",
]);

export function statusAllowsAmount(value: string | null | undefined): boolean {
  return !!value && AMOUNT_EDITABLE.has(value as JobStatusValue);
}

/** 金額（円）を `¥50,000` 形式に整形。null/未設定は null を返す。 */
export function formatYen(amount: number | null | undefined): string | null {
  if (amount == null || Number.isNaN(amount)) return null;
  return `¥${amount.toLocaleString("ja-JP")}`;
}
