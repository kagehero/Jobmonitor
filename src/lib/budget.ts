/**
 * 予算文字列を下限・上限の 2 部分に分解する。
 *
 * 実データのフォーマット:
 *   Lancers    : "200,000 円 ~ 300,000 円 / 固定"
 *   CrowdWorks : "固定 10,000〜30,000 円" / "時給 1,500〜2,000 円"
 *   範囲なし    : "予算（一覧）: 要確認 / 応相談"
 *   下限不明    : "固定 —〜550 円"
 *
 * - 区切りは半角 `~` または全角 `〜`。
 * - 下限・上限それぞれに「円」「固定/時給」などの装飾を保持し、表示はそのまま使う。
 * - 範囲として分解できない場合は range=null（単一行表示にフォールバック）。
 */
export type ParsedBudget = {
  /** 種別（固定 / 時給 / 月額 など）。無ければ null。 */
  kind: string | null;
  /** 下限の金額ラベル（例「10,000 円」）。range=null のときは原文全体。 */
  lower: string;
  /** 上限の金額ラベル。range=null のときは null。 */
  upper: string | null;
  /** 範囲として 2 分割できたか。false なら lower を 1 行表示にフォールバック。 */
  isRange: boolean;
};

/** 区切り（~ / 〜）で 2 分割。複数あっても最初の 1 つで割る。 */
function splitRange(raw: string): [string, string] | null {
  const m = raw.match(/^([\s\S]*?)\s*[~〜]\s*([\s\S]*)$/);
  if (!m) return null;
  return [m[1]!.trim(), m[2]!.trim()];
}

/**
 * 接頭辞（固定/時給）と接尾辞（/ 固定 など）を取り出し、下限・上限それぞれに付け直す。
 * CrowdWorks は「固定 A〜B 円」、Lancers は「A 円 ~ B 円 / 固定」と位置が異なるため、
 * 共通の "種別" ラベルを抽出して両側に補う。
 */
export function parseBudget(raw: string): ParsedBudget {
  const text = (raw ?? "").trim();
  if (!text) return { kind: null, lower: "—", upper: null, isRange: false };

  // 種別ラベル（固定 / 時給 / 月額 など）を抽出
  const kindMatch = text.match(/(固定|時給|月額|成果報酬)/);
  const kind = kindMatch?.[1] ?? null;

  // 種別表記と「/ 固定」のような末尾装飾を除いた範囲本体
  const body = text
    .replace(/\s*\/\s*(固定|時給|月額|成果報酬)\s*$/, "") // 末尾 "/ 固定"
    .replace(/^(固定|時給|月額|成果報酬)\s*/, "") // 先頭 "固定 "
    .trim();

  const parts = splitRange(body);
  if (!parts) {
    // 範囲として割れない（応相談・単一値など）はそのまま 1 行で返す
    return { kind, lower: text, upper: null, isRange: false };
  }

  const [loRaw, hiRaw] = parts;

  // 末尾側にだけ「円」が付くケース（CW: "10,000〜30,000 円"）→ 下限にも補う
  const unit = /円\s*$/.test(hiRaw) ? "円" : "";
  const normalize = (s: string) => {
    const v = s.trim();
    if (!v || v === "—") return "—";
    const withUnit = unit && !/円\s*$/.test(v) ? `${v} ${unit}` : v;
    return withUnit.replace(/\s+/g, " ");
  };

  return {
    kind,
    lower: normalize(loRaw),
    upper: normalize(hiRaw),
    isRange: true,
  };
}

/** 予算文字列から抽出した金額（円）。range フィルタ用。 */
export type BudgetAmounts = {
  /** 下限（円）。抽出できなければ null。 */
  min: number | null;
  /** 上限（円）。抽出できなければ null。 */
  max: number | null;
  /** 金額を 1 つでも抽出できたか（false = 応相談・要確認など）。 */
  hasAmount: boolean;
};

/**
 * 1 つの金額トークン（例「30,000 円」「5万円」「1,000,000」）を数値（円）に変換する。
 * 「万」は 10000 倍。下限不明を表す「—」やプレースホルダは null。
 */
function parseYenToken(token: string): number | null {
  const t = token.trim();
  if (!t || /^[—\-–]+$/.test(t)) return null;

  // 「5万」「5.5万」のような万円表記
  const manMatch = t.match(/([\d,.]+)\s*万/);
  if (manMatch?.[1]) {
    const n = parseFloat(manMatch[1].replace(/,/g, ""));
    if (!Number.isNaN(n)) return Math.round(n * 10000);
  }

  // 通常の数値（カンマ区切り可）。「円」「/固定」などの装飾は無視。
  const numMatch = t.match(/([\d,]+)/);
  if (numMatch?.[1]) {
    const n = parseInt(numMatch[1].replace(/,/g, ""), 10);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

/**
 * 予算文字列から金額レンジ（最小・最大円）を抽出する。
 *
 * - 範囲（"A〜B"）なら min=A, max=B。下限不明（"—〜B"）は min=null。
 * - 単一値なら min=max=その値。
 * - 「要確認 / 応相談」など金額が無い場合は min=max=null, hasAmount=false。
 *
 * 注: 「固定 1,000,000〜0 円」のように上限が 0 の不正データは、min>max を避けるため
 *     0 を上限として扱わず max=null（= 上限なし）とみなす。
 */
export function parseBudgetAmounts(raw: string): BudgetAmounts {
  const parsed = parseBudget(raw);

  if (!parsed.isRange || parsed.upper == null) {
    // 単一値 or 範囲なし。lower から 1 つだけ拾えればそれを min=max とする。
    const single = parseYenToken(parsed.lower);
    if (single == null) return { min: null, max: null, hasAmount: false };
    return { min: single, max: single, hasAmount: true };
  }

  const min = parseYenToken(parsed.lower);
  let max = parseYenToken(parsed.upper);

  // 上限 0（不正データ）は「上限なし」とみなす。
  if (max != null && max <= 0) max = null;
  // min > max の逆転も上限なし扱い。
  if (min != null && max != null && min > max) max = null;

  const hasAmount = min != null || max != null;
  return { min, max, hasAmount };
}

/**
 * 抽出した金額レンジが、指定したフィルタレンジ [filterMin, filterMax] に「収まる」か判定する。
 *
 * - 金額を抽出できない案件（hasAmount=false）は `includeUnknown` で扱いを切り替える。
 *     ・true（既定）: 常に含める（除外しない）
 *     ・false       : 見積フィルタ適用中は除外する
 * - 案件レンジ [min,max] がフィルタレンジに含まれる（包含）ときのみ true（含有判定）。
 *     ・案件の下限がフィルタ最小以上（jobLo >= filterMin）
 *     ・案件の上限がフィルタ最大以下（jobHi <= filterMax）
 *   よって「50,000〜100,000」は「最小100,000」のフィルタには該当しない（下限が下回るため）。
 *   案件側の min/max が片方欠ける場合は、その端を ±∞ として扱う（その端の条件は実質判定不可なので除外側に倒す）。
 */
export function budgetMatchesRange(
  amounts: BudgetAmounts,
  filterMin: number | null,
  filterMax: number | null,
  includeUnknown = true,
): boolean {
  if (filterMin == null && filterMax == null) return true; // フィルタなし
  if (!amounts.hasAmount) return includeUnknown; // 金額不明の扱い

  // 案件レンジ（欠けは ±∞ 扱い）
  const jobLo = amounts.min ?? -Infinity;
  const jobHi = amounts.max ?? Infinity;

  // 下限指定: 案件の下限がフィルタ最小以上であること
  if (filterMin != null && jobLo < filterMin) return false;
  // 上限指定: 案件の上限がフィルタ最大以下であること
  if (filterMax != null && jobHi > filterMax) return false;

  return true;
}
