import { ScrapingType } from "@prisma/client";
import { z } from "zod";

export const scrapingTypeSchema = z.nativeEnum(ScrapingType);

export const monitoringSourceCreateSchema = z.object({
  platform: z.string().min(1).max(128),
  url: z.string().url(),
  scrapingType: scrapingTypeSchema.optional(),
  pollingInterval: z.number().int().min(60).max(86400).optional(),
  active: z.boolean().optional(),
  parserVersion: z.string().max(64).optional(),
});

export const monitoringSourceUpdateSchema = monitoringSourceCreateSchema.partial();
