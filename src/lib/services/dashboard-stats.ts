import { DiscordDeliveryStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { bucketPlatformForStats, jobBoardCategoryTriple, postingCategoryTripleChartKey } from "@/lib/posting-board-meta";

const TREND_DAYS = 7;

const CATEGORY_STACK_META: CategoryStackMetaItem[] = [
  { dataKey: postingCategoryTripleChartKey("system"), label: "システム" },
  { dataKey: postingCategoryTripleChartKey("web"), label: "Web" },
];

export type DashboardJobsPerDayRow = {
  day: string;
  count: number;
  pl_lancers: number;
  pl_crowdworks: number;
  [dynamicKey: string]: string | number;
};

export type CategoryStackMetaItem = {
  /** Recharts の dataKey（例: cn_システム） */
  dataKey: string;
  /** 凡例・Tooltip 表示名 */
  label: string;
};

export async function getDashboardStatsBundle() {
  const startUtcDay = new Date();
  startUtcDay.setUTCHours(0, 0, 0, 0);

  const weekAgo = new Date(Date.now() - 7 * 86400_000);

  const [
    activeSources,
    jobsToday,
    discordSentToday,
    totalJobs,
    scrapeWeek,
    latencyRows,
    recentRuns,
    failedRecently,
  ] = await Promise.all([
    db.monitoringSource.count({ where: { active: true } }),
    db.detectedJob.count({ where: { detectedAt: { gte: startUtcDay } } }),
    db.discordNotification.count({
      where: { status: DiscordDeliveryStatus.SENT, sentAt: { gte: startUtcDay } },
    }),
    db.detectedJob.count(),
    db.scrapeHistory.findMany({
      where: { startedAt: { gte: weekAgo } },
      select: { success: true },
    }),
    db.scrapeHistory.findMany({
      where: { finishedAt: { not: null }, startedAt: { gte: weekAgo } },
      select: { startedAt: true, finishedAt: true },
      take: 250,
      orderBy: { startedAt: "desc" },
    }),
    db.scrapeHistory.findMany({
      take: 14,
      orderBy: { startedAt: "desc" },
      include: { source: { select: { platform: true, url: true } } },
    }),
    db.scrapeHistory.count({
      where: { success: false, startedAt: { gte: weekAgo } },
    }),
  ]);

  const totalScrapesWeek = Math.max(scrapeWeek.length, 1);
  const failedScrapesWeek = scrapeWeek.filter((s) => !s.success).length;
  const errorRate = failedScrapesWeek / totalScrapesWeek;

  const durSec = latencyRows
    .map((r) => (r.finishedAt!.getTime() - r.startedAt.getTime()) / 1000)
    .filter((n) => n > 0 && n < 600);
  const avgLatencySec = durSec.length ? durSec.reduce((a, b) => a + b, 0) / durSec.length : null;

  type DayAgg = {
    total: number;
    lw: number;
    cw: number;
    cat: Map<string, number>;
  };

  function emptyDayAgg(): DayAgg {
    return { total: 0, lw: 0, cw: 0, cat: new Map() };
  }

  const dayStarts: Date[] = [];
  for (let idx = TREND_DAYS - 1; idx >= 0; idx--) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - idx);
    dayStarts.push(start);
  }

  const rangeStart = dayStarts[0]!;
  const rangeEnd = new Date(dayStarts[TREND_DAYS - 1]!);
  rangeEnd.setDate(rangeEnd.getDate() + 1);

  function dayLabel(d: Date): string {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  const buckets = new Map<string, DayAgg>();
  for (const ds of dayStarts) buckets.set(dayLabel(ds), emptyDayAgg());

  const jobsInWindow = await db.detectedJob.findMany({
    where: { detectedAt: { gte: rangeStart, lt: rangeEnd } },
    select: {
      detectedAt: true,
      source: { select: { platform: true, url: true } },
    },
  });

  for (const job of jobsInWindow) {
    const ts = job.detectedAt.getTime();
    let matchedStart: Date | null = null;
    for (const s of dayStarts) {
      const e = new Date(s);
      e.setDate(e.getDate() + 1);
      if (ts >= s.getTime() && ts < e.getTime()) {
        matchedStart = s;
        break;
      }
    }
    if (!matchedStart) continue;
    const dk = dayLabel(matchedStart);
    const b = buckets.get(dk);
    if (!b) continue;
    b.total++;
    const plat = bucketPlatformForStats(job.source.platform);
    if (plat === "lancers") b.lw++;
    else if (plat === "crowdworks") b.cw++;

    const triple = jobBoardCategoryTriple(job.source.platform, job.source.url);
    if (triple === "system" || triple === "web") {
      const ck = postingCategoryTripleChartKey(triple);
      b.cat.set(ck, (b.cat.get(ck) ?? 0) + 1);
    }
  }

  const jobsPerDay: DashboardJobsPerDayRow[] = dayStarts.map((ds) => {
    const dk = dayLabel(ds);
    const b = buckets.get(dk)!;
    const row: DashboardJobsPerDayRow = {
      day: dk,
      count: b.total,
      pl_lancers: b.lw,
      pl_crowdworks: b.cw,
    };
    for (const { dataKey } of CATEGORY_STACK_META) {
      row[dataKey] = b.cat.get(dataKey) ?? 0;
    }
    return row;
  });

  const categoryStackLegend: CategoryStackMetaItem[] = CATEGORY_STACK_META;

  const sliceWeek = scrapeWeek.slice(-48);
  const scrapeSpark = sliceWeek.map((s, tick) => ({
    tick,
    success: s.success ? 1 : 0,
  }));

  const recentActivity = recentRuns.map((h) => ({
    id: h.id,
    platform: h.source.platform,
    success: h.success,
    jobsFound: h.jobsFound,
    startedAt: h.startedAt.toISOString(),
    errorMessage: h.errorMessage,
    urlSlice: h.source.url.slice(0, 88),
  }));

  return {
    activeSources,
    jobsToday,
    discordSentToday,
    totalJobs,
    errorRate,
    avgLatencySec,
    backlogHint: Math.min(failedRecently, 50),
    recentActivity,
    jobsPerDay,
    categoryStackLegend,
    scrapeSpark,
    generatedAt: new Date().toISOString(),
  };
}
