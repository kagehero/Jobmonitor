import { monitoringSourceUpdateSchema } from "@/lib/schemas/monitoring-source";
import { stripUndefined } from "@/lib/strip";
import { db } from "@/lib/db";
import { err, ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return err("Invalid JSON body");
  }
  const parsed = monitoringSourceUpdateSchema.safeParse(json);
  if (!parsed.success)
    return err("Validation failed", 422, { details: parsed.error.flatten() });

  try {
    const row = await db.monitoringSource.update({
      where: { id },
      data: stripUndefined(parsed.data as Record<string, unknown>),
    });
    return ok(row);
  } catch {
    return err("Source not found", 404);
  }
}

export async function DELETE(_: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  try {
    await db.monitoringSource.delete({ where: { id } });
    return ok({ id });
  } catch {
    return err("Source not found", 404);
  }
}
