import { db } from "@/lib/db";
import { ok, err } from "@/lib/api-response";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export type JobLiveStats = {
  platform: string;
  applicants: number | null;
  deadline: string | null;
  deadlineDays: number | null;
  /** 案件が掲載された日時（ISO 文字列）。詳細ページから取得できない場合は null。 */
  postedAt: string | null;
  /**
   * 募集期間ラベル（例「募集期間 3日間」）。Lancers は詳細ページに投稿日時が
   * 出ないため、代わりにこの募集期間の長さを表示する。取得できない場合は null。
   */
  recruitmentPeriod: string | null;
};

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 JobHunterMonitor/1.0";

function htmlEntityDecode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

/**
 * 日本語日付文字列（YYYY年M月D日）または ISO 文字列から残り日数（切り上げ）を返す。
 * 時刻込みの文字列（例 "2026年06月13日 22:10"）も受け付ける。
 */
function parseDaysUntil(raw: string): number | null {
  // YYYY年M月D日 HH:MM または YYYY年M月D日
  const jp = raw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2}):(\d{2}))?/);
  if (jp) {
    const h = jp[4] ? parseInt(jp[4]) : 23;
    const m = jp[5] ? parseInt(jp[5]) : 59;
    const d = new Date(
      parseInt(jp[1]!),
      parseInt(jp[2]!) - 1,
      parseInt(jp[3]!),
      h,
      m,
    );
    return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  }
  // ISO YYYY-MM-DD
  const iso = raw.match(/(\d{4}-\d{2}-\d{2}(?:T[\d:+.Z-]+)?)/);
  if (iso) {
    const d = new Date(iso[1]!);
    if (!Number.isNaN(d.getTime()))
      return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  }
  return null;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lancers  https://www.lancers.jp/work/detail/{id}
// ---------------------------------------------------------------------------
// 実際のHTML構造（tableSummary div ベース）:
//   <p class="c-text ..."><i class="c-icon ..."></i>提案数</p>
//   <p class="c-heading c-heading--lv5 ...">49件</p>   ← 別 <p> タグ
//
// 「提案数」テキストと「49件」の間に ~78 文字の HTML が挟まるため
// {0,80} の窓では届かない → {0,300} に拡張。
//
// 締切はアクティブ案件の本文行:
//   「開始： 2026年06月10日 締切： 2026年06月13日 22:10 希望納期： 2026年06月25日」
// または tableSummary__col--time の <p> 内に直接記載される。
// ---------------------------------------------------------------------------
async function scrapeLancers(
  url: string,
): Promise<Omit<JobLiveStats, "platform">> {
  const html = await fetchPage(url);
  if (!html)
    return {
      applicants: null, deadline: null, deadlineDays: null,
      postedAt: null, recruitmentPeriod: null,
    };

  let applicants: number | null = null;
  let deadline: string | null = null;
  let deadlineDays: number | null = null;
  let postedAt: string | null = null;
  let recruitmentPeriod: string | null = null;

  // ── 提案数 ──────────────────────────────────────────────────────────────
  // tableSummary 構造では "提案数" と "49件" が別 <p> タグ（間に ~78 文字）
  // パターン1: タグ境界を確認しつつ取得（>N件< の形式）
  // パターン2: より緩いフォールバック
  const appPatterns: RegExp[] = [
    /提案数[\s\S]{0,300}?>\s*(\d[\d,]*)\s*件\s*</,
    /提案数[\s\S]{0,300}?(\d[\d,]*)\s*件/,
  ];
  for (const pat of appPatterns) {
    const m = html.match(pat);
    if (m?.[1]) {
      const n = parseInt(m[1].replace(/,/g, ""), 10);
      if (!Number.isNaN(n)) { applicants = n; break; }
    }
  }

  // ── 締切日 ───────────────────────────────────────────────────────────────
  // アクティブ案件の本文: 「締切： YYYY年MM月DD日 HH:MM」
  // または tableSummary__col--time の <p> 内に記載
  const dlPatterns: RegExp[] = [
    // 本文行 "締切： 2026年06月13日 22:10"（時刻あり/なし両対応）
    /締切[：:]\s*(\d{4}年\d{1,2}月\d{1,2}日(?:\s+\d{1,2}:\d{2})?)/,
    // tableSummary 構造: "締切" ラベルの直後 <p> 内の日付
    /締切[\s\S]{0,300}?>\s*(\d{4}年\d{1,2}月\d{1,2}日(?:\s*\d{1,2}:\d{2})?)\s*</,
    // フォールバック: "締切" 以降 200 文字以内の日付
    /締切[\s\S]{0,200}?(\d{4}年\d{1,2}月\d{1,2}日)/,
  ];
  for (const pat of dlPatterns) {
    const m = html.match(pat);
    if (m?.[1]) {
      deadline = m[1].trim();
      deadlineDays = parseDaysUntil(deadline);
      break;
    }
  }

  // ── 投稿日時（掲載開始日） ─────────────────────────────────────────────────
  // アクティブ案件の本文: 「開始： 2026年06月10日 締切： …」。
  // 終了済み案件では表示されないため null になる（締切と同じ挙動）。
  {
    const m = html.match(/開始[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) {
      const dt = new Date(
        parseInt(m[1]!), parseInt(m[2]!) - 1, parseInt(m[3]!),
        m[4] ? parseInt(m[4]) : 0, m[5] ? parseInt(m[5]) : 0,
      );
      if (!Number.isNaN(dt.getTime())) postedAt = dt.toISOString();
    }
  }

  // ── 募集期間（投稿日時の代替） ─────────────────────────────────────────────
  // Lancers 詳細ページには投稿日時が出ないため、代わりに「募集期間 N日間」を表示。
  // ラベルと値は別タグに分かれるため、タグを除去した平文で検索する。
  {
    const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const m = plain.match(/募集期間\s*(\d+\s*(?:日間|時間|週間|ヶ月|か月|分)|短期|長期)/);
    if (m?.[1]) recruitmentPeriod = `募集期間 ${m[1].replace(/\s+/g, "")}`;
  }

  return { applicants, deadline, deadlineDays, postedAt, recruitmentPeriod };
}

// ---------------------------------------------------------------------------
// CrowdWorks  https://crowdworks.jp/public/jobs/{id}
// ---------------------------------------------------------------------------
// 表示例（案件詳細ページ）:
//   応募期限   2026年06月11日
//   応募状況   応募した人 11 人  契約した人 0 人  募集人数 1 人
// ---------------------------------------------------------------------------
async function scrapeCrowdWorks(
  url: string,
): Promise<Omit<JobLiveStats, "platform">> {
  const html = await fetchPage(url);
  if (!html)
    return {
      applicants: null, deadline: null, deadlineDays: null,
      postedAt: null, recruitmentPeriod: null,
    };

  let applicants: number | null = null;
  let deadline: string | null = null;
  let deadlineDays: number | null = null;
  let postedAt: string | null = null;

  // ── vue-container JSON（最優先） ─────────────────────────────────────────
  const vcMatch = html.match(/id="vue-container"[^>]*\sdata="([^"]+)"/);
  if (vcMatch?.[1]) {
    try {
      const data = JSON.parse(htmlEntityDecode(vcMatch[1])) as Record<string, unknown>;

      // 詳細ページ: data.job_offer  /  検索ページ: data.searchResult.job_offers[0].job_offer
      const joRaw: unknown =
        data.job_offer ??
        (Array.isArray((data.searchResult as Record<string, unknown> | undefined)?.job_offers)
          ? ((data.searchResult as Record<string, unknown>).job_offers as unknown[])[0]
          : undefined);

      const jo: Record<string, unknown> | null =
        joRaw && typeof joRaw === "object"
          ? (((joRaw as Record<string, unknown>).job_offer as Record<string, unknown> | undefined) ??
              (joRaw as Record<string, unknown>))
          : null;

      if (jo) {
        // 応募数: entry_count / entries_count / applied_count / applicant_count
        for (const key of ["entry_count", "entries_count", "applied_count", "applicant_count"]) {
          if (typeof jo[key] === "number") { applicants = jo[key] as number; break; }
        }
        // 締切: end_date / close_date / deadline / expires_at
        if (!deadline) {
          for (const key of ["end_date", "close_date", "deadline", "expires_at", "closed_at"]) {
            const v = jo[key];
            if (typeof v === "string" && v) {
              const d = new Date(v);
              if (!Number.isNaN(d.getTime())) {
                deadline = d.toLocaleDateString("ja-JP", {
                  year: "numeric", month: "long", day: "numeric",
                });
                deadlineDays = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
                break;
              }
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  // ── JSON-LD（締切・投稿日時） ─────────────────────────────────────────────
  // JobPosting 構造化データ: validThrough（締切）/ datePosted（掲載日時）
  // 例: "datePosted": "2026-06-10 23:22:02 +0900", "validThrough": "2026-06-15"
  {
    const ldMatch = html.match(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
    );
    if (ldMatch?.[1]) {
      try {
        const ld: unknown = JSON.parse(ldMatch[1]);
        const obj = Array.isArray(ld) ? ld[0] : ld;
        if (obj && typeof obj === "object") {
          const rec = obj as Record<string, unknown>;
          if (!deadline) {
            const vt = rec.validThrough;
            if (typeof vt === "string") {
              const dt = new Date(vt);
              if (!Number.isNaN(dt.getTime())) {
                deadline = dt.toLocaleDateString("ja-JP", {
                  year: "numeric", month: "long", day: "numeric",
                });
                deadlineDays = Math.ceil((dt.getTime() - Date.now()) / 86_400_000);
              }
            }
          }
          if (!postedAt && typeof rec.datePosted === "string") {
            const dp = new Date(rec.datePosted);
            if (!Number.isNaN(dp.getTime())) postedAt = dp.toISOString();
          }
        }
      } catch { /* ignore */ }
    }
  }

  // ── HTML テキストフォールバック ───────────────────────────────────────────
  // 「応募した人 11 人」
  if (applicants === null) {
    const m = html.match(/応募した人[\s\S]{0,20}?([\d,]+)\s*人/);
    if (m?.[1]) {
      const n = parseInt(m[1].replace(/,/g, ""), 10);
      if (!Number.isNaN(n)) applicants = n;
    }
  }

  // 「応募期限\n2026年06月11日」
  if (!deadline) {
    const m = html.match(/応募期限[\s\S]{0,100}?(\d{4}年\d{1,2}月\d{1,2}日)/);
    if (m?.[1]) {
      deadline = m[1].trim();
      deadlineDays = parseDaysUntil(m[1]);
    }
  }

  // 「掲載日 2026年06月10日」（JSON-LD datePosted が取れない場合のフォールバック）
  if (!postedAt) {
    const m = html.match(/掲載日[\s\S]{0,40}?(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (m) {
      const dt = new Date(
        parseInt(m[1]!), parseInt(m[2]!) - 1, parseInt(m[3]!),
      );
      if (!Number.isNaN(dt.getTime())) postedAt = dt.toISOString();
    }
  }

  return { applicants, deadline, deadlineDays, postedAt, recruitmentPeriod: null };
}

// ---------------------------------------------------------------------------

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const job = await db.detectedJob.findUnique({
    where: { id },
    select: { projectUrl: true, source: { select: { platform: true } } },
  });

  if (!job) return err("Job not found", 404);

  const url = job.projectUrl;
  const platform = job.source.platform;
  const urlLower = url.toLowerCase();

  let stats: Omit<JobLiveStats, "platform">;
  if (urlLower.includes("lancers.jp")) {
    stats = await scrapeLancers(url);
  } else if (urlLower.includes("crowdworks.jp")) {
    stats = await scrapeCrowdWorks(url);
  } else {
    return err("Unsupported platform URL", 400);
  }

  return ok<JobLiveStats>({ platform, ...stats });
}
