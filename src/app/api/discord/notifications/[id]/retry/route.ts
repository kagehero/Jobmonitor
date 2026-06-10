import { DiscordDeliveryStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { err, ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = await db.discordNotification.findUnique({
    where: { id },
    include: { job: { select: { title: true, projectUrl: true } } },
  });

  if (!row) return err("Notification not found", 404);

  const body = {
    content: `Retry: **${row.job.title}**\n${row.job.projectUrl}`,
  };

  try {
    const res = await fetch(row.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => "");

    if (res.ok) {
      await db.discordNotification.update({
        where: { id },
        data: {
          status: DiscordDeliveryStatus.SENT,
          sentAt: new Date(),
          responseLog: { status: res.status, excerpt: text.slice(0, 400), retried: true },
        },
      });
      return ok({ ok: true, status: res.status });
    }

    await db.discordNotification.update({
      where: { id },
      data: {
        status: DiscordDeliveryStatus.FAILED,
        responseLog: { status: res.status, excerpt: text.slice(0, 400), retried: true },
      },
    });
    return ok({ ok: false, status: res.status, excerpt: text.slice(0, 400) });
  } catch (e) {
    await db.discordNotification.update({
      where: { id },
      data: {
        status: DiscordDeliveryStatus.FAILED,
        responseLog: {
          retried: true,
          error: e instanceof Error ? e.message : "unknown",
        },
      },
    });
    return err("Webhook request failed", 502);
  }
}
