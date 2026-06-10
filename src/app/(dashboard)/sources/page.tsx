"use client";

import type { MonitoringSource, ScrapingType } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PostingSourceBadges } from "@/components/posting-source-badges";

const MODES: ScrapingType[] = ["HTML_PARSE", "API", "HYBRID"];
const PAGE_SIZE = 8;

export default function SourcesPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<MonitoringSource | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: async () => {
      const res = await fetch("/api/monitoring-sources", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json.data as MonitoringSource[];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!data) return [];
    if (!q) return data;
    return data.filter(
      (s) =>
        s.platform.toLowerCase().includes(q) ||
        s.url.toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q),
    );
  }, [data, query]);

  const pageItems = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/monitoring-sources/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sources"] });
      toast.success("Source removed");
      setPendingDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Sources</h1>
          <p className="text-sm text-zinc-500">URLs, parsers, scrape cadence.</p>
        </div>
        <AddDialog />
      </header>

      <Card className="border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Catalog</CardTitle>
            <CardDescription>Ingest contracts for workers.</CardDescription>
          </div>
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search platform, URL, status…"
            className="max-w-sm"
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">No sources match this filter.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[6.75rem]">
                      <span className="block">Board</span>
                      <span className="block text-[10px] font-normal normal-case text-zinc-400">
                        LW/CW · category
                      </span>
                    </TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Every</TableHead>
                    <TableHead>Parser</TableHead>
                    <TableHead>Last check</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">
                      <span className="block">Active</span>
                      <span className="block text-[10px] font-normal normal-case text-zinc-400">On = scraping</span>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((s) => (
                    <Row
                      key={s.id}
                      source={s}
                      onRequestDelete={() => setPendingDelete(s)}
                    />
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                <span>
                  Page {page + 1} / {Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={(page + 1) * PAGE_SIZE >= filtered.length}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogTitle>Delete source?</DialogTitle>
          <p className="text-sm text-zinc-500">
            This removes <span className="font-medium text-zinc-900 dark:text-zinc-100">{pendingDelete?.platform}</span>{" "}
            and cascades related jobs and history.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={del.isPending}
              onClick={() => pendingDelete && del.mutate(pendingDelete.id)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ source, onRequestDelete }: { source: MonitoringSource; onRequestDelete: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(source.active);

  useEffect(() => {
    setActive(source.active);
  }, [source.active]);

  const patch = useMutation({
    mutationFn: async (partial: Partial<MonitoringSource>) => {
      const res = await fetch(`/api/monitoring-sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json.data as MonitoringSource;
    },
    onMutate: async (partial) => {
      await qc.cancelQueries({ queryKey: ["sources"] });
      const prev = qc.getQueryData<MonitoringSource[]>(["sources"]);
      if (prev && partial.active !== undefined) {
        qc.setQueryData(
          ["sources"],
          prev.map((s) => (s.id === source.id ? { ...s, active: partial.active! } : s)),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["sources"], ctx.prev);
      toast.error("Update failed");
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["sources"] }),
  });

  return (
    <TableRow>
      <TableCell className="align-top">
        <PostingSourceBadges dense platform={source.platform} listingUrl={source.url} />
      </TableCell>
      <TableCell className="max-w-[220px] truncate font-mono text-xs text-zinc-500" title={source.url}>
        {source.url}
      </TableCell>
      <TableCell>{source.pollingInterval}s</TableCell>
      <TableCell className="font-mono text-xs">{source.parserVersion}</TableCell>
      <TableCell className="text-xs text-zinc-500">
        {source.lastCheckedAt ? new Date(source.lastCheckedAt).toLocaleString() : "—"}
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="text-[10px] uppercase">
          {source.status}
        </Badge>
      </TableCell>
      <TableCell className="w-[128px]">
        <div
          className="flex items-center justify-start gap-2 sm:min-w-[7.5rem]"
          title={active ? "Monitoring is on — this source is scraped." : "Monitoring is off — this source is paused."}
        >
          <Switch
            checked={active}
            disabled={patch.isPending}
            aria-label={
              active
                ? `Pause scraping for ${source.platform} source`
                : `Enable scraping for ${source.platform} source`
            }
            onCheckedChange={(v) => {
              setActive(v);
              patch.mutate({ active: v });
            }}
          />
          <span
            className={cn(
              "min-w-[1.75rem] text-[10px] font-bold tabular-nums uppercase tracking-wide",
              active ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-500",
            )}
            aria-hidden
          >
            {active ? "On" : "Off"}
          </span>
        </div>
      </TableCell>
      <TableCell className="flex justify-end gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <PencilIcon className="size-3.5" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Edit source</DialogTitle>
            <EditForm
              key={source.id}
              source={source}
              onSave={(p) =>
                patch.mutate(p, {
                  onSuccess: () => {
                    toast.success("Updated");
                    setOpen(false);
                  },
                })
              }
            />
          </DialogContent>
        </Dialog>
        <Button size="sm" variant="destructive" onClick={onRequestDelete}>
          <Trash2Icon className="size-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function EditForm({
  source,
  onSave,
}: {
  source: MonitoringSource;
  onSave: (p: Partial<MonitoringSource>) => void;
}) {
  const [poll, setPoll] = useState(String(source.pollingInterval));
  const [parser, setParser] = useState(source.parserVersion);
  const [mode, setMode] = useState<ScrapingType>(source.scrapingType);

  return (
    <form
      className="grid gap-3 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          pollingInterval: Number(poll),
          parserVersion: parser,
          scrapingType: mode,
        });
      }}
    >
      <div className="space-y-2">
        <Label>Poll seconds</Label>
        <Input type="number" min={60} max={86400} value={poll} onChange={(ev) => setPoll(ev.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Parser semver</Label>
        <Input value={parser} onChange={(ev) => setParser(ev.target.value)} />
      </div>
      <Label>Mode</Label>
      <Select value={mode} onValueChange={(val) => setMode(val as ScrapingType)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODES.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DialogFooter>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  );
}

function AddDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ScrapingType>("HTML_PARSE");
  const qc = useQueryClient();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="size-4" />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Create source</DialogTitle>
        <form
          className="grid gap-3 pt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const res = await fetch("/api/monitoring-sources", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                platform: String(fd.get("platform") ?? "").trim(),
                url: String(fd.get("url") ?? "").trim(),
                pollingInterval: Number(fd.get("poll") ?? 180),
                parserVersion: String(fd.get("parser") ?? "1.0.0").trim(),
                scrapingType: mode,
              }),
            });
            const json = await res.json();
            if (!json.ok) {
              toast.error(json.error.message ?? "Failed");
              return;
            }
            toast.success("Created");
            await qc.invalidateQueries({ queryKey: ["sources"] });
            setOpen(false);
          }}
        >
          <Input name="platform" placeholder="Lancers" required />
          <Input name="url" type="url" placeholder="https://…" required />
          <Input name="poll" type="number" min={60} max={86400} defaultValue={180} />
          <Input name="parser" defaultValue="1.0.0" />
          <div className="space-y-2">
            <Label>Scraping type</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as ScrapingType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit">Create source</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
