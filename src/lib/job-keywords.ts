/**
 * ダッシュボードで設定する「ジョブ絞り込みキーワード」。
 *
 * Settings ページで編集し、`AppSetting`(key: `job_keywords`) に
 * `{ value: string[] }` 形式で永続化する（他の設定の `{ value: ... }` 規約に揃える）。
 * Jobs 一覧では、いずれかのキーワードがタイトル／説明文に含まれる案件のみを表示する（OR 一致）。
 */
export const JOB_KEYWORDS_SETTING_KEY = "job_keywords";

/** 1 行あたりの上限・件数上限（無制限入力でクエリが肥大化しないよう軽くガード）。 */
const MAX_KEYWORDS = 50;
const MAX_KEYWORD_LEN = 80;

/**
 * 任意の入力（テキストエリア文字列・カンマ／改行区切り・配列など）を
 * 正規化済みキーワード配列に変換する。空白除去・重複排除・上限適用を行う。
 */
export function normalizeKeywords(input: unknown): string[] {
  let parts: string[] = [];

  if (Array.isArray(input)) {
    parts = input.map((x) => (typeof x === "string" ? x : String(x ?? "")));
  } else if (typeof input === "string") {
    parts = input.split(/[\n,、]/);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const kw = raw.trim().replace(/\s+/g, " ").slice(0, MAX_KEYWORD_LEN);
    if (!kw) continue;
    const dedupeKey = kw.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(kw);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

/**
 * `AppSetting` の `value`（`{ value: string[] }` 想定だが、過去データの揺れに備えて
 * 文字列・配列直値もフォールバックで受ける）からキーワード配列を取り出す。
 */
export function keywordsFromSettingValue(value: unknown): string[] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const inner = (value as { value?: unknown }).value;
    return normalizeKeywords(inner);
  }
  return normalizeKeywords(value);
}

/** 永続化用に `{ value: string[] }` 形へ整形する。 */
export function keywordsToSettingValue(keywords: string[]): { value: string[] } {
  return { value: normalizeKeywords(keywords) };
}
