/** Aggregate detected jobs into per-client rows for the client analysis dashboard. */

export type DetectedJobClientInput = {
  id: string;
  title: string;
  projectUrl: string;
  detectedAt: Date;
  clientName: string;
  clientProfileUrl: string | null;
  clientOrders: string | null;
  clientRating: number | null;
  clientExtrasSummary: string | null;
  clientAvatarUrl: string | null;
  platform: string;
};

export type ClientAnalysisSummary = {
  scannedJobs: number;
  jobsWithClientIdentity: number;
  uniqueClients: number;
  clientsWithProfileUrl: number;
  avgRating: number | null;
  platformMix: { platform: string; jobCount: number }[];
};

export type ClientAnalysisRow = {
  key: string;
  kind: "profile" | "name";
  profilePath: string | null;
  displayName: string;
  platforms: string[];
  /** 当スキャン内でこのクライアントキーに紐づく検出求人件数（募集実績ソートとは別） */
  jobCount: number;
  lastDetectedAt: string;
  latestJobTitle: string;
  latestJobUrl: string;
  ordersDisplay: string | null;
  ratingDisplay: number | null;
  extrasPreview: string | null;
  /** 最新検出求人に紐づく補足全文（詳細 UI 向け） */
  extrasFull: string | null;
  avatarUrl: string | null;
  /**
   * CrowdWorks: 補足の「募集実績 N」。Lancers: 同文言が無い場合は発注数（一覧の発注数）を数値化したもの。
   * 取得できない場合は null（ソートでは欠損扱い）。
   */
  recruitmentAchievement: number | null;
};

/** Canonical path for grouping (``/client/foo``, ``/public/employers/123``). */
export function normalizeProfileKey(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  try {
    if (/^https?:\/\//i.test(t)) {
      const path = new URL(t).pathname.replace(/\/+$/, "") || "/";
      return path;
    }
  } catch {
    /* ignore */
  }
  const path = t.startsWith("/") ? t : `/${t}`;
  const trimmed = path.replace(/\/+$/, "") || "/";
  return trimmed === "/" ? null : trimmed;
}

/** CrowdWorks 等の補足に含まれる「募集実績 N」から N を抽出する。 */
export function parseRecruitmentAchievementFromExtras(text: string | null | undefined): number | null {
  if (!text?.trim()) return null;
  const m = /募集実績\s*[:：]?\s*([\d,\s]+)/.exec(text);
  if (!m?.[1]) return null;
  const n = parseInt(m[1].replace(/[\s,]/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Lancers の発注数（数字のみの文字列）を整数化。単位などが混じるときは null。 */
function parseLancersOrderDisplayAsCount(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const t = raw.trim().replace(/[\s,]/g, "");
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** プラットフォーム別のヒューリスティックで「募集実績」相当の数値をひとつにまとめる。 */
export function aggregatedRecruitmentAchievement(row: {
  platforms: Iterable<string>;
  extrasFull: string | null;
  extrasPreview: string | null;
  ordersDisplay: string | null;
}): number | null {
  const ex = row.extrasFull?.trim() || row.extrasPreview?.trim();
  const fromCw = parseRecruitmentAchievementFromExtras(ex);
  if (fromCw !== null) return fromCw;
  const platStr = [...row.platforms].join(" ").toLowerCase();
  if (platStr.includes("lancer")) {
    const o = parseLancersOrderDisplayAsCount(row.ordersDisplay);
    if (o !== null) return o;
  }
  return null;
}

/** 欠損は数値ありより常に後ろ。数値同士は ``dir`` に従う。 */
export function compareRecruitmentAchievementSort(
  a: number | null,
  b: number | null,
  dir: "asc" | "desc",
): number {
  const am = a == null;
  const bm = b == null;
  if (am && bm) return 0;
  if (am) return 1;
  if (bm) return -1;
  const d = a! - b!;
  return dir === "desc" ? -d : d;
}

export function absoluteProfileUrl(platforms: string[], profilePath: string | null): string | null {
  if (!profilePath?.trim()) return null;
  const p = profilePath.trim();
  if (p.startsWith("http://") || p.startsWith("https://")) return p;

  const lower = platforms.map((x) => x.toLowerCase());
  const anyCw = lower.some((x) => x.includes("crowd"));
  const anyLan = lower.some((x) => x.includes("lancer"));

  const path = p.startsWith("/") ? p : `/${p}`;
  if (path.includes("/employers") || path.includes("/public/")) {
    return `https://crowdworks.jp${path}`;
  }
  if (path.includes("/client/")) {
    return `https://www.lancers.jp${path}`;
  }
  if (anyCw && !anyLan) return `https://crowdworks.jp${path}`;
  if (anyLan && !anyCw) return `https://www.lancers.jp${path}`;
  return `https://www.lancers.jp${path}`;
}

function computeAggregationKey(row: DetectedJobClientInput): string | null {
  const pk = normalizeProfileKey(row.clientProfileUrl);
  if (pk) return `pf:${pk}`;
  const name = row.clientName.trim().toLowerCase();
  if (!name) return null;
  return `nm:${row.platform}:${name}`;
}

type MutableAgg = {
  key: string;
  kind: "profile" | "name";
  profilePath: string | null;
  displayName: string;
  platforms: Set<string>;
  jobCount: number;
  lastDetectedAt: Date;
  latestJobTitle: string;
  latestJobUrl: string;
  ordersDisplay: string | null;
  ratingDisplay: number | null;
  /** 一覧・表用（抜粋） */
  extrasPreview: string | null;
  /** 最新検出求人に紐づく補足全文（詳細 UI 向け） */
  extrasFull: string | null;
  avatarUrl: string | null;
};

export function aggregateClientAnalysis(rows: DetectedJobClientInput[]): {
  summary: ClientAnalysisSummary;
  clients: ClientAnalysisRow[];
} {
  let jobsWithClientIdentity = 0;
  const platformCounts = new Map<string, number>();
  const map = new Map<string, MutableAgg>();

  for (const row of rows) {
    const plat = row.platform.trim() || "Unknown";
    platformCounts.set(plat, (platformCounts.get(plat) ?? 0) + 1);

    const aggKey = computeAggregationKey(row);
    if (!aggKey) continue;
    jobsWithClientIdentity++;

    const profilePath = normalizeProfileKey(row.clientProfileUrl);
    const kind: "profile" | "name" = profilePath ? "profile" : "name";

    let agg = map.get(aggKey);
    if (!agg) {
      agg = {
        key: aggKey,
        kind,
        profilePath,
        displayName: row.clientName.trim() || "(名称未取得)",
        platforms: new Set([plat]),
        jobCount: 0,
        lastDetectedAt: row.detectedAt,
        latestJobTitle: row.title,
        latestJobUrl: row.projectUrl,
        ordersDisplay: row.clientOrders?.trim() || null,
        ratingDisplay:
          typeof row.clientRating === "number" && Number.isFinite(row.clientRating)
            ? row.clientRating
            : null,
        extrasPreview: row.clientExtrasSummary?.trim().slice(0, 600) || null,
        extrasFull: row.clientExtrasSummary?.trim() || null,
        avatarUrl: row.clientAvatarUrl?.trim() || null,
      };
      map.set(aggKey, agg);
    }

    agg.jobCount++;
    agg.platforms.add(plat);

    const nm = row.clientName.trim();
    if (nm.length > agg.displayName.length) agg.displayName = nm;

    if (row.detectedAt > agg.lastDetectedAt) {
      agg.lastDetectedAt = row.detectedAt;
      agg.latestJobTitle = row.title;
      agg.latestJobUrl = row.projectUrl;
      agg.ordersDisplay = row.clientOrders?.trim() || agg.ordersDisplay;
      agg.ratingDisplay =
        typeof row.clientRating === "number" && Number.isFinite(row.clientRating)
          ? row.clientRating
          : agg.ratingDisplay;
      const ex = row.clientExtrasSummary?.trim();
      if (ex) {
        agg.extrasPreview = ex.slice(0, 600);
        agg.extrasFull = ex;
      }
      const av = row.clientAvatarUrl?.trim();
      agg.avatarUrl = av || agg.avatarUrl;
    }
  }

  const ratings: number[] = [];
  for (const c of map.values()) {
    if (typeof c.ratingDisplay === "number" && Number.isFinite(c.ratingDisplay)) {
      ratings.push(c.ratingDisplay);
    }
  }
  const avgRating =
    ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  const platformMix = [...platformCounts.entries()]
    .map(([platform, jobCount]) => ({ platform, jobCount }))
    .sort((a, b) => b.jobCount - a.jobCount);

  const clientsWithProfileUrl = [...map.values()].filter((c) => c.kind === "profile").length;

  const clients: ClientAnalysisRow[] = [...map.values()].map((c) => {
    const recruitmentAchievement = aggregatedRecruitmentAchievement({
      platforms: c.platforms,
      extrasFull: c.extrasFull,
      extrasPreview: c.extrasPreview,
      ordersDisplay: c.ordersDisplay,
    });
    return {
      key: c.key,
      kind: c.kind,
      profilePath: c.profilePath,
      displayName: c.displayName,
      platforms: [...c.platforms].sort(),
      jobCount: c.jobCount,
      lastDetectedAt: c.lastDetectedAt.toISOString(),
      latestJobTitle: c.latestJobTitle,
      latestJobUrl: c.latestJobUrl,
      ordersDisplay: c.ordersDisplay,
      ratingDisplay: c.ratingDisplay,
      extrasPreview: c.extrasPreview,
      extrasFull: c.extrasFull,
      avatarUrl: c.avatarUrl,
      recruitmentAchievement,
    };
  });

  clients.sort((a, b) => {
    let cmp = compareRecruitmentAchievementSort(a.recruitmentAchievement, b.recruitmentAchievement, "desc");
    if (cmp !== 0) return cmp;
    cmp = b.jobCount - a.jobCount;
    if (cmp !== 0) return cmp;
    return Date.parse(b.lastDetectedAt) - Date.parse(a.lastDetectedAt);
  });

  return {
    summary: {
      scannedJobs: rows.length,
      jobsWithClientIdentity,
      uniqueClients: map.size,
      clientsWithProfileUrl,
      avgRating,
      platformMix,
    },
    clients,
  };
}
