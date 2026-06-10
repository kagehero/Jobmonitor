"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CpuIcon, DatabaseIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

type SettingRow = { id: string; key: string; value: Record<string, unknown> };

export default function SettingsPage() {
  const qc = useQueryClient();
  const [workerConcurrency, setWorkerConcurrency] = useState("3");
  const [rateLimitMs, setRateLimitMs] = useState("1250");
  const [scrapeTimeoutMs, setScrapeTimeoutMs] = useState("25000");

  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch("/api/health", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message ?? "unhealthy");
      return json.data as { postgres: boolean; time: string };
    },
    refetchInterval: 45000,
  });

  const appSettings = useQuery({
    queryKey: ["app-settings-full"],
    queryFn: async () => {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      const rows = json.data.settings as SettingRow[];

      const byKey = Object.fromEntries(rows.map((row) => [row.key, row.value]));

      return { rows, byKey };
    },
  });

  useEffect(() => {
    const byKey = appSettings.data?.byKey;
    if (!byKey) return;

    const wc = byKey["worker_concurrency"];
    if (
      typeof wc === "object" &&
      wc !== null &&
      typeof (wc as { value?: unknown }).value === "number"
    ) {
      setWorkerConcurrency(String((wc as { value: number }).value));
    }

    const rl = byKey["discord_rate_limit_ms"];
    if (
      typeof rl === "object" &&
      rl !== null &&
      typeof (rl as { value?: unknown }).value === "number"
    ) {
      setRateLimitMs(String((rl as { value: number }).value));
    }

    const tm = byKey["scraper_timeout_ms"];
    if (
      typeof tm === "object" &&
      tm !== null &&
      typeof (tm as { value?: unknown }).value === "number"
    ) {
      setScrapeTimeoutMs(String((tm as { value: number }).value));
    }
  }, [appSettings.data]);

  const patch = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            key: "worker_concurrency",
            value: { value: Math.max(1, Number(workerConcurrency) || 1) },
          },
          {
            key: "discord_rate_limit_ms",
            value: { value: Math.max(100, Number(rateLimitMs) || 1250) },
          },
          {
            key: "scraper_timeout_ms",
            value: { value: Math.max(1000, Number(scrapeTimeoutMs) || 25000) },
          },
        ]),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json;
    },
    onSuccess: () => {
      toast.success("Queue configuration saved");
      void qc.invalidateQueries({ queryKey: ["app-settings-full"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const maskedEnv = `
NEXT_PUBLIC_SITE_URL=dashboard.local
DATABASE_URL=postgresql://******@localhost/jobhunter_dashboard
DISCORD_TEST_WEBHOOK_URL=(optional outbound smoke tests)
`;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Settings</h1>
        <p className="text-sm text-zinc-500">Operational toggles mirrored into `AppSetting` rows.</p>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DatabaseIcon className="size-5 text-sky-500" />
              PostgreSQL
            </CardTitle>
            <CardDescription>Thin SELECT 1 handshake — always-on for production rigs.</CardDescription>
          </div>
          <Badge
            variant="outline"
            className={
              health.isError
                ? "border-red-500 text-red-600 dark:border-red-400 dark:text-red-300"
                : "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            }
          >
            {health.isLoading ? "Checking…" : health.isError ? "Offline" : "Reachable"}
          </Badge>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600 dark:text-zinc-300">
          {health.isLoading ? (
            <Skeleton className="h-10 w-64" />
          ) : health.isError ? (
            <p>Could not handshake — inspect `DATABASE_URL` and compose stack.</p>
          ) : (
            <p>Last handshake {new Date(health.data!.time).toLocaleString()}.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CpuIcon className="size-5 text-purple-500" /> Worker concurrency & limits
          </CardTitle>
          <CardDescription>Hot paths for ingestion workers + Discord governors.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3">
          <Field label="Concurrency" value={workerConcurrency} onChange={setWorkerConcurrency} hint="Concurrent scrapes / queue consumers" />
          <Field label="Discord rate ms" value={rateLimitMs} onChange={setRateLimitMs} hint="Throttle outbound webhook fan-out" />
          <Field label="Scraper timeout ms" value={scrapeTimeoutMs} onChange={setScrapeTimeoutMs} hint="Upstream hard stop" />

          <div className="md:col-span-3 flex flex-wrap gap-3">
            <Button onClick={() => patch.mutate()} disabled={patch.isPending}>
              Save queue profile
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Environment atlas</CardTitle>
          <CardDescription>High level map — secrets never rendered from the runtime.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea readOnly className="h-44 font-mono text-xs leading-relaxed">
            {maskedEnv.trim()}
          </Textarea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Raw persisted settings JSON</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-80 overflow-auto rounded-xl border border-zinc-200 bg-zinc-950 p-4 text-[11px] text-emerald-200 dark:border-zinc-800">
            {JSON.stringify(appSettings.data?.rows ?? [], null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  hint: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs uppercase tracking-wide">{props.label}</Label>
        <p className="text-xs text-zinc-500">{props.hint}</p>
      </div>
      <Input inputMode="numeric" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}
