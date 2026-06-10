"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpDownIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  Clock3Icon,
  CopyIcon,
  ExternalLinkIcon,
  FilterIcon,
  HelpCircleIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PercentIcon,
  SparklesIcon,
  StarIcon,
  XCircleIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { motion } from "framer-motion";

import { ClientExtrasInline, LancersClientFeedbackStrip, parseLancersFeedbackCounts, stripLancersFeedbackPhrases } from "@/components/client-extras-inline";
import { sanitizeClientExtrasText } from "@/lib/client-extras-text";
import { cn } from "@/lib/utils";
import { PostingSourceBadges } from "@/components/posting-source-badges";

type ClientListingMeta = {
  ordersText: string | null;
  rating: number | null;
  extrasLine: string | null;
};

type JobRow = {
  id: string;
  title: string;
  description: string;
  budget: string;
  clientName: string;
  clientProfileUrl?: string | null;
  clientOrders?: string | null;
  clientRating?: number | null;
  clientExtrasSummary?: string | null;
  clientAvatarUrl?: string | null;
  projectUrl: string;
  postedAt: string | null;
  detectedAt: string;
  aiScore: number | null;
  tags: string[];
  notificationSent: boolean;
  platform: string;
  sourceUrl: string;
  aiScoreNormalized: number | null;
  notificationStatus: string;
  aiAnalysis: {
    relevanceScore: number;
    profitabilityScore: number;
    spamScore: number;
    urgencyScore: number;
    analysisJson: Record<string, unknown>;
  } | null;
  rawData: unknown;
};

type JobsListPayload = {
  jobs: JobRow[];
  total: number;
  page: number;
  limit: number;
  freshInWindow: number;
  totalPages: number;
};

function getRawRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

/**
 * Monitor ``job_public_dict`` uses snake_case. Merge camelCase aliases so ingested/transformed JSON still renders.
 */
function bridgedMonitorRaw(raw: unknown): Record<string, unknown> | null {
  const r = getRawRecord(raw);
  if (!r) return null;

  const detailRaw = r.detail_url ?? r.detailUrl;
  const detail_url =
    typeof detailRaw === "string" && detailRaw.trim() ? detailRaw.trim() : undefined;

  const nameRaw = r.client_name ?? r.clientName;
  const client_name =
    typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : undefined;

  const ordersRaw = r.client_orders ?? r.clientOrders;
  const client_orders =
    ordersRaw != null && String(ordersRaw).trim() ? String(ordersRaw).trim() : undefined;

  const ratingRaw = r.client_rating ?? r.clientRating;
  let client_rating: number | undefined;
  if (typeof ratingRaw === "number" && !Number.isNaN(ratingRaw)) client_rating = ratingRaw;

  const extrasRaw = r.client_extras ?? r.clientExtras;
  const client_extras =
    typeof extrasRaw === "string" && extrasRaw.trim() ? extrasRaw.trim().replace(/\s+/g, " ") : undefined;

  const profileRaw = r.client_profile_url ?? r.clientProfileUrl;
  const client_profile_url =
    typeof profileRaw === "string" && profileRaw.trim() ? profileRaw.trim() : undefined;

  const avatarRaw = r.client_avatar_url ?? r.clientAvatarUrl;
  const client_avatar_url =
    typeof avatarRaw === "string" && avatarRaw.trim() ? avatarRaw.trim() : undefined;

  return {
    ...r,
    ...(detail_url !== undefined ? { detail_url } : {}),
    ...(client_name !== undefined ? { client_name } : {}),
    ...(client_orders !== undefined ? { client_orders } : {}),
    ...(client_rating !== undefined ? { client_rating } : {}),
    ...(client_extras !== undefined ? { client_extras } : {}),
    ...(client_profile_url !== undefined ? { client_profile_url } : {}),
    ...(client_avatar_url !== undefined ? { client_avatar_url } : {}),
  };
}



/** Monitor `job_public_dict` uses snake_case (client_name, …). */
function clientNameFromRaw(raw: unknown): string | null {
  const r = bridgedMonitorRaw(raw);
  if (!r) return null;
  const n = r.client_name;
  if (typeof n === "string" && n.trim()) return n.trim();
  return null;
}

function extractOrdersFromExtras(extras: string): string | null {
  const m = extras.match(/発注\s*(\d+)/);
  return m?.[1] ?? null;
}

function extractRatingFromExtras(extras: string): number | null {
  const m = extras.match(/評価\s*([\d.,]+)/);
  if (!m?.[1]) return null;
  const n = parseFloat(m[1]!.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

/** Remove duplicate 発注/評価 fragments so we do not repeat chips in the subtitle. */
function extrasLineAfterChips(extras: string, ordersText: string | null, rating: number | null): string | null {
  let t = sanitizeClientExtrasText(extras.trim()).replace(/\s+/g, " ");
  if (!t) return null;

  // Drop "発注 N" if chip shows the same count
  if (ordersText) {
    t = t
      .replace(new RegExp(`発注\\s*${ordersText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "g"), " ")
      .replace(/\s*\/\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (rating != null) {
    const r1 = rating.toFixed(1);
    const r0 = String(rating % 1 === 0 ? Math.round(rating) : rating);
    t = t
      .replace(new RegExp(`評価\\s*${r1.replace(".", "\\.")}`, "g"), " ")
      .replace(new RegExp(`評価\\s*${r0.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  t = t.replace(/^[/｜|]\s*/, "").replace(/\s*[/｜|]\s*$/g, "").trim();
  const maxExtras = 200;
  if (t.length < 2) return null;
  return t.length > maxExtras ? `${t.slice(0, maxExtras - 1)}…` : t;
}

function isRedundantLancersExtras(extras: string, ordersText: string | null, rating: number | null): boolean {
  if (!ordersText || rating == null || !extras.trim()) return false;
  const rLabel = rating % 1 === 0 ? String(rating) : rating.toFixed(1);
  const escapedO = ordersText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedR = rLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hasO = new RegExp(`発注\\s*${escapedO}`, "u").test(extras);
  const hasR = new RegExp(`評価\\s*${escapedR}`, "u").test(extras);
  return hasO && hasR && extras.length < 120;
}

function parseClientListingMeta(raw: unknown): ClientListingMeta | null {
  const r = bridgedMonitorRaw(raw);
  if (!r) return null;

  let ordersText: string | null = null;
  if (r.client_orders != null && String(r.client_orders).trim()) {
    ordersText = String(r.client_orders).trim();
  }

  let rating: number | null = null;
  if (typeof r.client_rating === "number" && !Number.isNaN(r.client_rating)) {
    rating = r.client_rating;
  }

  const exRaw =
    typeof r.client_extras === "string" ? r.client_extras.trim().replace(/\s+/g, " ") : "";
  if (!ordersText && exRaw) {
    const fromEx = extractOrdersFromExtras(exRaw);
    if (fromEx) ordersText = fromEx;
  }
  if (rating == null && exRaw) {
    const fromEx = extractRatingFromExtras(exRaw);
    if (fromEx != null) rating = fromEx;
  }

  let extrasLine: string | null = null;
  if (exRaw) {
    const cleaned = exRaw;
    if (!isRedundantLancersExtras(cleaned, ordersText, rating)) {
      extrasLine = extrasLineAfterChips(cleaned, ordersText, rating);
    }
  }

  if (!ordersText && rating == null && !extrasLine) return null;
  return { ordersText, rating, extrasLine };
}

/** Prefer structured columns persisted from ingest; fall back to ``rawData`` parsing. */
function parseClientListingMetaMerged(job: JobRow): ClientListingMeta | null {
  const rawMeta = parseClientListingMeta(job.rawData);

  let ordersText =
    job.clientOrders != null && String(job.clientOrders).trim()
      ? String(job.clientOrders).trim()
      : null;
  let rating =
    typeof job.clientRating === "number" && Number.isFinite(job.clientRating)
      ? job.clientRating
      : null;

  if (!ordersText && rawMeta?.ordersText) ordersText = rawMeta.ordersText;
  if (rating == null && rawMeta?.rating != null) rating = rawMeta.rating;

  const storedExtras =
    typeof job.clientExtrasSummary === "string"
      ? job.clientExtrasSummary.trim().replace(/\s+/g, " ")
      : "";

  let extrasLine: string | null = null;
  if (storedExtras) {
    if (!isRedundantLancersExtras(storedExtras, ordersText, rating)) {
      extrasLine = extrasLineAfterChips(storedExtras, ordersText, rating);
    }
  }
  if (!extrasLine && rawMeta?.extrasLine) extrasLine = rawMeta.extrasLine;

  if (!ordersText && rating == null && !extrasLine) {
    if (!hasJobClientSignals(job)) return null;
    return { ordersText: null, rating: null, extrasLine: null };
  }
  return { ordersText, rating, extrasLine };
}

/** プラットフォーム別にチップを常時出すため、メタが空でも LW/CW 行では空メタを返す。 */
function clientStripMeta(job: JobRow): ClientListingMeta | null {
  const m = parseClientListingMetaMerged(job);
  if (m) return m;
  if (isLancersPlatformJob(job) || isCrowdWorksJob(job)) {
    return { ordersText: null, rating: null, extrasLine: null };
  }
  return null;
}

function hasJobClientSignals(job: JobRow): boolean {
  if (job.clientName?.trim()) return true;
  if (typeof job.clientProfileUrl === "string" && job.clientProfileUrl.trim()) return true;
  if (typeof job.clientOrders === "string" && job.clientOrders.trim()) return true;
  if (job.clientRating != null && Number.isFinite(job.clientRating)) return true;
  if (typeof job.clientExtrasSummary === "string" && job.clientExtrasSummary.trim()) return true;
  const r = bridgedMonitorRaw(job.rawData);
  if (!r) return false;
  if (typeof r.client_name === "string" && r.client_name.trim()) return true;
  if (typeof r.client_profile_url === "string" && r.client_profile_url.trim()) return true;
  if (r.client_orders != null && String(r.client_orders).trim()) return true;
  if (typeof r.client_rating === "number" && !Number.isNaN(r.client_rating)) return true;
  if (typeof r.client_extras === "string" && r.client_extras.trim()) return true;
  return false;
}

function isCrowdWorksJob(job: Pick<JobRow, "platform" | "projectUrl" | "rawData">): boolean {
  const p = job.platform?.toLowerCase() ?? "";
  if (p.includes("crowd")) return true;
  const du = bridgedMonitorRaw(job.rawData)?.detail_url ?? job.projectUrl;
  return typeof du === "string" && du.toLowerCase().includes("crowdworks.jp");
}

function isLancersPlatformJob(job: Pick<JobRow, "platform" | "projectUrl" | "rawData">): boolean {
  if (isCrowdWorksJob(job)) return false;
  const p = job.platform?.toLowerCase() ?? "";
  if (p.includes("lancer")) return true;
  const u = ((bridgedMonitorRaw(job.rawData)?.detail_url as string | undefined) ?? job.projectUrl ?? "").toLowerCase();
  return u.includes("lancers.jp");
}

/** DB の補足 + raw の client_extras を結合（発注率・完了率などの抽出用）。 */
function clientExtrasHaystack(job: JobRow): string {
  const parts: string[] = [];
  if (typeof job.clientExtrasSummary === "string" && job.clientExtrasSummary.trim()) {
    parts.push(job.clientExtrasSummary.trim().replace(/\s+/g, " "));
  }
  const r = bridgedMonitorRaw(job.rawData);
  if (typeof r?.client_extras === "string" && r.client_extras.trim()) {
    parts.push(r.client_extras.trim().replace(/\s+/g, " "));
  }
  return parts.join(" · ").replace(/\s+/g, " ").trim();
}

/** ランサーズ補足の「発注率 …」断片。無い・未計算は "—"。 */
function lancersOrderRateChipFromHaystack(haystack: string): string {
  const norm = haystack.replace(/\s+/g, " ");
  const key = "発注率";
  const i = norm.indexOf(key);
  if (i === -1) return "—";
  const rest = norm.slice(i + key.length).trim();
  const seg = rest.split("·")[0]?.trim() ?? "";
  if (!seg) return "—";
  if (/^([-—.—]+|%)$/.test(seg) || /^[-—.—]+%$/u.test(seg) || seg.startsWith("---")) return "—";
  return seg;
}

/** 補足プレビューから発注率行を除き、チップと重複させない。 */
function stripLancersOrderRateSegment(extrasPreview: string): string {
  const norm = extrasPreview.replace(/\s+/g, " ").trim();
  const key = "発注率";
  const i = norm.indexOf(key);
  if (i === -1) return norm;
  const before = norm.slice(0, i).trim();
  const rest = norm.slice(i + key.length).trim();
  let after = "";
  if (rest.includes("·")) {
    after = rest
      .split("·")
      .slice(1)
      .join("·")
      .trim();
  }
  const merged = [before, after].filter(Boolean).join(" · ").replace(/\s+/g, " ").trim();
  return merged.length ? merged : "";
}

/** CrowdWorks 補足の完了率「N%」。 */
function crowdworksCompletionRateChipFromHaystack(haystack: string): string {
  const norm = haystack.replace(/\s+/g, " ");
  const m = norm.match(/完了率\s*(\d{1,3}%)/u);
  if (m?.[1]) return m[1];
  return "—";
}

/** 補足プレビューから「完了率 N%」を除く。 */
function stripCrowdworksCompletionSegment(extrasPreview: string): string {
  const norm = extrasPreview.replace(/\s+/g, " ").trim();
  const replaced = norm.replace(/\s*完了率\s*\d{1,3}%\s*/u, " ").replace(/\s+/g, " ").trim();
  return replaced.length ? replaced : "";
}

/** Five stars on a 0–5 scale — supports fractional fill on the last active star. */
function ClientRatingStars({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(5, value));

  return (
    <span className="inline-flex items-center gap-px" title={`評価 ${value.toFixed(1)} / 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const low = i;
        const high = i + 1;
        let fillPct = 0;
        if (clamped >= high) fillPct = 100;
        else if (clamped > low) fillPct = (clamped - low) * 100;
        return (
          <span key={i} className="relative inline-flex size-3.5 shrink-0 overflow-hidden">
            <StarIcon className="size-3.5 text-zinc-300 dark:text-zinc-600" aria-hidden />
            {fillPct > 0 ? (
              <span
                className="pointer-events-none absolute left-0 top-0 h-full overflow-hidden"
                style={{ width: `${fillPct}%` }}
              >
                <StarIcon className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

function ClientMetaStrip({ job }: { job: JobRow }) {
  const meta = clientStripMeta(job);
  if (!meta) return null;

  const cw = isCrowdWorksJob(job);
  const lan = isLancersPlatformJob(job);
  const hay = clientExtrasHaystack(job);

  let extrasLine = meta.extrasLine;
  if (lan && extrasLine) {
    extrasLine = stripLancersOrderRateSegment(extrasLine);
    extrasLine = stripLancersFeedbackPhrases(extrasLine);
  } else if (cw && extrasLine) {
    extrasLine = stripCrowdworksCompletionSegment(extrasLine);
  }
  if (!extrasLine?.trim()) extrasLine = null;

  const ordersTitle = cw ? "契約数（クライアント）" : "発注数（クライアント）";
  const ratingTitle = cw ? "総合評価（星）" : "評価（一覧カード）";
  const ratingDisplay = meta.rating ?? 0;
  const ordersChip = meta.ordersText?.trim() || "—";
  const lancersRate = lan ? lancersOrderRateChipFromHaystack(hay) : null;
  const cwCompletion = cw ? crowdworksCompletionRateChipFromHaystack(hay) : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          title={ordersTitle}
        >
          <PackageIcon className="size-3 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />
          <span className="font-medium tabular-nums">{ordersChip}</span>
        </span>
        {lan ? (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-violet-500/35 bg-violet-500/10 px-1.5 py-0.5 text-[11px] text-violet-950 dark:border-violet-500/35 dark:bg-violet-500/15 dark:text-violet-100"
            title="発注率（クライアント補足・プロフィール由来）"
          >
            <PercentIcon className="size-3 shrink-0 text-violet-600 opacity-90 dark:text-violet-300" aria-hidden />
            <span className="max-w-[6rem] truncate font-medium tabular-nums">{lancersRate}</span>
          </span>
        ) : null}
        {cw ? (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-950 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-50"
            title="完了率（クライアント補足・プロフィール由来）"
          >
            <PercentIcon className="size-3 shrink-0 text-emerald-700 opacity-90 dark:text-emerald-300" aria-hidden />
            <span className="font-medium tabular-nums">{cwCompletion}</span>
          </span>
        ) : null}
        <span
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-50"
          title={meta.rating == null ? `${ratingTitle}（データなし · 0.0 として表示）` : ratingTitle}
        >
          <ClientRatingStars value={ratingDisplay} />
          <span className="font-semibold tabular-nums">{ratingDisplay.toFixed(1)}</span>
        </span>
      </div>
      {lan ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="sr-only">フィードバック</span>
          <LancersClientFeedbackStrip haystack={hay} compact />
        </div>
      ) : null}
      {extrasLine ? (
        <div
          className="line-clamp-2 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400"
          title={extrasLine}
        >
          <ClientExtrasInline text={extrasLine} compact className="text-zinc-500 dark:text-zinc-400" />
        </div>
      ) : null}
    </div>
  );
}

function resolveClientProfileUrl(job: JobRow): string | null {
  const db = typeof job.clientProfileUrl === "string" ? job.clientProfileUrl.trim() : "";
  if (db) {
    const s = db;
    if (s.startsWith("http://") || s.startsWith("https://")) return s;
    const base = job.platform === "CrowdWorks" ? "https://crowdworks.jp" : "https://www.lancers.jp";
    return `${base}${s.startsWith("/") ? "" : "/"}${s}`;
  }
  const r = bridgedMonitorRaw(job.rawData);
  if (!r) return null;
  const u = r.client_profile_url;
  if (typeof u !== "string" || !u.trim()) return null;
  const s = u.trim();
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  const base = job.platform === "CrowdWorks" ? "https://crowdworks.jp" : "https://www.lancers.jp";
  return `${base}${s.startsWith("/") ? "" : "/"}${s}`;
}

function ClientCell({ job }: { job: JobRow }) {
  const displayName = (job.clientName?.trim() || clientNameFromRaw(job.rawData) || "").trim();
  const metaPlain = React.useMemo(() => {
    const m = clientStripMeta(job);
    if (!m) return null;
    const bits: string[] = [];
    const cw = isCrowdWorksJob(job);
    const lan = isLancersPlatformJob(job);
    const hay = clientExtrasHaystack(job);

    bits.push(`${cw ? "契約" : "発注"} ${m.ordersText?.trim() || "—"}`);
    if (lan) bits.push(`発注率 ${lancersOrderRateChipFromHaystack(hay)}`);
    if (cw) bits.push(`完了率 ${crowdworksCompletionRateChipFromHaystack(hay)}`);
    bits.push(`${cw ? "総合評価" : "評価"} ${m.rating ?? 0}`);
    if (lan) {
      const fb = parseLancersFeedbackCounts(hay);
      bits.push(
        fb ? `フィードバック 良${fb.good}・悪${fb.bad}` : "フィードバック 未取得",
      );
    }

    let ex = m.extrasLine;
    if (ex) {
      if (lan) {
        ex = stripLancersOrderRateSegment(ex);
        ex = stripLancersFeedbackPhrases(ex);
      } else if (cw) ex = stripCrowdworksCompletionSegment(ex);
      if (ex.trim()) bits.push(ex);
    }
    return bits.length ? bits.join(" · ") : null;
  }, [job]);
  const profileUrl = resolveClientProfileUrl(job);
  const hasName = Boolean(displayName);
  const fullTitle = [displayName || null, metaPlain].filter(Boolean).join(" — ") || undefined;

  return (
    <TableCell className="max-w-[min(260px,32vw)] align-top">
      <div className="flex flex-col gap-1">
        {profileUrl ? (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sm font-medium text-sky-700 underline decoration-sky-700/30 underline-offset-2 hover:text-sky-600 hover:decoration-sky-600 dark:text-sky-400 dark:decoration-sky-500/40 dark:hover:text-sky-300"
            title={fullTitle}
            onClick={(e) => e.stopPropagation()}
          >
            {displayName || "クライアントプロフィール"}
          </a>
        ) : hasName ? (
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100" title={fullTitle}>
            {displayName}
          </span>
        ) : (
          <span className="text-sm text-zinc-400">—</span>
        )}
        <ClientMetaStrip job={job} />
      </div>
    </TableCell>
  );
}

const NEW_MS = 2 * 3600 * 1000;

/** True when scores are monitor ingest placeholders — not LLM-ranked. */
function isListingParseOnly(ai: JobRow["aiAnalysis"]): boolean {
  if (!ai) return false;
  const note = ai.analysisJson?.note;
  return typeof note === "string" && note.toLowerCase().includes("placeholder");
}

type NotifyDeliveryMeta = {
  label: string;
  Icon: LucideIcon;
  badgeClass: string;
  tooltip: string;
};

function notifyDeliveryMeta(status: string): NotifyDeliveryMeta {
  const u = status.toUpperCase();
  if (u === "SENT") {
    return {
      label: "Sent",
      Icon: CheckCircle2Icon,
      badgeClass:
        "border-emerald-600/50 bg-emerald-500/20 text-emerald-900 shadow-sm dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100",
      tooltip: "Discord accepted the webhook payload for this job (delivery recorded as sent).",
    };
  }
  if (u === "FAILED") {
    return {
      label: "Failed",
      Icon: XCircleIcon,
      badgeClass:
        "border-red-500/60 bg-red-500/15 text-red-800 dark:border-red-400/50 dark:bg-red-950/50 dark:text-red-200",
      tooltip:
        "Discord delivery failed (network, 429, invalid webhook, etc.). Check the Discord page for logs or your monitor output.",
    };
  }
  if (u === "PENDING") {
    return {
      label: "Pending",
      Icon: Clock3Icon,
      badgeClass:
        "border-amber-500/50 bg-amber-500/20 text-amber-950 shadow-sm dark:border-amber-400/45 dark:bg-amber-500/15 dark:text-amber-100",
      tooltip:
        "No successful Discord delivery is recorded yet — e.g. still queued, skipped, or monitor did not post to Discord for this row.",
    };
  }
  return {
    label: status || "Unknown",
    Icon: HelpCircleIcon,
    badgeClass: "border-zinc-400/40 bg-zinc-500/15 text-zinc-800 dark:border-zinc-600/50 dark:bg-zinc-800/60 dark:text-zinc-200",
    tooltip: `Status code «${status}» — compare with Discord delivery records.`,
  };
}

function NotifyDeliveryBadge({ status }: { status: string }) {
  const m = notifyDeliveryMeta(status);
  const Icon = m.Icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex max-w-full cursor-help text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950"
          aria-label={`Discord notification: ${m.label}. ${m.tooltip}`}
        >
          <Badge
            variant="outline"
            className={cn("h-7 gap-1.5 border px-2 py-0 text-[11px] font-semibold leading-none", m.badgeClass)}
          >
            <Icon className="size-3.5 shrink-0 opacity-90" aria-hidden />
            <span className="truncate">{m.label}</span>
          </Badge>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] text-left text-xs leading-relaxed">
        {m.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function DetectedJobsPaginationBar(props: {
  rangeStart: number;
  rangeEnd: number;
  total: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  setPageSize: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { rangeStart, rangeEnd, total, currentPage, totalPages, pageSize, setPage, setPageSize } = props;
  const atFirst = currentPage <= 1;
  const atLast = currentPage >= totalPages || totalPages < 1;

  return (
    <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{rangeStart}</span>
        <span className="mx-1">–</span>
        <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{rangeEnd}</span>
        <span className="text-zinc-500"> of </span>
        <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{total}</span>
        <span className="text-zinc-500"> results</span>
      </p>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <nav className="flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80" aria-label="Table pagination">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                disabled={atFirst || total === 0}
                onClick={() => setPage(1)}
                aria-label="First page"
              >
                <ChevronsLeftIcon className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">First page</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                disabled={atFirst || total === 0}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeftIcon className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Previous page</TooltipContent>
          </Tooltip>

          <span className="min-w-[6.5rem] px-1 text-center text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{currentPage}</span>
            <span className="text-zinc-500"> / </span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{Math.max(1, totalPages)}</span>
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                disabled={atLast || total === 0}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                <ChevronRightIcon className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Next page</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                disabled={atLast || total === 0}
                onClick={() => setPage(totalPages)}
                aria-label="Last page"
              >
                <ChevronsRightIcon className="size-4" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Last page</TooltipContent>
          </Tooltip>
        </nav>

        <Separator orientation="vertical" className="hidden h-7 sm:block" />

        <div className="flex items-center gap-2">
          <label htmlFor="jobs-page-size" className="whitespace-nowrap text-xs text-zinc-500">
            Per page
          </label>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger id="jobs-page-size" className="h-8 w-[84px] text-xs" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              {[10, 20, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export default function JobsPage() {
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");
  const [boardPf, setBoardPf] = React.useState<"" | "lw" | "cw">("");
  const [boardCat, setBoardCat] = React.useState<"" | "system" | "web">("");
  const [sort, setSort] = React.useState<"" | "score" | "posted">("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [detail, setDetail] = React.useState<JobRow | null>(null);

  React.useEffect(() => {
    setPage(1);
  }, [q, boardPf, boardCat, sort]);

  const qs = React.useMemo(() => {
    const u = new URLSearchParams();
    if (q.trim()) u.set("q", q.trim());
    if (boardPf) u.set("boardPf", boardPf);
    if (boardCat) u.set("boardCat", boardCat);
    if (sort) u.set("sort", sort);
    u.set("page", String(page));
    u.set("limit", String(pageSize));
    return u.toString();
  }, [q, boardPf, boardCat, sort, page, pageSize]);

  const { data, isLoading } = useQuery({
    queryKey: ["jobs", qs],
    queryFn: async () => {
      const res = await fetch(`/api/detected-jobs?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json.data as JobsListPayload;
    },
    placeholderData: (prev) => prev,
  });

  React.useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page]);

  const listJobs = data?.jobs ?? [];
  const total = data?.total ?? 0;
  const freshN = data?.freshInWindow ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const limit = data?.limit ?? pageSize;
  const currentPage = data?.page ?? page;

  const rangeStart = total === 0 ? 0 : (currentPage - 1) * limit + 1;
  const rangeEnd = Math.min(currentPage * limit, total);

  const bulk = useMutation({
    mutationFn: async (payload: { ids: string[]; notificationSent: boolean }) => {
      const res = await fetch("/api/detected-jobs/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error.message);
      return json.data as { updated: number };
    },
    onSuccess: (r) => {
      toast.success(`Updated ${r.updated} rows`);
      setSelected({});
      void qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const idsSelected = React.useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([k]) => k), [selected]);

  const toggleAll = (checked: boolean) => {
    if (!listJobs.length) return;
    const next: Record<string, boolean> = { ...selected };
    if (checked) for (const j of listJobs) next[j.id] = true;
    else for (const j of listJobs) delete next[j.id];
    setSelected(next);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Detected jobs</h1>
            {!isLoading && data ? (
              <>
                <Badge variant="secondary" className="tabular-nums">
                  {total} matching
                </Badge>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="cursor-help gap-1 border-emerald-500/40 bg-emerald-500/10 tabular-nums text-emerald-900 dark:text-emerald-200"
                    >
                      <SparklesIcon className="size-3.5 shrink-0" aria-hidden />
                      {freshN} new (2h)
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px] text-xs">
                    Jobs first detected in the last two hours, with current filters applied. Same window as the “Fresh” row highlight.
                  </TooltipContent>
                </Tooltip>
              </>
            ) : null}
          </div>
          <p className="text-sm text-zinc-500">Search, prioritize, and paginate — Discord status in Notify.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={idsSelected.length === 0 || bulk.isPending}
            onClick={() => bulk.mutate({ ids: idsSelected, notificationSent: true })}
          >
            Bulk mark notified
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={idsSelected.length === 0 || bulk.isPending}
            onClick={() => bulk.mutate({ ids: idsSelected, notificationSent: false })}
          >
            Bulk reset flag
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FilterIcon className="size-4 text-zinc-500" /> Filters
            </CardTitle>
            <CardDescription>サーバー側でキーワード、プラットフォーム（LW／CW）、カテゴリ（システム／Web）、並び順を適用します。</CardDescription>
          </div>
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap xl:justify-end">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="キーワード…" className="sm:max-w-xs" />
            <Select
              value={boardPf === "" ? "__pf_all__" : boardPf}
              onValueChange={(v) => setBoardPf(v === "__pf_all__" ? "" : (v as "lw" | "cw"))}
            >
              <SelectTrigger
                className="h-9 w-auto min-w-[5.75rem] max-w-none shrink-0 gap-2 overflow-hidden"
                aria-label="プラットフォーム: すべて／LW／CW"
              >
                <SelectValue placeholder="すべて" className="min-w-0 flex-1 truncate text-left" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="__pf_all__">すべて</SelectItem>
                <SelectItem value="lw">LW</SelectItem>
                <SelectItem value="cw">CW</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={boardCat === "" ? "__cat_all__" : boardCat}
              onValueChange={(v) => setBoardCat(v === "__cat_all__" ? "" : (v as "system" | "web"))}
            >
              <SelectTrigger
                className="h-9 w-auto min-w-[6.75rem] max-w-none shrink-0 gap-2 overflow-hidden sm:min-w-[7rem]"
                aria-label="求人カテゴリ: すべて／システム／Web（掲載元URLに基づく）"
              >
                <SelectValue placeholder="すべて" className="min-w-0 flex-1 truncate text-left" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                <SelectItem value="__cat_all__">すべて</SelectItem>
                <SelectItem value="system">システム</SelectItem>
                <SelectItem value="web">Web</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort || "__default"} onValueChange={(v) => setSort(v === "__default" ? "" : (v as typeof sort))}>
              <SelectTrigger className="flex h-9 w-auto min-w-[10.5rem] max-w-none shrink-0 gap-2 overflow-hidden sm:min-w-[11.5rem]">
                <ArrowUpDownIcon className="size-4 shrink-0 opacity-70" aria-hidden />
                <SelectValue placeholder="Sort" className="min-w-0 flex-1 truncate text-left" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default">Newest detected</SelectItem>
                <SelectItem value="score">AI score ↓</SelectItem>
                <SelectItem value="posted">Posted time ↓</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading && !data ? (
            <Skeleton className="h-96 w-full rounded-none rounded-b-xl" />
          ) : (
            <>
              <DetectedJobsPaginationBar
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                total={total}
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                setPage={setPage}
                setPageSize={setPageSize}
              />
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={Boolean(listJobs.length && listJobs.every((j) => selected[j.id]))}
                        onCheckedChange={(v) => toggleAll(!!v)}
                        aria-label="Select all rows on this page"
                      />
                    </TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead className="min-w-[6rem]">
                      <span className="block">Board</span>
                      <span className="block text-[10px] font-normal normal-case text-zinc-500 dark:text-zinc-400">
                        LW/CW · job category
                      </span>
                    </TableHead>
                    <TableHead className="min-w-[9rem]">Client</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead className="hidden sm:table-cell">AI</TableHead>
                    <TableHead className="min-w-[5.5rem]">
                      <span className="block">Notify</span>
                      <span className="block text-[10px] font-normal normal-case text-zinc-500 dark:text-zinc-400">Discord</span>
                    </TableHead>
                    <TableHead className="w-[112px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listJobs.map((job) => {
                    const detected = new Date(job.detectedAt).getTime();
                    const fresh = Date.now() - detected < NEW_MS;
                    const raw = job.aiScoreNormalized ?? job.aiScore;
                    const scorePct = raw != null ? (raw <= 2 ? raw * 100 : raw) : null;
                    const parseOnly = isListingParseOnly(job.aiAnalysis);
                    return (
                      <motion.tr
                        layout
                        key={job.id}
                        className={fresh ? "bg-emerald-500/5 hover:bg-muted/70" : "hover:bg-muted/50"}
                      >
                        <TableCell>
                          <Checkbox
                            checked={!!selected[job.id]}
                            onCheckedChange={(v) => setSelected((s) => ({ ...s, [job.id]: !!v }))}
                            aria-label={`Select ${job.title}`}
                          />
                        </TableCell>
                        <TableCell className="max-w-[320px]">
                          <button
                            type="button"
                            className="text-left"
                            onClick={() => setDetail(job)}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`line-clamp-2 font-medium ${fresh ? "text-emerald-800 dark:text-emerald-300" : "text-zinc-900 dark:text-zinc-100"}`}>
                                {job.title}
                              </p>
                              {fresh ? (
                                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[10px] uppercase">
                                  Fresh
                                </Badge>
                              ) : null}
                            </div>
                            <p className="truncate text-[11px] text-zinc-500">
                              Detected {formatDistanceToNow(new Date(job.detectedAt), { addSuffix: true })}
                            </p>
                          </button>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {job.tags.slice(0, 4).map((t) => (
                              <Badge key={t} variant="secondary" className="text-[10px]">
                                #{t}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[7.25rem] align-top">
                          <PostingSourceBadges dense platform={job.platform} listingUrl={job.sourceUrl} />
                        </TableCell>
                        <ClientCell job={job} />
                        <TableCell className="max-w-[140px] truncate text-sm" title={job.budget}>
                          {job.budget || "—"}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {parseOnly ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help text-xs text-zinc-500 underline decoration-dotted dark:text-zinc-400">
                                  Listing only
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-[220px] text-left">
                                Scores are not from an LLM yet — they come from the board listing parse (often 0).
                              </TooltipContent>
                            </Tooltip>
                          ) : scorePct != null ? (
                            <Badge variant="outline" className="font-mono text-xs font-normal tabular-nums">
                              {scorePct.toFixed(1)} pts
                            </Badge>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="align-middle">
                          <NotifyDeliveryBadge status={job.notificationStatus} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="size-8 shrink-0" asChild>
                                  <a
                                    href={job.projectUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Open job posting: ${job.title.slice(0, 80)}`}
                                  >
                                    <ExternalLinkIcon className="size-4" />
                                  </a>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Open posting in new tab</TooltipContent>
                            </Tooltip>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={`More actions: ${job.title.slice(0, 60)}`}>
                                  <MoreHorizontalIcon className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-[200px]">
                                <DropdownMenuItem asChild>
                                  <a href={job.projectUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLinkIcon />
                                    Open posting in new tab
                                  </a>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(job.projectUrl);
                                    toast.success("Job URL copied");
                                  }}
                                >
                                  <CopyIcon />
                                  Copy job URL
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setDetail(job)}>
                                  <InfoIcon />
                                  View details…
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                  {total === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <div className="flex flex-col items-center gap-2 py-14 text-center">
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">No jobs in this view</p>
                          <p className="max-w-md text-sm text-zinc-500">
                            Adjust filters or wait for{" "}
                            <code className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">monitor.py</code>{" "}
                            to ingest new postings. Rows only appear once a job has been detected at least once.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <DialogHeader className="shrink-0 border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
            <DialogTitle className="pr-10 leading-tight">{detail?.title}</DialogTitle>
            {detail ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">LW/CW · board</span>
                <PostingSourceBadges orientation="row" platform={detail.platform} listingUrl={detail.sourceUrl} />
              </div>
            ) : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-6 py-5 [scrollbar-gutter:stable]">
            {detail ? (
              <div className="space-y-4 pb-2 text-sm text-zinc-600 dark:text-zinc-400">
                <DetailRow
                  label="投稿のリンク"
                  value={
                    detail.projectUrl ? (
                      <a
                        href={detail.projectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-mono text-xs font-normal text-sky-700 underline decoration-sky-700/35 underline-offset-2 hover:text-sky-600 dark:text-sky-400"
                      >
                        {detail.projectUrl}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailRow
                  label="Listing feed"
                  value={
                    detail.sourceUrl ? (
                      <a
                        href={detail.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-mono text-xs font-normal text-sky-700 underline decoration-sky-700/35 underline-offset-2 hover:text-sky-600 dark:text-sky-400"
                      >
                        {detail.sourceUrl}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailRow label="Budget" value={detail.budget} />
                <DetailRow label="Client" value={detail.clientName?.trim() || clientNameFromRaw(detail.rawData) || "—"} />
                <DetailRow
                  label="Client profile"
                  value={
                    detail && resolveClientProfileUrl(detail) ? (
                      <a
                        href={resolveClientProfileUrl(detail)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-normal text-sky-700 underline decoration-sky-700/35 underline-offset-2 hover:text-sky-600 dark:text-sky-400"
                      >
                        {resolveClientProfileUrl(detail)}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailRow
                  label={isCrowdWorksJob(detail) ? "Contracts (client)" : "Orders (client)"}
                  value={detail.clientOrders?.trim() || "—"}
                />
                {isCrowdWorksJob(detail) ? (
                  <DetailRow
                    label="完了率（補足）"
                    value={crowdworksCompletionRateChipFromHaystack(clientExtrasHaystack(detail))}
                  />
                ) : (
                  <DetailRow label="発注率（補足）" value={lancersOrderRateChipFromHaystack(clientExtrasHaystack(detail))} />
                )}
                {isLancersPlatformJob(detail) ? (
                  <DetailRow
                    label="フィードバック"
                    value={<LancersClientFeedbackStrip haystack={clientExtrasHaystack(detail)} compact={false} />}
                  />
                ) : null}
                <DetailRow
                  label={isCrowdWorksJob(detail) ? "Rating (overall)" : "Rating (listing)"}
                  value={
                    typeof detail.clientRating === "number" && Number.isFinite(detail.clientRating)
                      ? `${detail.clientRating.toFixed(1)} / 5`
                      : "—"
                  }
                />
                <DetailRow
                  label="Client details"
                  value={(() => {
                    const raw = detail.clientExtrasSummary?.trim();
                    if (!raw) return "—";
                    const forInline = isLancersPlatformJob(detail) ? stripLancersFeedbackPhrases(raw) : raw;
                    if (!forInline.trim()) return "—";
                    return (
                      <span className="block whitespace-pre-wrap font-normal">
                        <ClientExtrasInline
                          text={forInline}
                          className="text-sm text-zinc-800 dark:text-zinc-100"
                        />
                      </span>
                    );
                  })()}
                />
                <DetailRow
                  label="Posted"
                  value={detail.postedAt ? new Date(detail.postedAt).toLocaleString() : "—"}
                />
                <DetailRow label="Detected" value={new Date(detail.detectedAt).toLocaleString()} />
                <DetailRow
                  label="Discord notify"
                  value={`${notifyDeliveryMeta(detail.notificationStatus).label} — ${detail.notificationStatus}`}
                />
                <DetailRow
                  label="AI relevance"
                  value={
                    detail.aiAnalysis && isListingParseOnly(detail.aiAnalysis)
                      ? "— (not LLM-ranked; placeholder from listing parse)"
                      : String(detail.aiAnalysis?.relevanceScore ?? detail.aiScore ?? "—")
                  }
                />
                <div>
                  <Label className="text-xs uppercase text-zinc-500">Description</Label>
                  <p className="mt-2 whitespace-pre-wrap">{detail.description || "(empty)"}</p>
                </div>
                <div>
                  <Label className="text-xs uppercase text-zinc-500">AI JSON</Label>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-100">
                    {JSON.stringify(detail.aiAnalysis?.analysisJson ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter className="shrink-0 gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800 sm:justify-between">
            <Button variant="outline" asChild>
              <a href={detail?.projectUrl ?? "#"} target="_blank" rel="noopener noreferrer">
                Open posting
              </a>
            </Button>
            <Button
              onClick={() => detail && navigator.clipboard.writeText(detail.projectUrl).then(() => toast.success("Copied"))}
            >
              Copy link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow(props: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-6">
      <p className="w-36 shrink-0 text-xs uppercase tracking-wide text-zinc-400">{props.label}</p>
      <div className="min-w-0 flex-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">{props.value}</div>
    </div>
  );
}
