import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/** Same window as jobs UI “Fresh” badge (last 2 hours). */
const FRESH_WINDOW_MS = 2 * 60 * 60 * 1000;

type BoardPf = "lw" | "cw";
type BoardCat = "system" | "web";

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

/** Lancers は ``/work/search/{slug}``、CrowdWorks は ``category_id=226|230``（システム / Web）。 */
function boardCategoryPredicate(cat: BoardCat, pf?: BoardPf): Prisma.DetectedJobWhereInput {
  const lSlug = cat === "system" ? "system" : "web";
  const cwId = cat === "system" ? "226" : "230";

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

  if (pf === "lw") return lancersPred;
  if (pf === "cw") return crowdPred;
  return { OR: [lancersPred, crowdPred] };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const platform = searchParams.get("platform")?.trim();
  const tag = searchParams.get("tag")?.trim();
  const boardPf = normalizeBoardPf(searchParams.get("boardPf"));
  const boardCat = normalizeBoardCat(searchParams.get("boardCat"));

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

  const where: Prisma.DetectedJobWhereInput =
    andBlocks.length === 0 ? {} : andBlocks.length === 1 ? andBlocks[0]! : { AND: andBlocks };

  const sort = searchParams.get("sort")?.trim();
  const orderBy: Prisma.DetectedJobOrderByWithRelationInput =
    sort === "score"
      ? { aiScore: "desc" }
      : sort === "posted"
        ? { postedAt: "desc" }
        : { detectedAt: "desc" };

  const freshSince = new Date(Date.now() - FRESH_WINDOW_MS);
  const whereFresh: Prisma.DetectedJobWhereInput = {
    ...where,
    detectedAt: { gte: freshSince },
  };

  const skip = (page - 1) * limit;

  const [total, freshInWindow, rows] = await Promise.all([
    db.detectedJob.count({ where }),
    db.detectedJob.count({ where: whereFresh }),
    db.detectedJob.findMany({
      where,
      include: {
        source: { select: { platform: true, url: true } },
        discordNotifications: { take: 1, orderBy: { sentAt: "desc" } },
        aiAnalysis: true,
      },
      orderBy,
      skip,
      take: limit,
    }),
  ]);

  const mapped = rows.map((job) => ({
    ...job,
    platform: job.source.platform,
    sourceUrl: job.source.url,
    aiScoreNormalized: job.aiAnalysis?.relevanceScore ?? job.aiScore,
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
  });
}
