import { Prisma } from "@prisma/client";
import { z } from "zod";

import { ok, err } from "@/lib/api-response";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const patchSchema = z.array(
  z.object({
    key: z.string().min(1),
    value: z.unknown(),
  }),
);

export async function GET() {
  const rows = await db.appSetting.findMany({ orderBy: { key: "asc" } });
  return ok({ settings: rows });
}

export async function PATCH(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return err("Expected JSON array {key,value}", 422);

  for (const item of parsed.data) {
    const asJson = item.value as Prisma.InputJsonValue;
    await db.appSetting.upsert({
      where: { key: item.key },
      create: { key: item.key, value: asJson },
      update: { value: asJson },
    });
  }

  const rows = await db.appSetting.findMany({ orderBy: { key: "asc" } });
  return ok({ settings: rows });
}
