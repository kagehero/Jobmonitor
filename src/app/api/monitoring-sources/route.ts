import { monitoringSourceCreateSchema } from "@/lib/schemas/monitoring-source";
import { db } from "@/lib/db";
import { listMonitoringSources } from "@/lib/repositories/monitoring-sources";
import { err, ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listMonitoringSources();
  return ok(rows);
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const parsed = monitoringSourceCreateSchema.safeParse(json);
  if (!parsed.success)
    return err("Validation failed", 422, {
      details: parsed.error.flatten(),
    });

  const body = parsed.data;

  try {
    const row = await db.monitoringSource.create({
      data: {
        platform: body.platform,
        url: body.url,
        scrapingType: body.scrapingType,
        pollingInterval: body.pollingInterval,
        active: body.active ?? true,
        parserVersion: body.parserVersion ?? "1.0.0",
      },
    });
    return ok(row);
  } catch {
    return err("Could not persist source — duplicate URL?", 409);
  }
}
