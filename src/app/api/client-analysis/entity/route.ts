import { z } from "zod";

import { ok, err } from "@/lib/api-response";
import { db } from "@/lib/db";
import { normalizeProfileKey } from "@/lib/client-analysis";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  profileKey: z.string().min(1),
  /** UNKNOWN を指定すると手動上書きを解除し、自動推定値に戻す。 */
  entityType: z.enum(["UNKNOWN", "INDIVIDUAL", "CORPORATE"]),
  platform: z.string().optional(),
  displayName: z.string().optional(),
});

/**
 * クライアント事業主体（個人/法人）の手動確定。profileKey 単位で ClientProfile を upsert する。
 * entityType を UNKNOWN にすると manualOverride を解除し、以後の ingest 自動推定に戻す。
 */
export async function PATCH(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return err("Expected { profileKey, entityType }", 422);

  const profileKey = normalizeProfileKey(parsed.data.profileKey);
  if (!profileKey) return err("Invalid profileKey", 422);

  const { entityType } = parsed.data;
  const clearOverride = entityType === "UNKNOWN";

  const existing = await db.clientProfile.findUnique({
    where: { profileKey },
    select: { autoEntityType: true, autoConfidence: true },
  });

  const row = await db.clientProfile.upsert({
    where: { profileKey },
    create: {
      profileKey,
      platform: parsed.data.platform ?? "",
      displayName: parsed.data.displayName ?? "",
      // 新規で UNKNOWN 指定なら推定なしの素の行。それ以外は手動確定。
      entityType,
      autoEntityType: "UNKNOWN",
      autoConfidence: 0,
      manualOverride: !clearOverride,
    },
    update: clearOverride
      ? {
          // 上書き解除 → 自動推定値に戻す。
          manualOverride: false,
          entityType: existing?.autoEntityType ?? "UNKNOWN",
        }
      : {
          entityType,
          manualOverride: true,
        },
  });

  return ok({
    profileKey: row.profileKey,
    entityType: row.entityType,
    manualOverride: row.manualOverride,
  });
}
