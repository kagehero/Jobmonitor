import { db } from "@/lib/db";
import { ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.discordNotification.findMany({
    take: 120,
    orderBy: { sentAt: "desc" },
    include: {
      job: { select: { title: true, projectUrl: true } },
    },
  });

  const data = rows.map((n) => ({
    id: n.id,
    detectedJobId: n.detectedJobId,
    webhookUrl: n.webhookUrl,
    status: n.status,
    sentAt: n.sentAt,
    responseLog: n.responseLog,
    title: n.job.title,
    projectUrl: n.job.projectUrl,
  }));

  return ok(data);
}
