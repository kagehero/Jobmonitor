import { detectedJobPatchSchema } from "@/lib/schemas/detected-job";
import { stripUndefined } from "@/lib/strip";
import { db } from "@/lib/db";
import { err, ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = detectedJobPatchSchema.safeParse(json);
  if (!parsed.success) return err("Validation failed", 422, { details: parsed.error.flatten() });

  try {
    const row = await db.detectedJob.update({
      where: { id },
      data: stripUndefined(parsed.data as Record<string, unknown>),
    });
    return ok(row);
  } catch {
    return err("Job not found", 404);
  }
}
