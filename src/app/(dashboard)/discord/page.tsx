"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIcon, GaugeIcon, RadarIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

type DiscordRow = {
  id: string;
  status: "PENDING" | "SENT" | "FAILED";
  webhookUrl: string;
  sentAt: string | null;
  title: string;
  projectUrl: string;
};

export default function DiscordPage() {
  const qc = useQueryClient();
  const [webhook, setWebhook] = useState("");

  const summary = useQuery({
    queryKey: ["discord-summary"],
    queryFn: async () => {
      const res = await fetch("/api/discord/summary", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json.data as {
        last24Hours: { delivered: number; pending: number; failed: number; successRate: number };
        recent: { id: string; status: DiscordRow["status"]; title: string; webhookHost?: string | null }[];
      };
    },
    refetchInterval: 60000,
  });

  const events = useQuery({
    queryKey: ["discord-notifications"],
    queryFn: async () => {
      const res = await fetch("/api/discord/notifications", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json.data as DiscordRow[];
    },
  });

  const testWebhook = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/discord/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: webhook.trim(),
          message:
            "**Job Hunter** · dashboard smoke test ✅\n_Channel routing + signature verified from web console._",
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json.data as { ok: boolean };
    },
    onSuccess: () => toast.success("Ping dispatched"),
    onError: (e: Error) => toast.error(e.message),
  });

  const retry = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/discord/notifications/${id}/retry`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json.data;
    },
    onSuccess: () => {
      toast.success("Retry attempted");
      void qc.invalidateQueries({ queryKey: ["discord-notifications"] });
      void qc.invalidateQueries({ queryKey: ["discord-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const summaryData = summary.data?.last24Hours;
  const rateSeries = summary.data?.recent.slice(0, 12).map((row, idx) => ({
    idx,
    successes: row.status === "SENT" ? 1 : 0,
    failures: row.status === "FAILED" ? 1 : 0,
  }));

  const successPct = summaryData ? (summaryData.successRate * 100).toFixed(1) : "—";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Discord fan-out</h1>
        <p className="text-sm text-zinc-500">Webhook reliability, SLA cues, retries.</p>
      </header>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base flex items-center gap-2"><RadarIcon className="size-4"/> Last 24h summary</CardTitle>
          <CardDescription>Operational counts mirrored from Postgres.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          {summary.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : summaryData ? (
            <>
              <Metric label="Delivered" value={String(summaryData.delivered)} caption="accepted webhooks" />
              <Metric label="Pending" value={String(summaryData.pending)} caption="waiting ack" />
              <Metric label="Failed" value={String(summaryData.failed)} caption="hard errors" />
              <Metric label="Success rate (approx)" value={`${successPct}%`} caption="sent / backlog" />
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ActivityIcon className="size-4"/> Micro trend</CardTitle>
            <CardDescription>Discrete signal from sampled recent deliveries.</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            {summary.isLoading ? (
              <Skeleton className="size-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rateSeries ?? []}>
                  <CartesianGrid strokeDasharray="4 12" opacity={0.2} vertical={false} />
                  <XAxis dataKey="idx" stroke="#71717a" />
                  <YAxis stroke="#71717a" hide />
                  <Tooltip
                    cursor={{ stroke: "#ffffff08" }}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #27272a",
                      background: "#09090bdc",
                      color: "#fafafa",
                    }}
                  />
                  <Line type="monotone" dataKey="successes" stroke="#22c55e" strokeWidth={2} dot />
                  <Line type="step" dataKey="failures" stroke="#f97316" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><GaugeIcon className="size-4"/> Grouping heuristic</CardTitle>
            <CardDescription>Stacks successes vs retries for quick eyeball checks.</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            {summary.isLoading ? (
              <Skeleton className="size-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rateSeries ?? []}>
                  <CartesianGrid strokeDasharray="4 12" opacity={0.25} vertical={false} />
                  <XAxis dataKey="idx" stroke="#71717a" />
                  <Tooltip
                    cursor={{ fill: "#ffffff08" }}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #27272a",
                      background: "#09090bdc",
                      color: "#fafafa",
                    }}
                  />
                  <Bar radius={[12, 12, 0, 0]} dataKey="successes" stackId="a" fill="#4ade80" />
                  <Bar radius={[12, 12, 0, 0]} dataKey="failures" stackId="a" fill="#fb923c" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Smoke test webhook</CardTitle>
          <CardDescription>Issues a benign payload using the route handler outbound fetch.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 space-y-2 md:pr-4">
            <Label>Webhook URL</Label>
            <Input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" />
          </div>
          <Button variant="outline" disabled={testWebhook.isPending || !webhook.trim()} onClick={() => testWebhook.mutate()}>
            Dispatch test ping
          </Button>
        </CardContent>
      </Card>

      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader>
          <CardTitle>Delivery ledger</CardTitle>
          <CardDescription>Latest fan-out tries with deterministic retry routing.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {events.isLoading ? (
            <Skeleton className="h-[360px]" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Webhook</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead className="text-right">Retry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(events.data ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <a href={row.projectUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-600 hover:underline">
                          {row.title}
                        </a>
                      </TableCell>
                      <TableCell>
                        {row.status === "FAILED" ? (
                          <Badge variant="outline" className="border-red-500 text-red-600 dark:border-red-400 dark:text-red-300">
                            {row.status.toLowerCase()}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{row.status.toLowerCase()}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate font-mono text-xs text-zinc-500">{row.webhookUrl}</TableCell>
                      <TableCell className="text-xs text-zinc-500">{row.sentAt ? new Date(row.sentAt).toLocaleString() : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" disabled={retry.isPending} onClick={() => retry.mutate(row.id)}>
                          Retry send
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric(props: { label: string; value: string; caption: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-[11px] uppercase tracking-wide text-zinc-400">{props.label}</p>
      <p className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">{props.value}</p>
      <p className="text-xs text-zinc-500">{props.caption}</p>
    </div>
  );
}
