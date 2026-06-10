import { db } from "@/lib/db";
import { ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.scrapeHistory.findMany({
    take: 160,
    orderBy: { startedAt: "desc" },
    include: { source: { select: { platform: true, url: true, scrapingType: true } } },
  });
  const data = rows.map((h) => ({
    ...h,
    platform: h.source.platform,
    scrapingType: h.source.scrapingType,
    listingUrl: h.source.url,
    listingUrlSlice: h.source.url.slice(0, 120),
    durationMs:
      h.finishedAt !== null ? h.finishedAt.getTime() - h.startedAt.getTime() : null,
  }));

  return ok(data);
}
