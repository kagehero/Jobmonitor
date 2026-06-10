import { ScrapingType } from "@prisma/client";
import { z } from "zod";

export const ingestListingSchema = z.object({
  listingUrl: z.string().url(),
  platform: z.enum(["Lancers", "CrowdWorks"]),
  scrapingType: z.nativeEnum(ScrapingType),
  success: z.boolean(),
  jobsFound: z.number().int().min(0),
  errorMessage: z.string().max(8000).nullable().optional(),
});

export const ingestJobSchema = z.object({
  listingUrl: z.string().url(),
  categoryLabel: z.string().max(256),
  workId: z.string().max(96),
  title: z.string().min(1).max(8000),
  budget: z.string().max(8000),
  clientName: z.string().max(2048),
  detailUrl: z.string().url(),
  listingSummary: z.string().max(120000).optional().default(""),
  webhookUrl: z.string().url().optional(),
  discordDelivered: z.boolean(),
  discordError: z.string().max(4000).nullable().optional(),
  raw: z.record(z.unknown()).optional(),
});

export const ingestPollSchema = z.object({
  pollStartedAt: z.string().datetime({ offset: true }),
  pollFinishedAt: z.string().datetime({ offset: true }),
  workerHost: z.string().max(256).optional(),
  pollingIntervalSeconds: z.number().int().min(10).max(86400),
  parserVersion: z.string().max(128).optional(),
  listings: z.array(ingestListingSchema).min(1),
  detectedJobs: z.array(ingestJobSchema).default([]),
});

export type IngestPollInput = z.infer<typeof ingestPollSchema>;
