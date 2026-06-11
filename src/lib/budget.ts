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
