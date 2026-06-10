import { db } from "@/lib/db";
import { ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/** Newest detectedAt in DB — used to bootstrap local last-read without flooding backlog as “unread”. */
export async function GET() {
  const row = await db.detectedJob.findFirst({
    orderBy: { detectedAt: "desc" },
    select: { detectedAt: true },
  });
  return ok({ newestDetectedAt: row?.detectedAt?.toISOString() ?? null });
}
