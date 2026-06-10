import { z } from "zod";

export const detectedJobPatchSchema = z.object({
  notificationSent: z.boolean().optional(),
});

export const detectedJobBulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  notificationSent: z.boolean(),
});
