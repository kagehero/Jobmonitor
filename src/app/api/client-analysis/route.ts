import { aggregateClientAnalysis } from "@/lib/client-analysis";
import { ok } from "@/lib/api-response";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const DEFAULT_SCAN = 8000;
const MAX_SCAN = 15_000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawLim = parseInt(searchParams.get("limit") ?? String(DEFAULT_SCAN), 10);
  const limit = Number.isFinite(rawLim)
    ? Math.min(MAX_SCAN, Math.max(100, rawLim))
    : DEFAULT_SCAN;

  const rows = await db.detectedJob.findMany({
    orderBy: { detectedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      projectUrl: true,
      detectedAt: true,
      clientName: true,
      clientProfileUrl: true,
      clientOrders: true,
      clientRating: true,
      clientExtrasSummary: true,
      clientAvatarUrl: true,
      source: { select: { platform: true } },
    },
  });

  const inputs = rows.map((r) => {
    const rawR = r.clientRating != null ? Number(r.clientRating) : null;
    const clientRating = rawR != null && Number.isFinite(rawR) ? rawR : null;
    return {
      id: r.id,
      title: r.title,
      projectUrl: r.projectUrl,
      detectedAt: r.detectedAt,
      clientName: r.clientName,
      clientProfileUrl: r.clientProfileUrl,
      clientOrders: r.clientOrders,
      clientRating,
      clientExtrasSummary: r.clientExtrasSummary,
      clientAvatarUrl: r.clientAvatarUrl,
      platform: r.source.platform,
    };
  });

  const { summary, clients } = aggregateClientAnalysis(inputs);

  return ok({
    summary,
    clients,
    scan: { limit, orderedBy: "detectedAt_desc" as const },
  });
}
