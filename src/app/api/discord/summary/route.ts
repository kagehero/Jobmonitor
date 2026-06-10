import { DiscordDeliveryStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const last24 = new Date(Date.now() - 86400_000);
  const [sent, pending, failed, samples] = await Promise.all([
    db.discordNotification.count({
      where: { status: DiscordDeliveryStatus.SENT, sentAt: { gte: last24 } },
    }),
    db.discordNotification.count({
      where: { status: DiscordDeliveryStatus.PENDING },
    }),
    db.discordNotification.count({
      where: { status: DiscordDeliveryStatus.FAILED },
    }),
    db.discordNotification.findMany({
      take: 42,
      orderBy: { sentAt: "desc" },
      include: {
        job: { select: { title: true, projectUrl: true } },
      },
    }),
  ]);

  const successRateDen = Math.max(sent + failed + pending, 1);
  const successRate = sent / successRateDen;

  return ok({
    last24Hours: {
      delivered: sent,
      pending,
      failed,
      successRate,
      latencyMsEstimated: null,
    },
    recent: samples.map((s) => ({
      id: s.id,
      status: s.status,
      title: s.job.title,
      projectUrl: s.job.projectUrl,
      webhookHost: safeHost(s.webhookUrl),
      sentAt: s.sentAt?.toISOString() ?? null,
    })),
  });
}

function safeHost(webhookUrl: string) {
  try {
    return new URL(webhookUrl).hostname;
  } catch {
    return "(invalid webhook)";
  }
}
