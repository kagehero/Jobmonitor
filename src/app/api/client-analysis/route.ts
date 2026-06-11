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

  // ClientProfile（事業主体 個人/法人）を突き合わせる。集約キーは ``pf:{profileKey}``。
  const profiles = await db.clientProfile.findMany({
    select: {
      profileKey: true,
      entityType: true,
      autoEntityType: true,
      autoConfidence: true,
      manualOverride: true,
    },
  });
  const profileByKey = new Map(profiles.map((p) => [p.profileKey, p]));

  const clientsWithEntity = clients.map((c) => {
    if (!c.key.startsWith("pf:")) return c;
    const profileKey = c.key.slice(3);
    const p = profileByKey.get(profileKey);
    if (!p) return c;
    return {
      ...c,
      entityType: p.entityType,
      entitySource: (p.manualOverride ? "manual" : "auto") as "manual" | "auto",
      entityConfidence: p.manualOverride ? 1 : p.autoConfidence,
    };
  });

  return ok({
    summary,
    clients: clientsWithEntity,
    scan: { limit, orderedBy: "detectedAt_desc" as const },
  });
}
