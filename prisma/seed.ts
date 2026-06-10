import {
  DiscordDeliveryStatus,
  Prisma,
  PrismaClient,
  ScrapingType,
} from "@prisma/client";

const prisma = new PrismaClient();

/** Default keys for the dashboard UI (no fake jobs or scrapes). */
async function seedAppSettings() {
  const rows = [
    { key: "worker_concurrency", value: { value: 3 } },
    { key: "discord_rate_limit_ms", value: { value: 1250 } },
    {
      key: "prompt_template",
      value: {
        system: "Classify freelance leads for SaaS/backend focus. Respond JSON only.",
      },
    },
    { key: "scraper_timeout_ms", value: { value: 25000 } },
  ] as const;

  for (const row of rows) {
    await prisma.appSetting.upsert({
      where: { key: row.key },
      create: { key: row.key, value: row.value },
      update: { value: row.value },
    });
  }
}

/**
 * Remove rows left from the old demo seed (`db:seed` before production-oriented seed).
 * Real monitor data: jobs have rawData from `job_public_dict`; scrapes have logs.monitor === true.
 */
async function purgeLegacyDemoRows() {
  await prisma.detectedJob.deleteMany({
    where: { rawData: { path: ["seeded"], equals: true } },
  });

  await prisma.scrapeHistory.deleteMany({
    where: {
      NOT: { logs: { path: ["monitor"], equals: true } },
    },
  });
}

async function main() {
  if (process.env.SEED_DEMO === "1") {
    await seedDemoFull();
    console.log("Demo seed OK (synthetic sources/jobs — not for production).");
    return;
  }

  await seedAppSettings();
  await purgeLegacyDemoRows();
  console.log(
    "Seed OK (app settings only). Monitoring data comes from monitor.py → POST /api/internal/ingest.",
  );
}

/** Previous synthetic dataset — only when SEED_DEMO=1 */
async function seedDemoFull() {
  await prisma.detectedJob.deleteMany();
  await prisma.scrapeHistory.deleteMany();
  await prisma.monitoringSource.deleteMany();
  await prisma.appSetting.deleteMany();

  const sLanSys = await prisma.monitoringSource.create({
    data: {
      platform: "Lancers",
      url: "https://www.lancers.jp/work/search/system?open=1&ref=header_menu",
      scrapingType: ScrapingType.HTML_PARSE,
      pollingInterval: 180,
      active: true,
      parserVersion: "demo/2.1.0",
      status: "healthy",
      lastCheckedAt: new Date(),
    },
  });
  const sLanWeb = await prisma.monitoringSource.create({
    data: {
      platform: "Lancers",
      url: "https://www.lancers.jp/work/search/web?open=1&ref=header_menu",
      scrapingType: ScrapingType.HTML_PARSE,
      pollingInterval: 180,
      active: true,
      parserVersion: "demo/2.1.0",
      status: "healthy",
      lastCheckedAt: new Date(),
    },
  });
  const sCw226 = await prisma.monitoringSource.create({
    data: {
      platform: "CrowdWorks",
      url: "https://crowdworks.jp/public/jobs/search?category_id=226&order=new",
      scrapingType: ScrapingType.HYBRID,
      pollingInterval: 240,
      active: true,
      parserVersion: "demo/1.5.2",
      status: "healthy",
      lastCheckedAt: new Date(),
    },
  });
  const sCw230 = await prisma.monitoringSource.create({
    data: {
      platform: "CrowdWorks",
      url: "https://crowdworks.jp/public/jobs/search?category_id=230&order=new",
      scrapingType: ScrapingType.HYBRID,
      pollingInterval: 240,
      active: true,
      parserVersion: "demo/1.5.2",
      status: "degraded",
      lastCheckedAt: new Date(Date.now() - 120_000),
    },
  });

  const jobsSeed = [
    {
      sid: sLanSys.id,
      title: "【デモ】社内Rails API運用監視ツール強化",
      budget: "15万〜30万円",
      client: "株式会社Example",
      url: "https://www.lancers.jp/work/detail/9000001",
      posted: new Date(Date.now() - 3_600_000),
      ai: 82,
      tags: ["ruby", "api", "long-term"],
      notif: true,
      clientProfileUrl: "/client/demo_client_rails",
      clientOrders: "24",
      clientRating: 4.8,
      clientExtrasSummary:
        "デモ保存フィールドの例: 発注率 92%（23/25） · フィードバック 良23・悪1 · 継続ランサー 4人",
    },
    {
      sid: sCw230.id,
      title: "【デモ】WordPressサイト改修",
      budget: "単価相談",
      client: "studio_alpha",
      url: "https://crowdworks.jp/public/jobs/13167912",
      posted: new Date(Date.now() - 900_000),
      ai: 68,
      tags: ["wordpress", "lp"],
      notif: true,
      clientProfileUrl: "/public/employers/900001",
      clientOrders: "31",
      clientRating: 4.6,
      clientExtrasSummary: "デモ: 募集実績 40 · 完了 120 · 契約 95 · 完了率 88%",
    },
    {
      sid: sCw226.id,
      title: "【デモ】GCPとBigQueryのデータパイプライン設計支援",
      budget: "50万円〜",
      client: "data_ops_io",
      url: "https://crowdworks.jp/public/jobs/13167263",
      posted: new Date(Date.now() - 7_200_000),
      ai: 91,
      tags: ["bigquery", "etl"],
      notif: false,
      clientProfileUrl: "/public/employers/900002",
      clientOrders: "18",
      clientRating: 4.9,
      clientExtrasSummary: "デモ: 募集実績 22 · 完了 55 · 契約 48 · 完了率 92%",
    },
  ];

  for (const j of jobsSeed) {
    const job = await prisma.detectedJob.create({
      data: {
        sourceId: j.sid,
        title: j.title,
        description: "Demo seed description only.",
        budget: j.budget,
        clientName: j.client,
        projectUrl: j.url,
        postedAt: j.posted,
        detectedAt: new Date(Date.now() - Math.floor(Math.random() * 60_000)),
        aiScore: j.ai,
        tags: j.tags,
        notificationSent: j.notif,
        clientProfileUrl: j.clientProfileUrl,
        clientOrders: j.clientOrders,
        clientRating: j.clientRating,
        clientExtrasSummary: j.clientExtrasSummary,
        rawData: { seeded: true, demo: true },
      },
    });
    await prisma.aiAnalysis.create({
      data: {
        detectedJobId: job.id,
        relevanceScore: j.ai / 100,
        profitabilityScore: 0.72,
        spamScore: 0.04,
        urgencyScore: 0.61,
        analysisJson: {
          category: "engineering",
          model: "seed-demo",
          confidence: 0.81,
          summary: "Synthetic demo row — use SEED_DEMO=0 and monitor ingest for real data.",
        },
      },
    });
    await prisma.discordNotification.create({
      data: {
        detectedJobId: job.id,
        webhookUrl:
          process.env.DISCORD_TEST_WEBHOOK_URL ??
          "https://discord.com/api/webhooks/demo/replace-me",
        status: j.notif ? DiscordDeliveryStatus.SENT : DiscordDeliveryStatus.FAILED,
        sentAt: j.notif ? new Date() : null,
        responseLog: j.notif ? { status: 204 } : { error: "rate_limited_demo" },
      },
    });
  }

  await prisma.scrapeHistory.createMany({
    data: [sLanSys, sLanWeb, sCw226, sCw230].map((src, idx) => ({
      sourceId: src.id,
      startedAt: new Date(Date.now() - idx * 300_000 - 240_000),
      finishedAt: new Date(Date.now() - idx * 300_000 - 239_120),
      success: idx !== 3,
      jobsFound: 12 + idx * 7,
      errorMessage: idx === 3 ? "CrowdWorks: upstream timeout (>25s)." : undefined,
      logs: [{ level: "info", msg: `demo poll ${idx + 1}` }] as Prisma.InputJsonValue,
      retryCount: idx === 3 ? 1 : 0,
      workerHost: process.env.WORKER_HOST ?? "demo-scheduler",
    })),
  });

  await prisma.appSetting.createMany({
    data: [
      { key: "worker_concurrency", value: { value: 3 } },
      { key: "discord_rate_limit_ms", value: { value: 1250 } },
      {
        key: "prompt_template",
        value: {
          system: "Classify freelance leads for SaaS/backend focus. Respond JSON only.",
        },
      },
      { key: "scraper_timeout_ms", value: { value: 25000 } },
    ],
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
