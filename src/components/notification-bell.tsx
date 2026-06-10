"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRingIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "jh_notifications_last_read_detected_at";

type FeedItem = {
  id: string;
  title: string;
  detectedAt: string;
  projectUrl: string;
  platform: string;
};

type FeedPayload = {
  items: FeedItem[];
  totalUnread: number;
};

function readWatermark(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

function writeWatermark(iso: string) {
  localStorage.setItem(STORAGE_KEY, iso);
}

async function bootstrapWatermark(): Promise<string> {
  const res = await fetch("/api/notifications/watermark", { cache: "no-store" });
  const json = (await res.json()) as {
    ok: boolean;
    data?: { newestDetectedAt?: string | null };
    error?: { message?: string };
  };
  if (!json.ok || !json.data) throw new Error(json.error?.message ?? "Watermark failed");
  const w = json.data.newestDetectedAt ?? new Date().toISOString();
  writeWatermark(w);
  return w;
}

async function fetchUnreadFeed(after: string): Promise<FeedPayload> {
  const qs = new URLSearchParams({
    after,
    limit: "40",
  });
  const res = await fetch(`/api/notifications/feed?${qs}`, { cache: "no-store" });
  const json = (await res.json()) as { ok: boolean; data?: FeedPayload; error?: { message?: string } };
  if (!json.ok || !json.data) throw new Error(json.error?.message ?? "Feed failed");
  return json.data;
}

export function NotificationBell({ className }: { className?: string }) {
  const [mounted, setMounted] = React.useState(false);
  const [popOpen, setPopOpen] = React.useState(false);
  const prevUnreadRef = React.useRef<number | null>(null);

  React.useEffect(() => setMounted(true), []);

  const feedQuery = useQuery({
    queryKey: ["notification-feed"],
    enabled: mounted,
    queryFn: async () => {
      let after = readWatermark();
      if (!after) after = await bootstrapWatermark();
      return fetchUnreadFeed(after);
    },
    refetchInterval: 25_000,
    staleTime: 15_000,
  });

  React.useEffect(() => {
    if (!feedQuery.data || !mounted) return;
    const n = feedQuery.data.totalUnread;
    const prev = prevUnreadRef.current;
    if (prev !== null && n > prev) {
      const delta = n - prev;
      toast.info(delta === 1 ? "New job detected" : `${delta} new jobs`, {
        description: "Open the bell to review.",
      });
    }
    prevUnreadRef.current = n;
  }, [feedQuery.data, mounted]);

  const totalUnread = feedQuery.data?.totalUnread ?? 0;
  const items = feedQuery.data?.items ?? [];

  const markAllRead = React.useCallback(() => {
    const iso = new Date().toISOString();
    writeWatermark(iso);
    prevUnreadRef.current = 0;
    void feedQuery.refetch();
    toast.success("Marked all as read");
  }, [feedQuery]);

  const onOpenJob = React.useCallback(
    async (job: FeedItem) => {
      const next = job.detectedAt;
      const cur = readWatermark();
      const curD = cur ? new Date(cur).getTime() : 0;
      const nextD = new Date(next).getTime();
      if (nextD > curD) writeWatermark(next);
      window.open(job.projectUrl, "_blank", "noopener,noreferrer");
      await feedQuery.refetch();
    },
    [feedQuery],
  );

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className={cn("relative shrink-0", className)} disabled aria-hidden>
        <BellRingIcon className="size-4 opacity-40" />
      </Button>
    );
  }

  return (
    <Popover open={popOpen} onOpenChange={setPopOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative shrink-0", className)}
          aria-label={totalUnread ? `${totalUnread} unread job notifications` : "Job notifications"}
        >
          <BellRingIcon className="size-4" />
          {totalUnread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] font-semibold text-white dark:bg-sky-500">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(calc(100vw-2rem),22rem)] p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">New jobs</p>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
              <Link href="/jobs" onClick={() => setPopOpen(false)}>
                All jobs
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={totalUnread === 0}
              onClick={markAllRead}
            >
              Mark read
            </Button>
          </div>
        </div>

        {feedQuery.isError ? (
          <p className="px-3 py-6 text-center text-sm text-red-600 dark:text-red-400">
            {(feedQuery.error as Error).message}
          </p>
        ) : feedQuery.isLoading ? (
          <p className="px-3 py-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : totalUnread === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-zinc-500">You&apos;re caught up — no new detections since last read.</p>
        ) : (
          <ScrollArea className="h-[min(60vh,320px)]">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map((job) => (
                <li key={job.id}>
                  <button
                    type="button"
                    className="flex w-full gap-2 px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    onClick={() => onOpenJob(job)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">{job.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {job.platform}
                        </Badge>
                        <span className="text-[11px] text-zinc-500">
                          {formatDistanceToNow(new Date(job.detectedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <ExternalLinkIcon className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
                  </button>
                </li>
              ))}
              {feedQuery.data && feedQuery.data.totalUnread > feedQuery.data.items.length ? (
                <li className="px-3 py-3 text-center text-xs text-zinc-500">
                  +{feedQuery.data.totalUnread - feedQuery.data.items.length} more — open Jobs for full list
                </li>
              ) : null}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
