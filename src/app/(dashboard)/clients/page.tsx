"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, SearchIcon, StarIcon, UserIcon, UsersRoundIcon } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientExtrasInline } from "@/components/client-extras-inline";
import { sanitizeClientExtrasText } from "@/lib/client-extras-text";
import {
  absoluteProfileUrl,
  compareRecruitmentAchievementSort,
  type ClientAnalysisRow,
  type ClientAnalysisSummary,
} from "@/lib/client-analysis";
import { cn } from "@/lib/utils";

type Payload = {
  summary: ClientAnalysisSummary;
  clients: ClientAnalysisRow[];
  scan: { limit: number; orderedBy: "detectedAt_desc" };
};

/** 名前・プラットフォーム・補足・求人などをまとめた検索用文字列（小文字） */
function clientSearchHaystack(row: ClientAnalysisRow): string {
  const bits: string[] = [
    row.displayName,
    row.profilePath ?? "",
    row.latestJobTitle,
    row.extrasPreview ?? "",
    row.extrasFull ?? "",
    row.ordersDisplay ?? "",
    ...row.platforms,
    row.kind === "profile" ? "プロフィール" : "名前のみ",
  ];
  const platJoined = row.platforms.join(" ").toLowerCase();
  if (platJoined.includes("lancer")) bits.push("lw", "lancers");
  if (platJoined.includes("crowd")) bits.push("cw", "crowdworks");
  bits.push(typeof row.ratingDisplay === "number" ? row.ratingDisplay.toFixed(1) : "0");
  if (row.recruitmentAchievement != null) {
    bits.push(String(row.recruitmentAchievement), `募集実績 ${row.recruitmentAchievement}`);
  }
  const last = new Date(row.lastDetectedAt).toLocaleString().toLowerCase();
  bits.push(last, row.lastDetectedAt.slice(0, 10));
  return bits.filter(Boolean).join(" ").toLowerCase();
}

function filterClients(clients: ClientAnalysisRow[], query: string): ClientAnalysisRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return clients;
  return clients.filter((row) => clientSearchHaystack(row).includes(needle));
}

type ClientSortKey = "rating" | "lastDetected" | "recruitmentAchievement";

type ClientSortDir = "asc" | "desc";

function ratingSortValue(row: ClientAnalysisRow): number {
  return row.ratingDisplay != null && Number.isFinite(row.ratingDisplay) ? row.ratingDisplay : 0;
}

/** 評価・最終検出・募集実績（CWの募集実績件数／LWの発注数）で並べ替え。同順位は表示名で安定ソート。 */
function sortClientRows(rows: ClientAnalysisRow[], key: ClientSortKey, dir: ClientSortDir): ClientAnalysisRow[] {
  const mul = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (key === "rating") cmp = ratingSortValue(a) - ratingSortValue(b);
    else if (key === "lastDetected") cmp = Date.parse(a.lastDetectedAt) - Date.parse(b.lastDetectedAt);
    else
      cmp = compareRecruitmentAchievementSort(a.recruitmentAchievement, b.recruitmentAchievement, dir);
    if (key !== "recruitmentAchievement" && cmp !== 0) return cmp * mul;
    if (key === "recruitmentAchievement" && cmp !== 0) return cmp;
    return a.displayName.localeCompare(b.displayName, "ja");
  });
}

function ariaSortForColumn(activeKey: ClientSortKey, columnKey: ClientSortKey, dir: ClientSortDir) {
  if (activeKey !== columnKey) return undefined;
  return dir === "desc" ? ("descending" as const) : ("ascending" as const);
}

export default function ClientsAnalysisPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["client-analysis"],
    queryFn: async () => {
      const res = await fetch("/api/client-analysis", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message ?? "読み込みに失敗しました");
      return json.data as Payload;
    },
  });

  const [detailRow, setDetailRow] = React.useState<ClientAnalysisRow | null>(null);
  const [clientSearchQuery, setClientSearchQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<ClientSortKey>("lastDetected");
  const [sortDir, setSortDir] = React.useState<ClientSortDir>("desc");

  const filteredClients = React.useMemo(() => {
    if (!data?.clients) return [];
    return filterClients(data.clients, clientSearchQuery);
  }, [data?.clients, clientSearchQuery]);

  const displayedClients = React.useMemo(
    () => sortClientRows(filteredClients, sortKey, sortDir),
    [filteredClients, sortKey, sortDir],
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <UsersRoundIcon className="size-7 text-zinc-600 dark:text-zinc-300" aria-hidden />
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Client Analysis</h1>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          検出求人に保存されている発注者・クライアント情報（名前、プロフィールURL、評価、補足）を集約します。
          {data?.scan?.limit != null ? (
            <span className="block pt-1 text-xs text-zinc-400">
              直近 <span className="tabular-nums font-medium">{data.scan.limit}</span>{" "}
              件の検出求人を対象にしています（検出日時の新しい順）。
            </span>
          ) : null}
        </p>
      </header>

      {isLoading ? (
        <Skeleton className="h-[560px] w-full rounded-xl" />
      ) : error ? (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="text-red-700 dark:text-red-400">読み込みエラー</CardTitle>
            <CardDescription>{(error as Error).message}</CardDescription>
          </CardHeader>
        </Card>
      ) : data ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard title="ユニーククライアント" value={String(data.summary.uniqueClients)} />
            <MetricCard title="プロフィールURLあり" value={String(data.summary.clientsWithProfileUrl)} />
            <MetricCard title="クライアント紐付け求人" value={String(data.summary.jobsWithClientIdentity)} />
            <MetricCard title="スキャンした求人" value={String(data.summary.scannedJobs)} hint="対象件数上限内" />
            <MetricCard
              title="平均評価（一覧・プロフィール由来）"
              value={data.summary.avgRating != null ? data.summary.avgRating.toFixed(2) : "—"}
            />
          </section>

          {data.summary.platformMix.length > 0 ? (
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">プラットフォーム別（スキャン内の求人）</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {data.summary.platformMix
                  .slice()
                  .sort((a, b) => comparePlatformOrder(a.platform, b.platform))
                  .map((p) => {
                    const chip = platformChipStyles(p.platform);
                    return (
                      <span
                        key={p.platform}
                        title={chip.fullLabel}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs tabular-nums",
                          chip.className,
                        )}
                      >
                        <span className="font-semibold tracking-wide">{chip.abbr}</span>
                        <span className="font-medium opacity-90">{p.jobCount}</span>
                      </span>
                    );
                  })}
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="gap-4 space-y-0">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <CardTitle className="text-lg">クライアント一覧</CardTitle>
                </div>
                <div className="flex w-full shrink-0 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end xl:w-auto xl:justify-end">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="client-sort-key" className="whitespace-nowrap text-xs text-zinc-500">
                      並び替え
                    </Label>
                    <Select value={sortKey} onValueChange={(v) => setSortKey(v as ClientSortKey)}>
                      <SelectTrigger
                        id="client-sort-key"
                        className="h-9 w-[min(100%,240px)] bg-white dark:bg-zinc-950 sm:w-[240px]"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recruitmentAchievement">
                          募集実績
                        </SelectItem>
                        <SelectItem value="lastDetected">最終検出</SelectItem>
                        <SelectItem value="rating">評価</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={sortDir} onValueChange={(v) => setSortDir(v as ClientSortDir)}>
                      <SelectTrigger
                        id="client-sort-dir"
                        className="h-9 w-[112px] bg-white dark:bg-zinc-950"
                        aria-label="並び順（昇順・降順）"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="desc">降順</SelectItem>
                        <SelectItem value="asc">昇順</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="relative min-w-[200px] flex-1 lg:min-w-[220px] xl:w-72 xl:flex-none">
                    <SearchIcon
                      className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
                      aria-hidden
                    />
                    <Input
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      placeholder="名前・PF・補足・求人タイトル…"
                      className="bg-white pl-9 dark:bg-zinc-950"
                      aria-label="クライアントを検索"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            {clientSearchQuery.trim() !== "" ? (
              <p className="border-b border-zinc-100 px-6 pb-3 text-xs text-zinc-500 dark:border-zinc-800">
                <span className="tabular-nums font-medium text-zinc-700 dark:text-zinc-300">
                  {filteredClients.length}
                </span>
                <span className="mx-1">/</span>
                <span className="tabular-nums">{data.clients.length}</span>
                <span className="ml-1">件を表示</span>
              </p>
            ) : null}
            <CardContent className="overflow-x-auto p-0 sm:p-6">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[180px]">クライアント</TableHead>
                    <TableHead className="min-w-[100px]">種別</TableHead>
                    <TableHead className="min-w-[72px]">PF</TableHead>
                    <TableHead
                      className="text-right"
                      aria-sort={ariaSortForColumn(sortKey, "rating", sortDir)}
                    >
                      評価
                    </TableHead>
                    <TableHead className="min-w-[220px]">補足・詳細</TableHead>
                    <TableHead
                      className="min-w-[110px] text-right"
                      aria-sort={ariaSortForColumn(sortKey, "lastDetected", sortDir)}
                    >
                      最終検出
                    </TableHead>
                    <TableHead className="min-w-[72px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.clients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-zinc-500">
                        クライアント情報がまだありません。モニターから ingest された求人が溜まると表示されます。
                      </TableCell>
                    </TableRow>
                  ) : filteredClients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-zinc-500">
                        検索に一致するクライアントがありません。キーワードを変えるか削除してください。
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayedClients.map((c) => (
                      <ClientTableRow key={c.key} row={c} onOpenDetail={() => setDetailRow(c)} />
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
      <ClientDetailModal
        row={detailRow}
        open={detailRow != null}
        onOpenChange={(next) => {
          if (!next) setDetailRow(null);
        }}
      />
    </div>
  );
}

function ClientAvatar({
  src,
  displayName,
  size,
}: {
  src: string | null;
  displayName: string;
  size: "sm" | "lg";
}) {
  const [broken, setBroken] = React.useState(false);
  const dim = size === "sm" ? "h-9 w-9" : "h-20 w-20";
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 外部オリジン混在のため img で統一
      <img
        src={src}
        alt=""
        width={size === "sm" ? 36 : 80}
        height={size === "sm" ? 36 : 80}
        className={cn(dim, "shrink-0 rounded-full bg-zinc-200 object-cover dark:bg-zinc-800")}
        onError={() => setBroken(true)}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <div
      className={cn(
        dim,
        "flex shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
      )}
      title={displayName}
      aria-hidden
    >
      <UserIcon className={size === "sm" ? "size-4" : "size-10"} />
    </div>
  );
}

function ClientDetailModal({
  row,
  open,
  onOpenChange,
}: {
  row: ClientAnalysisRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!row) return null;

  const profileHref = absoluteProfileUrl(row.platforms, row.profilePath);
  const kindLabel = row.kind === "profile" ? "プロフィール" : "名前のみ";
  const extrasBody = (row.extrasFull ?? row.extrasPreview ?? "").trim();
  const anyCrowd = row.platforms.some((p) => p.toLowerCase().includes("crowd"));
  const ordersLabel = anyCrowd ? "契約数（一覧・プロフィール由来）" : "発注数（一覧・プロフィール由来）";
  const ratingLabel = anyCrowd ? "評価（一覧・総合）" : "評価（一覧カード）";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,820px)] max-w-xl gap-0 overflow-hidden p-0 sm:max-w-xl">
        <ScrollArea className="max-h-[min(88vh,800px)]">
          <div className="space-y-6 p-6 pt-10">
            <DialogHeader className="space-y-4 text-left">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <ClientAvatar src={row.avatarUrl} displayName={row.displayName} size="lg" />
                <div className="min-w-0 flex-1 space-y-1">
                  <DialogTitle className="pr-8 text-xl leading-snug">{row.displayName}</DialogTitle>
                  <DialogDescription className="text-sm">
                    検出求人から集約したクライアント情報のスナップショットです。
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="font-normal">
                種別: {kindLabel}
              </Badge>
              {[...row.platforms].sort(comparePlatformOrder).map((p) => {
                const chip = platformChipStyles(p);
                return (
                  <span
                    key={p}
                    title={chip.fullLabel}
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-xs font-semibold tracking-wide",
                      chip.className,
                    )}
                  >
                    {chip.abbr}
                  </span>
                );
              })}
            </div>

            <dl className="grid gap-4 text-sm">
              <div className="grid gap-1">
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">検出に紐づく求人数</dt>
                <dd className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">{row.jobCount}</dd>
              </div>
              <div className="grid gap-1">
                <dt
                  className="text-xs font-medium uppercase tracking-wide text-zinc-500"
                  title="CrowdWorks は雇用者プロフィールの募集実績件数。Lancers は補足に「募集実績」が無い場合、一覧の発注数を代替します。"
                >
                  募集実績（プラットフォーム）
                </dt>
                <dd className="font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                  {row.recruitmentAchievement != null ? (
                    <>
                      {row.recruitmentAchievement}
                      <span className="ml-0.5 font-normal text-zinc-600 dark:text-zinc-400">件</span>
                    </>
                  ) : (
                    <span className="font-normal text-zinc-400">—（未取得）</span>
                  )}
                </dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{ordersLabel}</dt>
                <dd className="text-zinc-900 dark:text-zinc-50">{row.ordersDisplay?.trim() || "—"}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{ratingLabel}</dt>
                <dd>
                  <span className="inline-flex flex-wrap items-center gap-2 tabular-nums">
                    <ClientAnalysisRatingStars
                      value={row.ratingDisplay ?? 0}
                      unavailable={row.ratingDisplay == null}
                    />
                    <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                      {(row.ratingDisplay ?? 0).toFixed(1)}
                    </span>
                    <span className="text-zinc-500">/ 5</span>
                  </span>
                </dd>
              </div>
              {row.profilePath ? (
                <div className="grid gap-1">
                  <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">プロフィールパス</dt>
                  <dd className="break-all font-mono text-xs text-zinc-600 dark:text-zinc-400">{row.profilePath}</dd>
                </div>
              ) : null}
              <div className="grid gap-1">
                <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">最終検出</dt>
                <dd className="tabular-nums text-zinc-700 dark:text-zinc-300">
                  {new Date(row.lastDetectedAt).toLocaleString()}
                </dd>
              </div>
            </dl>

            {extrasBody ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">補足・詳細</p>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 text-sm leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
                  <ClientExtrasInline text={extrasBody} className="text-sm text-zinc-700 dark:text-zinc-300" />
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              {profileHref ? (
                <a
                  href={profileHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 underline decoration-sky-700/35 underline-offset-2 hover:text-sky-600 dark:text-sky-400"
                >
                  プロフィールを開く
                  <ExternalLinkIcon className="size-4 shrink-0 opacity-80" aria-hidden />
                </a>
              ) : null}
              <a
                href={row.latestJobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-start gap-1.5 text-sm text-zinc-700 underline decoration-zinc-400/50 underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                <span className="shrink-0 font-medium text-zinc-500 dark:text-zinc-400">最新検出求人:</span>
                <span className="break-words">{row.latestJobTitle}</span>
                <ExternalLinkIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
              </a>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/** Five stars on a 0–5 scale — fractional fill on the last active star。``unavailable`` のときは 0 塗り＋評価なし扱い。 */
function ClientAnalysisRatingStars({
  value,
  unavailable,
}: {
  value: number;
  unavailable?: boolean;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  const tip = unavailable ? "評価なし" : `評価 ${value.toFixed(1)} / 5`;
  return (
    <span className="inline-flex items-center gap-px" title={tip} role="img" aria-label={tip}>
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

/** CrowdWorks / Lancers を CW・LW に短縮。低彩度のストーン／スレート系で区別（フル名は title に）。 */
function platformChipStyles(raw: string) {
  const fullLabel = raw.trim() || "Unknown";
  const t = fullLabel.toLowerCase();
  if (t.includes("crowd")) {
    return {
      abbr: "CW",
      fullLabel,
      className:
        "border-stone-300/60 bg-stone-100/95 text-stone-700 dark:border-stone-600/45 dark:bg-stone-900/55 dark:text-stone-300",
    };
  }
  if (t.includes("lancer")) {
    return {
      abbr: "LW",
      fullLabel,
      className:
        "border-slate-300/60 bg-slate-100/95 text-slate-700 dark:border-slate-600/45 dark:bg-slate-900/55 dark:text-slate-300",
    };
  }
  const short =
    fullLabel.length > 5 ? `${fullLabel.slice(0, 4)}…` : fullLabel || "—";
  return {
    abbr: short,
    fullLabel,
    className:
      "border-zinc-200/90 bg-zinc-100/90 text-zinc-600 dark:border-zinc-700/70 dark:bg-zinc-800/70 dark:text-zinc-400",
  };
}

function comparePlatformOrder(a: string, b: string): number {
  const rank = (s: string) => {
    const t = s.toLowerCase();
    if (t.includes("lancer")) return 0;
    if (t.includes("crowd")) return 1;
    return 2;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
}

function MetricCard(props: { title: string; value: string; hint?: string }) {
  return (
    <Card className="border-zinc-200 dark:border-zinc-800">
      <CardHeader className="pb-2">
        <CardDescription>{props.title}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{props.value}</CardTitle>
        {props.hint ? <p className="text-[11px] text-zinc-400">{props.hint}</p> : null}
      </CardHeader>
    </Card>
  );
}

function ClientTableRow({ row, onOpenDetail }: { row: ClientAnalysisRow; onOpenDetail: () => void }) {
  const profileHref = absoluteProfileUrl(row.platforms, row.profilePath);
  const kindLabel = row.kind === "profile" ? "プロフィール" : "名前のみ";

  return (
    <TableRow className="align-top">
      <TableCell>
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={`${row.displayName}の詳細を開く`}
          className="flex min-w-0 max-w-[min(240px,40vw)] items-center gap-2.5 rounded-lg text-left outline-none ring-offset-2 transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-400/80 dark:ring-offset-zinc-950 dark:hover:bg-zinc-900"
        >
          <ClientAvatar src={row.avatarUrl} displayName={row.displayName} size="sm" />
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{row.displayName}</span>
        </button>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-normal">
          {kindLabel}
        </Badge>
      </TableCell>
      <TableCell className="text-xs">
        <div className="flex flex-wrap gap-1">
          {[...row.platforms].sort(comparePlatformOrder).map((p) => {
            const chip = platformChipStyles(p);
            return (
              <span
                key={p}
                title={chip.fullLabel}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide",
                  chip.className,
                )}
              >
                {chip.abbr}
              </span>
            );
          })}
        </div>
      </TableCell>
      <TableCell className="text-right align-middle">
        <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
          <ClientAnalysisRatingStars
            value={row.ratingDisplay ?? 0}
            unavailable={row.ratingDisplay == null}
          />
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {(row.ratingDisplay ?? 0).toFixed(1)}
          </span>
        </span>
      </TableCell>
      <TableCell className="max-w-[320px]">
        {row.extrasPreview?.trim() ? (
          <div
            className="line-clamp-3 leading-relaxed text-zinc-600 dark:text-zinc-400"
            title={sanitizeClientExtrasText(row.extrasPreview.trim())}
          >
            <ClientExtrasInline text={row.extrasPreview} compact className="text-xs text-zinc-600 dark:text-zinc-400" />
          </div>
        ) : (
          <span className="text-xs text-zinc-400">—</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right text-xs text-zinc-500 tabular-nums">
        {new Date(row.lastDetectedAt).toLocaleString()}
      </TableCell>
      <TableCell className="space-y-1">
        {profileHref ? (
          <a
            href={profileHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-sky-600 underline underline-offset-2 hover:text-sky-500 dark:text-sky-400"
          >
            プロフィール
            <ExternalLinkIcon className="size-3 shrink-0 opacity-80" aria-hidden />
          </a>
        ) : (
          <span className="text-xs text-zinc-400">—</span>
        )}
        <a
          href={row.latestJobUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-[11px] text-zinc-500 underline decoration-zinc-400/40 underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
          title={row.latestJobTitle}
        >
          最新求人
        </a>
      </TableCell>
    </TableRow>
  );
}
