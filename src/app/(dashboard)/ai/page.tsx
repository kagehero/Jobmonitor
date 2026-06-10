"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

type AnalysisRow = {
  id: string;
  relevanceScore: number;
  profitabilityScore: number;
  spamScore: number;
  urgencyScore: number;
  analysisJson: Record<string, unknown>;
  job: { title: string; projectUrl: string; source: { platform: string } };
};

export default function AiAnalysisPage() {
  const qc = useQueryClient();
  const [model, setModel] = useState("gpt-5.3");

  const { data, isLoading } = useQuery({
    queryKey: ["ai-analyses"],
    queryFn: async () => {
      const res = await fetch("/api/ai/analyses", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json.data as {
        analyses: AnalysisRow[];
        distribution: { idx: number; relevance: number; profit: number; urgency: number }[];
      };
    },
  });

  const { data: promptData } = useQuery({
    queryKey: ["prompt-setting"],
    queryFn: async () => {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      const prompt = json.data.settings?.find((s: { key: string }) => s.key === "prompt_template")?.value as
        | { system?: string }
        | undefined;
      return prompt?.system ?? "";
    },
  });

  const [promptDraft, setPromptDraft] = useState("");

  const promptSeeded = useRef(false);

  useEffect(() => {
    if (promptSeeded.current) return;
    if (typeof promptData === "string" && promptData) {
      setPromptDraft(promptData);
      promptSeeded.current = true;
    }
  }, [promptData]);

  const syncPrompt = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            key: "prompt_template",
            value: {
              system: promptDraft.trim() ? promptDraft : "Classify freelance leads for SaaS/backend focus.",
            },
          },
          { key: "ai_active_model", value: { label: model } },
        ]),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json;
    },
    onSuccess: () => {
      toast.success("Prompt + model synced");
      void qc.invalidateQueries({ queryKey: ["prompt-setting"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chartData = data?.distribution ?? [];

  const top = useMemo(() => data?.analyses.slice(0, 24) ?? [], [data]);

  const scoreStats = useMemo(() => {
    if (!top.length)
      return { avgRel: "—", avgProfit: "—", spam: "—", urg: "—", cat: "—" as string };

    let rel = 0;
    let prof = 0;
    let spam = 0;
    let urg = 0;

    top.forEach((row) => {
      rel += row.relevanceScore;
      prof += row.profitabilityScore;
      spam += row.spamScore;
      urg += row.urgencyScore;
    });

    const n = top.length;

    let category = "";
    const firstCat = top[0]?.analysisJson?.category;

    category = typeof firstCat === "string" ? firstCat : "";

    return {
      avgRel: ((rel / n) * 100).toFixed(1),
      avgProfit: ((prof / n) * 100).toFixed(1),
      spam: ((spam / n) * 100).toFixed(1),
      urg: ((urg / n) * 100).toFixed(1),
      cat: category || "Mixed",
    };
  }, [top]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">AI signals</h1>
        <p className="text-sm text-zinc-500">
          Scoring overlays for spam, urgency, and downstream profitability hypotheses.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <Stat label="Avg relevance" value={scoreStats.avgRel === "—" ? "—" : `${scoreStats.avgRel}%`} />
            <Stat label="Avg profitability proxy" value={scoreStats.avgProfit === "—" ? "—" : `${scoreStats.avgProfit}%`} />
            <Stat label="Avg spam suspicion" value={scoreStats.spam === "—" ? "—" : `${scoreStats.spam}%`} />
            <Stat label="Urgency tilt" value={scoreStats.urg === "—" ? "—" : `${scoreStats.urg}%`} />
          </>
        )}
      </div>

      <Tabs defaultValue="insights" className="space-y-4">
        <TabsList>
          <TabsTrigger value="insights">Distribution</TabsTrigger>
          <TabsTrigger value="prompt">Prompt & model</TabsTrigger>
        </TabsList>
        <TabsContent value="insights" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Relevance vs profit</CardTitle>
                <CardDescription>Indexed detections (seeded sample).</CardDescription>
              </CardHeader>
              <CardContent className="h-[320px]">
                {isLoading ? (
                  <Skeleton className="size-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="4 12" opacity={0.2} vertical={false} />
                      <XAxis dataKey="idx" stroke="#71717a" hide />
                      <YAxis stroke="#71717a" />
                      <Tooltip
                        cursor={{ stroke: "#ffffff10" }}
                        contentStyle={{
                          borderRadius: 10,
                          border: "1px solid #27272a",
                          background: "#09090bdc",
                          color: "#fafafa",
                        }}
                      />
                      <Line dot={false} type="monotone" dataKey="relevance" stroke="#a855f7" strokeWidth={2} />
                      <Line dot={false} type="monotone" dataKey="profit" stroke="#22d3ee" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Urgency heat</CardTitle>
                <CardDescription>Shortlist pressure curve.</CardDescription>
              </CardHeader>
              <CardContent className="h-[320px]">
                {isLoading ? (
                  <Skeleton className="size-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="4 12" opacity={0.18} vertical={false} />
                      <XAxis dataKey="idx" stroke="#71717a" hide />
                      <YAxis stroke="#71717a" />
                      <Tooltip
                        cursor={{ fill: "#ffffff06" }}
                        contentStyle={{
                          borderRadius: 10,
                          border: "1px solid #27272a",
                          background: "#09090bdc",
                          color: "#fafafa",
                        }}
                      />
                      <Bar radius={[10, 10, 4, 4]} dataKey="urgency" fill="#fbbf24" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Opportunity leaderboard</CardTitle>
              <CardDescription>Confidence pulled from persisted `analysisJson` payloads.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[340px] pr-4">
                <div className="space-y-3">
                  {top.map((row) => {
                    const conf = typeof row.analysisJson?.confidence === "number" ? row.analysisJson.confidence : null;

                    return (
                      <motion.div
                        layout
                        key={row.id}
                        className="rounded-2xl border border-zinc-200 p-4 text-sm shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-zinc-900 dark:text-zinc-50">{row.job.title}</p>
                            <p className="text-xs text-zinc-500">{row.job.source.platform}</p>
                          </div>
                          <Badge variant="secondary">{((row.relevanceScore ?? 0) * 100).toFixed(0)} pts rel</Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-zinc-400">
                          <Badge variant="outline">Profit {(row.profitabilityScore * 100).toFixed(0)}%</Badge>
                          <Badge variant="outline">Spam {(row.spamScore * 100).toFixed(0)}%</Badge>
                          <Badge variant="outline">Urgent {(row.urgencyScore * 100).toFixed(0)}%</Badge>
                          {conf !== null ? <Badge variant="outline">Confidence {(conf * 100).toFixed(0)}%</Badge> : null}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prompt">
          <Card>
            <CardHeader>
              <CardTitle>Fleet prompt</CardTitle>
              <CardDescription>Writes to `prompt_template` and `ai_active_model` app settings rows.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Active classifier</Label>
                <Input value={model} onChange={(ev) => setModel(ev.target.value)} placeholder="Model alias" />
              </div>
              <div className="space-y-2">
                <Label>System instructions</Label>
                <Textarea rows={12} value={promptDraft} onChange={(ev) => setPromptDraft(ev.target.value)} />
              </div>
              <Button onClick={() => syncPrompt.mutate()} disabled={syncPrompt.isPending}>
                Persist settings bundle
              </Button>
              <Badge variant="secondary" className="text-[11px]">
                Typical category inferred: {scoreStats.cat}
              </Badge>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <motion.div layout className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">{props.label}</p>
      <p className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">{props.value}</p>
    </motion.div>
  );
}
