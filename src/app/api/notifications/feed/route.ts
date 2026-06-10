import { db } from "@/lib/db";
import { err, ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const MAX_TAKE = 80;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const afterRaw = searchParams.get("after")?.trim();
  if (!afterRaw) return err("Missing `after` (ISO datetime watermark)", 422);

  const limitRaw = searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitRaw ?? "30", 10) || 30, 1), MAX_TAKE);

  const after = new Date(afterRaw);
  if (Number.isNaN(after.getTime())) return err("Invalid `after` datetime", 422);

  const where = { detectedAt: { gt: after } };

  const [items, totalUnread] = await Promise.all([
    db.detectedJob.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        detectedAt: true,
        projectUrl: true,
        source: { select: { platform: true, scrapingType: true } },
      },
    }),
    db.detectedJob.count({ where }),
  ]);

  return ok({
    items: items.map((j) => ({
      id: j.id,
      title: j.title,
      detectedAt: j.detectedAt.toISOString(),
      projectUrl: j.projectUrl,
      platform: j.source.platform,
      scrapingType: j.source.scrapingType,
    })),
    totalUnread,
  });
}
