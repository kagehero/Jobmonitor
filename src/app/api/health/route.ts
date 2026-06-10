import { db } from "@/lib/db";
import { err, ok } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return ok({
      postgres: true,
      time: new Date().toISOString(),
    });
  } catch {
    return err("PostgreSQL unreachable", 503);
  }
}
