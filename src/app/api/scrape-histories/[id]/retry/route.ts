import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { err, ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const existing = await db.scrapeHistory.findUnique({
    where: { id },
    select: {
      sourceId: true,
      source: { select: { platform: true } },
    },
  });

  if (!existing) return err("History row not found", 404);

  const workerHost = process.env.WORKER_HOST ?? "dashboard-manual";

  const row = await db.scrapeHistory.create({
    data: {
      sourceId: existing.sourceId,
      success: false,
      jobsFound: 0,
      logs: [
        { level: "info", msg: `manual_retry_from:${id}`, at: new Date().toISOString() },
      ] as Prisma.InputJsonValue,
      retryCount: 0,
      workerHost,
      errorMessage: null,
      finishedAt: null,
    },
  });

  return ok({
    id: row.id,
    queuedFor: existing.source.platform,
    message: "Queued scrape record — attach your worker consumer to consume this row.",
  });
}
