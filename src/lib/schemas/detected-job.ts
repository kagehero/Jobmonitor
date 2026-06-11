import { z } from "zod";

import { JOB_STATUS_VALUES } from "@/lib/job-status";

export const detectedJobPatchSchema = z.object({
  notificationSent: z.boolean().optional(),
  status: z.enum(JOB_STATUS_VALUES).optional(),
  // 応募見積もり金額（円）。null でクリア可能。
  appliedAmount: z.number().int().min(0).max(100_000_000).nullable().optional(),
});

export const detectedJobBulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  notificationSent: z.boolean(),
});
