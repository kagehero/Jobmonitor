import { db } from "@/lib/db";
import { ok, err } from "@/lib/api-response";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export type JobLiveStats = {
  platform: string;
  applicants: number | null;
  deadline: string | null;
  deadlineDays: number | null;
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

function parseDaysUntil(raw: string): number | null {
  const jp = raw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (jp) {
    const d = new Date(parseInt(jp[1]!), parseInt(jp[2]!) - 1, parseInt(jp[3]!));
    return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  }
  const iso = raw.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) {
    const d = new Date(iso[1]!);
    return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  }
  return null;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "ja,en;q=0.9" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function scrapeLancers(
  url: string,
): Promise<Omit<JobLiveStats, "platform">> {
  const html = await fetchPage(url);
  if (!html) return { applicants: null, deadline: null, deadlineDays: null };

  let applicants: number | null = null;
  let deadline: string | null = null;
  let deadlineDays: number | null = null;

  // 提案数 inside c-definition-list
  const appMatch = html.match(
    /提案数[^<]*<\/dt>\s*<dd[^>]*>\s*([\d,]+)\s*件?/,
  );
  if (appMatch?.[1]) {
    const n = parseInt(appMatch[1].replace(/,/g, ""), 10);
    if (!Number.isNaN(n)) applicants = n;
  }

  // 募集期限 / 締め切り
  const dlMatch = html.match(
    /(?:募集期限|締め切り)[^<]*<\/dt>\s*<dd[^>]*>\s*([^<\r\n]+)/,
  );
  if (dlMatch?.[1]) {
    deadline = dlMatch[1].trim();
    deadlineDays = parseDaysUntil(deadline);
  }

  return { applicants, deadline, deadlineDays };
}

async function scrapeCrowdWorks(
  url: string,
): Promise<Omit<JobLiveStats, "platform">> {
  const html = await fetchPage(url);
  if (!html) return { applicants: null, deadline: null, deadlineDays: null };

  let applicants: number | null = null;
  let deadline: string | null = null;
  let deadlineDays: number | null = null;

  // JSON-LD validThrough for deadline
  const ldMatch = html.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (ldMatch?.[1]) {
    try {
      const ld: unknown = JSON.parse(ldMatch[1]);
      const obj = Array.isArray(ld) ? ld[0] : ld;
      if (obj && typeof obj === "object" && "validThrough" in obj) {
        const vt = (obj as Record<string, unknown>).validThrough;
        if (typeof vt === "string") {
          const dt = new Date(vt);
          if (!Number.isNaN(dt.getTime())) {
            deadline = dt.toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
            });
            deadlineDays = Math.ceil((dt.getTime() - Date.now()) / 86_400_000);
          }
        }
      }
    } catch {
      /* ignore parse error */
    }
  }

  // vue-container JSON for entry/applicant count
  const vcMatch = html.match(/id="vue-container"[^>]*\sdata="([^"]+)"/);
  if (vcMatch?.[1]) {
    try {
      const data: unknown = JSON.parse(htmlEntityDecode(vcMatch[1]));
      if (data && typeof data === "object") {
        const d = data as Record<string, unknown>;
        const joRaw =
          (d.searchResult as Record<string, unknown> | undefined)
            ?.job_offers instanceof Array
            ? ((
                d.searchResult as Record<string, unknown>
              ).job_offers as unknown[])[0]
            : undefined;
        const jo =
          joRaw && typeof joRaw === "object"
            ? ((joRaw as Record<string, unknown>).job_offer as
                | Record<string, unknown>
                | undefined) ?? (joRaw as Record<string, unknown>)
            : (d.job_offer as Record<string, unknown> | undefined);
        if (jo) {
          for (const key of [
            "entry_count",
            "entries_count",
            "application_count",
            "applicant_count",
          ]) {
            const v = jo[key];
            if (typeof v === "number") {
              applicants = v;
              break;
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Fallback HTML pattern for entry count
  if (applicants === null) {
    const appMatch = html.match(/応募数[^<]*<\/[a-z]+>\s*[\s\S]{0,60}?(\d+)\s*件/);
    if (appMatch?.[1]) {
      const n = parseInt(appMatch[1], 10);
      if (!Number.isNaN(n)) applicants = n;
    }
  }

  return { applicants, deadline, deadlineDays };
}

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
