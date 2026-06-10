import { detectedJobBulkSchema } from "@/lib/schemas/detected-job";
import { db } from "@/lib/db";
import { err, ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = detectedJobBulkSchema.safeParse(json);
  if (!parsed.success) return err("Validation failed", 422, { details: parsed.error.flatten() });

  const result = await db.detectedJob.updateMany({
    where: { id: { in: parsed.data.ids } },
    data: { notificationSent: parsed.data.notificationSent },
  });

  return ok({ updated: result.count });
}
