"use client";

import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowUpRightIcon,
  BellIcon,
  BrainCircuitIcon,
  ShieldAlertIcon,
  TimerIcon,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  Legend,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

type CategoryLegendItem = { dataKey: string; label: string };

type Stats = {
  activeSources: number;
  jobsToday: number;
  discordSentToday: number;
  totalJobs: number;
  errorRate: number;
  avgLatencySec: number | null;
  backlogHint: number;
  recentActivity: Array<{
    id: string;
    platform: string;
    success: boolean;
    jobsFound: number;
    startedAt: string;
    errorMessage: string | null;
    urlSlice: string;
  }>;
  /** 検出求人（日別・プラットフォーム桶 + 一覧大分類桶）— Recharts が参照するフラットキー */
  jobsPerDay: Record<string, string | number>[];
  /** カテゴリ積み上げ用（システム / Web） */
  categoryStackLegend: CategoryLegendItem[];
  scrapeSpark: { tick: number; success: number }[];
  generatedAt: string;
};

const PLATFORM_SERIES = [
  { dataKey: "pl_lancers", label: "Lancers（LW）", fill: "#38bdf8" },
  { dataKey: "pl_crowdworks", label: "CrowdWorks（CW）", fill: "#a78bfa" },
] as const;

const CATEGORY_STACK_COLORS = ["#fb7185", "#34d399"];

export default function OverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats", { cache: "no-store" });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error?.message ?? "Failed");
      return body.data as Stats;
    },
    refetchInterval: 120_000,
  });

  const statSkeleton = Array.from({ length: 4 }).map((_, i) => (
    <Skeleton key={i} className="h-32 w-full" />
  ));

  const cards = (
    <>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <StatCard label="Sources online" value={data?.activeSources ?? 0} icon={<BrainCircuitIcon className="size-4 text-purple-600" />} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
        <StatCard label="Detected today (UTC)" value={data?.jobsToday ?? 0} icon={<ArrowUpRightIcon className="size-4 text-emerald-600" />} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <StatCard label="Discord sent today" value={data?.discordSentToday ?? 0} icon={<BellIcon className="size-4 text-sky-600" />} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <StatCard
          label="Latency / error blend"
          value={
            data?.avgLatencySec != null
              ? `${data.avgLatencySec.toFixed(1)} s`
              : `${((data?.errorRate ?? 0) * 100).toFixed(1)} % fails`
          }
          icon={<TimerIcon className="size-4 text-orange-600" />}
        />
      </motion.div>
    </>
  );

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Overview</h1>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            realtime / 120s polling
          </Badge>
        </div>
        <p className="max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          Monitor scraper fidelity, ingestion volume, and Discord fan-out in a single operations surface.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{isLoading ? statSkeleton : cards}</div>

      <div className="grid gap-4 xl:grid-cols-7">
        <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 xl:col-span-4">
          <CardHeader className="pb-0">
            <CardTitle>Jobs discovered</CardTitle>
            <CardDescription>
              積み上げはプラットフォーム別と、一覧URLから解釈した大分類（システム / Web）。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 pt-6">
            {isLoading ? (
              <Skeleton className="h-[480px] w-full" />
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Platform（投稿のプラットフォーム）
                  </p>
                  <div className="h-[212px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data?.jobsPerDay}>
                        <CartesianGrid strokeDasharray="4 12" opacity={0.2} vertical={false} />
                        <XAxis dataKey="day" stroke="#71717a" />
                        <YAxis stroke="#71717a" />
                        <Tooltip
                          cursor={{ fill: "#18181b10" }}
                          contentStyle={{
                            borderRadius: 10,
                            border: "1px solid #27272a",
                            background: "#09090bdc",
                            color: "#fafafa",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        {PLATFORM_SERIES.map((s) => (
                          <Bar
                            key={s.dataKey}
                            stackId="plat"
                            dataKey={s.dataKey}
                            name={s.label}
                            fill={s.fill}
                            radius={[6, 6, 0, 0]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Listing category（大分類: システム / Web）
                  </p>
                  <div className="h-[212px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data?.jobsPerDay}>
                        <CartesianGrid strokeDasharray="4 12" opacity={0.2} vertical={false} />
                        <XAxis dataKey="day" stroke="#71717a" />
                        <YAxis stroke="#71717a" />
                        <Tooltip
                          cursor={{ fill: "#18181b10" }}
                          contentStyle={{
                            borderRadius: 10,
                            border: "1px solid #27272a",
                            background: "#09090bdc",
                            color: "#fafafa",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        {(data?.categoryStackLegend ?? []).map(({ dataKey, label }, idx) => (
                          <Bar
                            key={dataKey}
                            stackId="cat"
                            dataKey={dataKey}
                            name={label}
                            fill={CATEGORY_STACK_COLORS[idx % CATEGORY_STACK_COLORS.length]}
                            radius={[6, 6, 0, 0]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 xl:col-span-3">
          <CardHeader className="pb-0">
            <CardTitle>Trend</CardTitle>
            <CardDescription>左と同じ日次系列を折れ線（合計・PF別・大分類別）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 pt-6">
            {isLoading ? (
              <Skeleton className="h-[480px] w-full" />
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Detected · platform
                  </p>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data?.jobsPerDay}>
                        <CartesianGrid strokeDasharray="4 12" opacity={0.15} vertical={false} />
                        <XAxis dataKey="day" stroke="#71717a" />
                        <YAxis stroke="#71717a" />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 10,
                            border: "1px solid #27272a",
                            background: "#09090bdc",
                            color: "#fafafa",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        <Line dot={false} type="monotone" dataKey="count" name="合計検出" stroke="#e4e4e7" strokeWidth={2} />
                        {PLATFORM_SERIES.map((s) => (
                          <Line
                            key={s.dataKey}
                            dot={false}
                            type="monotone"
                            dataKey={s.dataKey}
                            name={s.label}
                            stroke={s.fill}
                            strokeWidth={1.8}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Listing category（大分類）
                  </p>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data?.jobsPerDay}>
                        <CartesianGrid strokeDasharray="4 12" opacity={0.15} vertical={false} />
                        <XAxis dataKey="day" stroke="#71717a" />
                        <YAxis stroke="#71717a" />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 10,
                            border: "1px solid #27272a",
                            background: "#09090bdc",
                            color: "#fafafa",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        {(data?.categoryStackLegend ?? []).map(({ dataKey, label }, idx) => (
                          <Line
                            key={dataKey}
                            dot={false}
                            type="monotone"
                            dataKey={dataKey}
                            name={label}
                            stroke={CATEGORY_STACK_COLORS[idx % CATEGORY_STACK_COLORS.length]}
                            strokeWidth={1.8}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 lg:col-span-2">
          <CardHeader>
            <CardTitle>Risk rails</CardTitle>
            <CardDescription>Operational guardrails inferred from executions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
            <RiskRow loading={!!isLoading} label="Backlog heuristic" value={String(data?.backlogHint ?? 0)} />
            <RiskRow loading={!!isLoading} label="Corpus rows" value={String(data?.totalJobs ?? 0)} />
            <RiskRow
              loading={!!isLoading}
              label="7-day scrape failures"
              value={isLoading ? "..." : `${((data?.errorRate ?? 0) * 100).toFixed(1)} %`}
            />
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white shadow-sm dark:border-zinc-800 lg:col-span-3">
          <CardHeader>
            <div className="flex items-center gap-3">
              <ShieldAlertIcon className="size-5 text-orange-600" />
              <div>
                <CardTitle>Live activity</CardTitle>
                <CardDescription>Recently finished scrapes.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {isLoading
              ? Array.from({ length: 5 }).map((_, idx) => <Skeleton key={idx} className="my-3 h-14 w-full" />)
              : data?.recentActivity.map((evt) => (
                  <motion.div layout key={evt.id} className="flex gap-4 py-4">
                    <div className={`mt-1 size-2 shrink-0 rounded-full ${evt.success ? "bg-emerald-500" : "bg-red-600"}`} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{evt.platform}</p>
                        <Badge variant={evt.success ? "secondary" : "outline"}>{evt.success ? "OK" : "FAIL"}</Badge>
                        <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">{evt.jobsFound} jobs</p>
                      </div>
                      <p className="truncate font-mono text-xs text-zinc-500">{evt.urlSlice}</p>
                      {!evt.success && evt.errorMessage ? (
                        <p className="text-xs text-red-500">{evt.errorMessage}</p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-xs text-zinc-400">{new Date(evt.startedAt).toLocaleTimeString()}</p>
                  </motion.div>
                ))}
          </CardContent>
        </Card>
      </div>

      {!isLoading && data ? (
        <p className="text-center text-[11px] uppercase tracking-[0.16em] text-zinc-500">
          Snapshot {new Date(data.generatedAt).toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}

function StatCard(props: {
  label: string;
  value: number | string;
  caption?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="border-zinc-200 bg-white shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-500">{props.label}</CardTitle>
        {props.icon}
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-4xl font-semibold text-zinc-900 dark:text-zinc-50">{props.value}</p>
        <p className="text-xs text-zinc-500">{props.caption}</p>
      </CardContent>
    </Card>
  );
}

function RiskRow(props: { label: string; value: string; loading?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">{props.label}</p>
      {props.loading ? (
        <Skeleton className="mt-2 h-7 w-32" />
      ) : (
        <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{props.value}</p>
      )}
      <Separator className="my-4" />
    </div>
  );
}
