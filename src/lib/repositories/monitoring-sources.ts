import { db } from "@/lib/db";

export function listMonitoringSources() {
  return db.monitoringSource.findMany({ orderBy: { createdAt: "desc" } });
}
