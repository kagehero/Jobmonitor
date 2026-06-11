import type { Prisma, JobStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { ok } from "@/lib/api-response";
import { JOB_STATUS_VALUES } from "@/lib/job-status";
import {
  JOB_KEYWORDS_SETTING_KEY,
  keywordsFromSettingValue,
} from "@/lib/job-keywords";
import { parseBudgetAmounts, budgetMatchesRange } from "@/lib/budget";

export const dynamic = "force-dynamic";

/** Same window as jobs UI “Fresh” badge (last 2 hours). */
const FRESH_WINDOW_MS = 2 * 60 * 60 * 1000;

type BoardPf = "lw" | "cw";
type BoardCat = "system" | "web" | "ai";

function normalizeBoardPf(raw: string | null | undefined): BoardPf | undefined {
  const v = raw?.trim().toLowerCase();
  if (!v) return undefined;
  if (v === "lw") return "lw";
  if (v === "cw") return "cw";
  return undefined;
}

function normalizeBoardCat(raw: string | null | undefined): BoardCat | undefined {
  const v = raw?.trim().toLowerCase();
  if (!v) return undefined;
  if (v === "system") return "system";
  if (v === "web") return "web";
  if (v === "ai") return "ai";
  return undefined;
}

function boardPlatformPredicate(pf: BoardPf): Prisma.DetectedJobWhereInput {
  if (pf === "lw") {
    return {
      source: { platform: { contains: "lancers", mode: "insensitive" } },
    };
  }
  return {
    source: { platform: { contains: "crowd", mode: "insensitive" } },
  };
}

/**
 * Lancers は ``/work/search/{slug}``、CrowdWorks は ``category_id=226|230|311``（システム / Web / AI）。
 * AI は CrowdWorks 専用カテゴリ（Lancers に対応 slug なし）のため、CrowdWorks 述語のみを返す。
 */
function boardCategoryPredicate(cat: BoardCat, pf?: BoardPf): Prisma.DetectedJobWhereInput {
  const cwId = cat === "system" ? "226" : cat === "web" ? "230" : "311";

  const crowdPred: Prisma.DetectedJobWhereInput = {
    AND: [
      { source: { platform: { contains: "crowd", mode: "insensitive" } } },
      {
        source: {
          url: {
            contains: `category_id=${cwId}`,
            mode: "insensitive",
          },
        },
      },
    ],
  };

  // AI は CrowdWorks のみ。プラットフォーム指定に関わらず CrowdWorks 述語を使う。
  if (cat === "ai") return crowdPred;

  const lSlug = cat === "system" ? "system" : "web";
  const lancersPred: Prisma.DetectedJobWhereInput = {
    AND: [
      { source: { platform: { contains: "lancers", mode: "insensitive" } } },
      {
        source: {
          url: {
            contains: `/work/search/${lSlug}`,
            mode: "insensitive",
          },
        },
      },
    ],
  };

  if (pf === "lw") return lancersPred;
  if (pf === "cw") return crowdPred;
  return { OR: [lancersPred, crowdPred] };
}

/**
 * ダッシュボードで設定した「ジョブ絞り込みキーワード」を OR 一致で適用する述語。
 * いずれかのキーワードがタイトル／説明文に含まれる案件だけを残す。
 * キーワード未設定（空配列）の場合は ``null`` を返し、絞り込みを行わない。
 */
function keywordPredicate(keywords: string[]): Prisma.DetectedJobWhereInput | null {
  if (keywords.length === 0) return null;
  return {
    OR: keywords.flatMap((kw) => [
      { title: { contains: kw, mode: "insensitive" as const } },
      { description: { contains: kw, mode: "insensitive" as const } },
    ]),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const platform = searchParams.get("platform")?.trim();
  const tag = searchParams.get("tag")?.trim();
  const boardPf = normalizeBoardPf(searchParams.get("boardPf"));
  const boardCat = normalizeBoardCat(searchParams.get("boardCat"));
  // キーワード絞り込み（OR 一致）。`keywords` パラメータの解釈は次のとおり:
  //  - 未指定・空        → 絞り込みなし
  //  - 1 / true / on    → 設定済み（job_keywords）の全キーワードを使用（後方互換）
  //  - "Python,PHP"     → そのうち設定済みキーワードに一致するものだけを使用（個別選択）
  const keywordsParamRaw = (searchParams.get("keywords") ?? "").trim();
  const keywordsUseAll = ["1", "true", "on"].includes(keywordsParamRaw.toLowerCase());
  const keywordsRequested = keywordsUseAll
    ? []
    : keywordsParamRaw
        ? keywordsParamRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
  // 絞り込みを行うか（全件指定 or 個別指定が 1 つ以上）。
  const keywordsFilterOn = keywordsUseAll || keywordsRequested.length > 0;

  // 見積（予算）レンジフィルタ（円）。budget 文字列から金額を抽出してアプリ側で判定する。
  const parseYenParam = (raw: string | null): number | null => {
    if (!raw) return null;
    const n = parseInt(raw.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const budgetMin = parseYenParam(searchParams.get("budgetMin"));
  const budgetMax = parseYenParam(searchParams.get("budgetMax"));
  const budgetFilterOn = budgetMin != null || budgetMax != null;
  // 金額不明案件（応相談・要確認）を含めるか。既定は含める（true）。
  // budgetIncludeUnknown=0/false/off のときだけ除外する。
  const budgetIncludeUnknown = !["0", "false", "off"].includes(
    (searchParams.get("budgetIncludeUnknown") ?? "").trim().toLowerCase(),
  );

  // status=APPLIED,INTERVIEW のようにカンマ区切りで複数指定（複数選択フィルタ）
  const statusSet = new Set<string>(JOB_STATUS_VALUES);
  const statuses = (searchParams.get("status") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => statusSet.has(s)) as JobStatus[];

  const pageRaw = parseInt(searchParams.get("page") ?? "1", 10);
  const limitRaw = parseInt(searchParams.get("limit") ?? "20", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) && limitRaw >= 1 ? limitRaw : 20, 1), 100);

  const andBlocks: Prisma.DetectedJobWhereInput[] = [];

  if (q) {
    andBlocks.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { clientName: { contains: q, mode: "insensitive" } },
        { budget: { contains: q, mode: "insensitive" } },
        { clientExtrasSummary: { contains: q, mode: "insensitive" } },
        { clientOrders: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (platform) {
    andBlocks.push({ source: { platform: { equals: platform, mode: "insensitive" } } });
  }

  if (tag) {
    andBlocks.push({ tags: { has: tag } });
  }

  if (boardPf) {
    andBlocks.push(boardPlatformPredicate(boardPf));
  }

  if (boardCat) {
    andBlocks.push(boardCategoryPredicate(boardCat, boardPf));
  }

  if (statuses.length > 0) {
    andBlocks.push({ status: { in: statuses } });
  }

  // 設定済みキーワードフィルタ。`keywords` パラメータで全件 or 個別選択を適用する。
  // 個別指定の場合は、設定済みキーワードに一致するものだけを採用（未知の語は無視）。
  let savedKeywords: string[] = [];
  let appliedKeywords: string[] = [];
  if (keywordsFilterOn) {
    const row = await db.appSetting.findUnique({
      where: { key: JOB_KEYWORDS_SETTING_KEY },
    });
    savedKeywords = keywordsFromSettingValue(row?.value);

    if (keywordsUseAll) {
      appliedKeywords = savedKeywords;
    } else {
      const requestedLower = new Set(keywordsRequested.map((k) => k.toLowerCase()));
      appliedKeywords = savedKeywords.filter((k) => requestedLower.has(k.toLowerCase()));
    }

    const pred = keywordPredicate(appliedKeywords);
    if (pred) andBlocks.push(pred);
  }

  const where: Prisma.DetectedJobWhereInput =
    andBlocks.length === 0 ? {} : andBlocks.length === 1 ? andBlocks[0]! : { AND: andBlocks };

  const sort = searchParams.get("sort")?.trim();
  const orderBy: Prisma.DetectedJobOrderByWithRelationInput =
    sort === "posted" ? { postedAt: "desc" } : { detectedAt: "desc" };

  const freshSince = new Date(Date.now() - FRESH_WINDOW_MS);
  const whereFresh: Prisma.DetectedJobWhereInput = {
    ...where,
    detectedAt: { gte: freshSince },
  };

  const include = {
    source: { select: { platform: true, url: true } },
    discordNotifications: { take: 1, orderBy: { sentAt: "desc" as const } },
  };

  const freshThreshold = freshSince.getTime();

  let total: number;
  let freshInWindow: number;
  let rows: Prisma.DetectedJobGetPayload<{ include: typeof include }>[];

  if (!budgetFilterOn) {
    // 予算フィルタなし: 従来どおり DB 側で件数カウント＆ページング（効率的）。
    const skip = (page - 1) * limit;
    [total, freshInWindow, rows] = await Promise.all([
      db.detectedJob.count({ where }),
      db.detectedJob.count({ where: whereFresh }),
      db.detectedJob.findMany({ where, include, orderBy, skip, take: limit }),
    ]);
  } else {
    // 予算フィルタあり: budget は文字列のため SQL で範囲判定できない。
    // 他フィルタを適用した全件を取得し、抽出金額でアプリ側フィルタ→ページング。
    // （データ規模が小さい前提。大規模化したら budget の数値列を別途持たせる。）
    const allRows = await db.detectedJob.findMany({ where, include, orderBy });
    const matched = allRows.filter((job) =>
      budgetMatchesRange(parseBudgetAmounts(job.budget), budgetMin, budgetMax, budgetIncludeUnknown),
    );

    total = matched.length;
    freshInWindow = matched.filter(
      (job) => new Date(job.detectedAt).getTime() >= freshThreshold,
    ).length;

    const skip = (page - 1) * limit;
    rows = matched.slice(skip, skip + limit);
  }

  const mapped = rows.map((job) => ({
    ...job,
    platform: job.source.platform,
    sourceUrl: job.source.url,
    notificationStatus:
      job.discordNotifications[0]?.status ??
      (job.notificationSent ? ("SENT" as const) : ("PENDING" as const)),
  }));

  return ok({
    jobs: mapped,
    total,
    page,
    limit,
    freshInWindow,
    totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    // キーワードフィルタの状態。
    //  - active   : 絞り込みを適用したか
    //  - keywords : 実際に適用したキーワード（OR 一致）
    //  - saved    : 設定済みキーワード（個別トグルの選択肢）
    keywordFilter: { active: keywordsFilterOn, keywords: appliedKeywords, saved: savedKeywords },
    // 見積（予算）レンジフィルタの状態。
    budgetFilter: {
      active: budgetFilterOn,
      min: budgetMin,
      max: budgetMax,
      includeUnknown: budgetIncludeUnknown,
    },
  });
}
