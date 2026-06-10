"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircleIcon, CheckCircleIcon, RotateCcwIcon, TimerIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { PostingSourceBadges } from "@/components/posting-source-badges";

type HistoryRow = {
  id: string;
  sourceId: string;
  startedAt: string;
  finishedAt: string | null;
  success: boolean;
  jobsFound: number;
  errorMessage: string | null;
  logs: unknown;
  retryCount: number;
  workerHost: string | null;
  platform: string;
  listingUrl: string;
  listingUrlSlice: string;
  durationMs: number | null;
};

export default function HistoryPage() {
  const qc = useQueryClient();
  const [logRow, setLogRow] = useState<HistoryRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["histories"],
    queryFn: async () => {
      const res = await fetch("/api/scrape-histories", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json.data as HistoryRow[];
    },
  });

  const retry = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/scrape-histories/${id}/retry`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json.data as { id: string };
    },
    onSuccess: () => {
      toast.success("Retry row created — worker pickup required");
      void qc.invalidateQueries({ queryKey: ["histories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sorted = useMemo(() => data ?? [], [data]);

  function exportLogs(row: HistoryRow) {
    const blob = new Blob([JSON.stringify(row, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scrape-${row.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported bundle");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Scrape history</h1>
        <p className="text-sm text-zinc-500">Operational proof for every polled source.</p>
      </header>

      {isLoading ? (
        <Skeleton className="h-[520px] w-full" />
      ) : (
        <div className="relative space-y-0 pl-2">
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-zinc-200 dark:bg-zinc-800" aria-hidden />
          {sorted.map((row) => (
            <article key={row.id} className="relative pb-10 pl-10">
              <span className={`absolute left-3 top-2 mt-2 size-2 -translate-x-1/2 rounded-full ${row.success ? "bg-emerald-500" : "bg-red-600"}`} />
              <Card className="border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <PostingSourceBadges platform={row.platform} listingUrl={row.listingUrl} orientation="row" />
                      <p className="font-mono text-xs text-zinc-500">{row.listingUrlSlice}</p>
                    </div>
                    <Badge variant={row.success ? "secondary" : "outline"}>
                      {row.success ? (
                        <>
                          <CheckCircleIcon className="mr-1 size-3" /> Success
                        </>
                      ) : (
                        <>
                          <AlertCircleIcon className="mr-1 size-3" /> Failed
                        </>
                      )}
                    </Badge>
                  </div>

                  <div className="grid gap-3 text-xs text-zinc-600 dark:text-zinc-400 sm:grid-cols-3">
                    <Metric label="Jobs found" value={String(row.jobsFound)} />
                    <Metric
                      label="Duration"
                      value={row.durationMs != null ? `${(row.durationMs / 1000).toFixed(2)} s` : "Running…"}
                    />
                    <Metric label="Retries" value={String(row.retryCount)} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 dark:border-zinc-700">
                      <TimerIcon className="size-3" />
                      {new Date(row.startedAt).toLocaleString()}
                    </span>
                    {row.workerHost ? (
                      <span className="rounded-full bg-zinc-100 px-3 py-1 font-mono text-[11px] text-zinc-600 dark:bg-zinc-900">
                        {row.workerHost}
                      </span>
                    ) : null}
                  </div>

                  {!row.success && row.errorMessage ? (
                    <p className="text-sm text-red-600 dark:text-red-400">{row.errorMessage}</p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate(row.id)}>
                      <RotateCcwIcon className="mr-2 size-3.5" />
                      Retry
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setLogRow(row)}>
                      View logs
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => exportLogs(row)}>
                      Export JSON
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </article>
          ))}
          {!sorted.length ? (
            <p className="py-14 text-center text-sm text-zinc-500">No executions recorded yet.</p>
          ) : null}
        </div>
      )}

      <Dialog open={!!logRow} onOpenChange={(open) => !open && setLogRow(null)}>
        <DialogContent className="max-w-3xl gap-4">
          <DialogHeader>
            <DialogTitle className="text-base">Structured logs · {logRow?.platform}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[420px] rounded-xl border border-zinc-200 bg-zinc-950 p-4 font-mono text-[11px] text-emerald-200 dark:border-zinc-800">
            <pre>{logRow ? JSON.stringify(logRow.logs ?? [], null, 2) : ""}</pre>
          </ScrollArea>
          {!logRow?.success && logRow?.errorMessage ? (
            <DialogFooter className="flex-col items-start sm:items-start">
              <p className="text-sm text-red-500">{logRow.errorMessage}</p>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-[11px] uppercase tracking-wide text-zinc-400">{props.label}</p>
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{props.value}</p>
    </div>
  );
}
