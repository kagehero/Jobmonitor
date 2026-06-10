/**
 * Pure helpers: 監視ソースのプラットフォームと一覧 URL から求人ボード上の一覧カテゴリを決める。
 * UI（PostingSourceBadges）はここを import して表示に使う。
 */

/** よくある Lancers 「/work/search/{slug}」の略称（URLスラグ → 一覧カテゴリ表示）。 */
export const LANCERS_SLUG_LABEL: Record<string, string> = {
  system: "システム",
  web: "Web",
  design: "デザイン",
  illustration: "イラスト",
  writing: "ライティング",
  translation: "翻訳",
  business: "事務・秘書",
  sales: "営業",
  multimedia: "映像・音響",
  data_entry: "データ入力",
  marketing: "マーケティング",
  seo: "SEO",
  sns: "SNS運用",
  customer_support: "カスタマー",
  ecommerce: "EC",
  cad: "CAD",
  semiconductor: "半導体",
};

/** CrowdWorks 検索 ``category_id``（monitor のデフォルト 226/230 など）。未知は #ID で示す。 */
export const CROWDWORKS_CATEGORY_LABEL: Record<string, string> = {
  "226": "システム",
  "230": "Web",
};

export function abbreviatePostingPlatform(platformRaw: string): { abbr: string; tonesKey: string; fullJa: string } {
  const s = platformRaw.trim();
  const low = s.toLowerCase();
  if (low.includes("lancers")) {
    return { abbr: "LW", tonesKey: "lancers", fullJa: "ランサーズ" };
  }
  if (low.includes("crowd") || low.includes("cloudwork")) {
    return { abbr: "CW", tonesKey: "crowdworks", fullJa: "クラウドワークス" };
  }
  const abbr = (s.slice(0, 2) || "?").toUpperCase();
  return { abbr, tonesKey: s || "unknown", fullJa: s || "不明" };
}

/** 求人ボード上の一覧を「システム / Web / その他」へまとめる桶。 */
export type JobBoardCategoryTriple = "system" | "web" | "misc";

export const JOB_BOARD_TRIPLE_LABEL: Record<JobBoardCategoryTriple, string> = {
  system: "システム",
  web: "Web",
  misc: "その他",
};

function tripleFromLancersPath(pathname: string): JobBoardCategoryTriple {
  const segs = pathname.replace(/^\//u, "").split("/").filter(Boolean);
  let slug = "";
  if (segs[0] === "work" && segs[1] === "search" && segs[2]) slug = segs[2].replace(/^\s+|\s+$/gu, "");
  if (slug === "system") return "system";
  if (slug === "web") return "web";
  return "misc";
}

function tripleFromCrowdWorksSearch(u: URL): JobBoardCategoryTriple {
  const id = u.searchParams.get("category_id") ?? u.searchParams.get("categoryId");
  if (id === "226") return "system";
  if (id === "230") return "web";
  return "misc";
}

/**
 * 監視URL（および解釈不能時のクエリ文字列）から一覧の大分類桶を決める。
 * Lancers: `/work/search/system` / `web` のみシステム・Web、それ以外はその他。
 * CrowdWorks: `category_id` 226 / 230 のみシステム・Web、それ以外はその他。
 */
export function jobBoardCategoryTriple(platformRaw: string, listingUrlRaw: string | undefined | null): JobBoardCategoryTriple {
  const u = safeListingUrl(listingUrlRaw);
  if (u) {
    const host = u.hostname.toLowerCase();
    if (host.endsWith("lancers.jp") || host.endsWith("www.lancers.jp")) return tripleFromLancersPath(u.pathname);
    if (host.endsWith("crowdworks.jp")) return tripleFromCrowdWorksSearch(u);
  }
  const raw = (listingUrlRaw ?? "").trim();
  if (/[?&#](?:category_id|categoryId)=226\b/i.test(raw)) return "system";
  if (/[?&#](?:category_id|categoryId)=230\b/i.test(raw)) return "web";
  if (/\/work\/search\/system(?:\/|$|\?|\#)/i.test(raw)) return "system";
  if (/\/work\/search\/web(?:\/|$|\?|\#)/i.test(raw)) return "web";
  return "misc";
}

/** Recharts 用の安定キー（大分類3桶）。 */
export function postingCategoryTripleChartKey(triple: JobBoardCategoryTriple): string {
  switch (triple) {
    case "system":
      return "cn_cat_system";
    case "web":
      return "cn_cat_web";
    default:
      return "cn_cat_other";
  }
}

export function safeListingUrl(raw: string | undefined | null): URL | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  try {
    return new URL(t);
  } catch {
    try {
      return new URL(/^https?:/i.test(t) ? t : `https://${t}`);
    } catch {
      return null;
    }
  }
}

function pathSuffixHint(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const tail = parts[parts.length - 1];
  return tail ? tail.slice(0, 12).toUpperCase() : "募集";
}

/** 「一覧カテゴリ」の短文（大分類: システム / Web / その他）と Tooltip（細かい一覧区分込み）。 */
export function postingBoardCategory(platformRaw: string, listingUrlRaw: string | undefined | null): {
  short: string;
  detailLines: string[];
} {
  const pf = abbreviatePostingPlatform(platformRaw);
  const u = safeListingUrl(listingUrlRaw);
  const host = u?.hostname.toLowerCase() ?? "";
  const urlLine = listingUrlRaw?.trim() || "(監視URLなし)";
  const triple = jobBoardCategoryTriple(platformRaw, listingUrlRaw);
  const groupLabel = JOB_BOARD_TRIPLE_LABEL[triple];

  if (!u) {
    return {
      short: groupLabel,
      detailLines: [
        `${pf.fullJa}`,
        `大分類: ${groupLabel}`,
        listingUrlRaw ? "URL を解釈できませんでした。パスまたはクエリを確認してください。" : "一覧URL が渡されていません。",
        "",
        `値: ${urlLine}`,
      ],
    };
  }

  if (host.endsWith("lancers.jp") || host.endsWith("www.lancers.jp")) {
    const segs = u.pathname.replace(/^\//u, "").split("/").filter(Boolean);
    let slug = "";
    if (segs[0] === "work" && segs[1] === "search" && segs[2]) {
      slug = segs[2].replace(/^\s+|\s+$/gu, "");
    }
    const label = slug ? (LANCERS_SLUG_LABEL[slug] ?? slug.replace(/-/g, " ").toUpperCase()) : "検索";
    return {
      short: groupLabel,
      detailLines: [
        `${pf.fullJa}（${pf.abbr}）`,
        `大分類: ${groupLabel}`,
        `ランサーワーク求人の一覧区分: 「${label}」（URLスラグ: ${slug || "―"}）`,
        "",
        `一覧URL: ${urlLine}`,
      ],
    };
  }

  if (host.endsWith("crowdworks.jp")) {
    const id = u.searchParams.get("category_id") ?? u.searchParams.get("categoryId");
    const label =
      id != null ? (CROWDWORKS_CATEGORY_LABEL[id] ?? `#${id}`) : pathSuffixHint(u.pathname);
    const idPart =
      id != null
        ? `category_id=${id}（標準では 226=システム開発、230=Web制作）`
        : "クエリ category_id が見つからない場合のパス推定";

    return {
      short: groupLabel,
      detailLines: [
        `${pf.fullJa}（${pf.abbr}）`,
        `大分類: ${groupLabel}`,
        `クラウドワークス募集一覧のカテゴリ区分: 「${label}」 — ${idPart}`,
        "",
        `一覧URL: ${urlLine}`,
      ],
    };
  }

  return {
    short: groupLabel,
    detailLines: [
      `${pf.fullJa}（${pf.abbr}）`,
      `大分類: ${groupLabel}`,
      `ホスト「${host}」の求人カテゴリはマッピングしていません`,
      "",
      `一覧URL: ${urlLine}`,
    ],
  };
}

/** 統計・検索キー向けの大分類ラベル（システム / Web / その他）。 */
export function postingBoardCategoryShort(platformRaw: string, listingUrlRaw: string | undefined | null): string {
  return JOB_BOARD_TRIPLE_LABEL[jobBoardCategoryTriple(platformRaw, listingUrlRaw)];
}

/** カウント用プラットフォーム桶（求人テーブルの集計チャート）。 */
export function bucketPlatformForStats(platformRaw: string): "lancers" | "crowdworks" | "other" {
  const low = platformRaw.toLowerCase();
  if (low.includes("lancer")) return "lancers";
  if (low.includes("crowd") || low.includes("cloudwork")) return "crowdworks";
  return "other";
}

