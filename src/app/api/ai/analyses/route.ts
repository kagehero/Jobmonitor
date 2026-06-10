import { db } from "@/lib/db";
import { ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.aiAnalysis.findMany({
    include: {
      job: {
        select: {
          title: true,
          projectUrl: true,
          source: { select: { platform: true } },
        },
      },
    },
    orderBy: { relevanceScore: "desc" },
    take: 200,
  });

  const distribution = rows.map((r, idx) => ({
    idx,
    relevance: Number((r.relevanceScore * 100).toFixed(1)),
    profit: Number((r.profitabilityScore * 100).toFixed(1)),
    urgency: Number((r.urgencyScore * 100).toFixed(1)),
  }));

  return ok({ analyses: rows, distribution });
}
