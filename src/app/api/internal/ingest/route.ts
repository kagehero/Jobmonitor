import { DiscordDeliveryStatus, Prisma } from "@prisma/client";

import { err, ok } from "@/lib/api-response";
import { db } from "@/lib/db";
import { ingestPollSchema } from "@/lib/schemas/ingest";
import {
  clientSnapshotFromMonitorRaw,
  entitySignalsFromMonitorRaw,
} from "@/lib/monitor-ingest-client";
import { normalizeProfileKey } from "@/lib/client-analysis";
import { guessClientEntity } from "@/lib/client-entity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function ingestSecretExpected() {
  return process.env.DASHBOARD_INGEST_SECRET?.trim() ?? "";
}

export async function POST(req: Request) {
  const expected = ingestSecretExpected();
  if (!expected)
    return err("Dashboard ingest is disabled — set DASHBOARD_INGEST_SECRET in dashboard/.env", 503);

  const auth = req.headers.get("authorization")?.trim() ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== expected) return err("Unauthorized", 401);

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const parsed = ingestPollSchema.safeParse(json);
  if (!parsed.success)
    return err("Validation failed", 422, { details: parsed.error.flatten() });

  const body = parsed.data;
  const parserVersion = body.parserVersion?.trim() || "monitor";

  const started = new Date(body.pollStartedAt);
  const finished = new Date(body.pollFinishedAt);

  try {
    // Interactive tx default timeout is 5s — large monitor batches exceed it and yield P2028
    // ("Transaction not found / invalid ID") on later operations (e.g. aiAnalysis.upsert).
    await db.$transaction(
      async (tx) => {
      const sourceByUrl = new Map<string, { id: string }>();
      const platformByUrl = new Map<string, string>();

      for (const L of body.listings) {
        platformByUrl.set(L.listingUrl, L.platform);
        const src = await tx.monitoringSource.upsert({
          where: { url: L.listingUrl },
          create: {
            platform: L.platform,
            url: L.listingUrl,
            scrapingType: L.scrapingType,
            pollingInterval: body.pollingIntervalSeconds,
            active: true,
            parserVersion,
            lastCheckedAt: finished,
            status: L.success ? "healthy" : "error",
          },
          update: {
            pollingInterval: body.pollingIntervalSeconds,
            parserVersion,
            lastCheckedAt: finished,
            status: L.success ? "healthy" : "error",
            scrapingType: L.scrapingType,
          },
        });
        sourceByUrl.set(L.listingUrl, { id: src.id });

        await tx.scrapeHistory.create({
          data: {
            sourceId: src.id,
            startedAt: started,
            finishedAt: finished,
            success: L.success,
            jobsFound: L.jobsFound,
            errorMessage: L.errorMessage ?? null,
            workerHost: body.workerHost?.trim() || null,
            logs: {
              monitor: true,
              platform: L.platform,
              jobsFound: L.jobsFound,
            } as Prisma.InputJsonValue,
          },
        });
      }

      // クライアント単位の事業主体（個人/法人）推定。profileKey ごとに最良候補を集約して後でまとめて upsert。
      type ProfileCandidate = {
        platform: string;
        displayName: string;
        signals: ReturnType<typeof entitySignalsFromMonitorRaw>;
      };
      const profileCandidates = new Map<string, ProfileCandidate>();

      for (const j of body.detectedJobs) {
        const src = sourceByUrl.get(j.listingUrl);
        if (!src) continue;

        const tags = [j.categoryLabel].filter(Boolean);
        const raw = (j.raw ?? {}) as Prisma.InputJsonValue;
        const snap = clientSnapshotFromMonitorRaw(j.raw ?? {});

        // 事業主体推定: プロフィールキー（無ければ skip — name-only は集約キーが不安定なため）。
        const profileKey = normalizeProfileKey(snap.clientProfileUrl);
        if (profileKey) {
          const signals = entitySignalsFromMonitorRaw(j.raw ?? {});
          const prev = profileCandidates.get(profileKey);
          // シグナル（official 等）が取れた候補を優先。名前は長い方を採用。
          const hasSignal =
            signals.isOfficialAccount != null ||
            signals.isCertifiedEmployer != null ||
            signals.identityVerified != null;
          const prevHasSignal =
            prev != null &&
            (prev.signals.isOfficialAccount != null ||
              prev.signals.isCertifiedEmployer != null ||
              prev.signals.identityVerified != null);
          if (!prev || (hasSignal && !prevHasSignal)) {
            profileCandidates.set(profileKey, {
              platform: platformByUrl.get(j.listingUrl) ?? "",
              displayName: j.clientName?.trim() || prev?.displayName || "",
              signals,
            });
          } else if (j.clientName?.trim() && j.clientName.trim().length > prev.displayName.length) {
            prev.displayName = j.clientName.trim();
          }
        }

        const jobRow = await tx.detectedJob.upsert({
          where: { projectUrl: j.detailUrl },
          create: {
            sourceId: src.id,
            title: j.title,
            description: j.listingSummary ?? "",
            budget: j.budget,
            clientName: j.clientName,
            clientProfileUrl: snap.clientProfileUrl,
            clientOrders: snap.clientOrders,
            clientRating: snap.clientRating,
            clientExtrasSummary: snap.clientExtrasSummary,
            clientAvatarUrl: snap.clientAvatarUrl,
            projectUrl: j.detailUrl,
            postedAt: null,
            detectedAt: finished,
            aiScore: null,
            tags,
            notificationSent: j.discordDelivered && Boolean(j.webhookUrl),
            rawData: raw,
          },
          update: {
            sourceId: src.id,
            title: j.title,
            description: j.listingSummary ?? "",
            budget: j.budget,
            clientName: j.clientName,
            detectedAt: finished,
            tags,
            notificationSent: j.discordDelivered && Boolean(j.webhookUrl),
            rawData: raw,
            clientProfileUrl: snap.clientProfileUrl,
            clientOrders: snap.clientOrders,
            clientRating: snap.clientRating,
            clientExtrasSummary: snap.clientExtrasSummary,
            clientAvatarUrl: snap.clientAvatarUrl,
          },
        });

        const excerpt = (j.listingSummary ?? "").slice(0, 4000);
        const analysisDoc = {
          source: "monitor.py",
          category_label: j.categoryLabel,
          work_id: j.workId,
          listing_excerpt: excerpt,
          note: "Scores below are placeholders (0). Text fields reflect the live HTML/JSON listing parse only — not an LLM.",
        };

        await tx.aiAnalysis.upsert({
          where: { detectedJobId: jobRow.id },
          create: {
            detectedJobId: jobRow.id,
            relevanceScore: 0,
            profitabilityScore: 0,
            spamScore: 0,
            urgencyScore: 0,
            analysisJson: analysisDoc as Prisma.InputJsonValue,
          },
          update: {
            analysisJson: analysisDoc as Prisma.InputJsonValue,
          },
        });

        if (!j.webhookUrl) continue;

        await tx.discordNotification.create({
          data: {
            detectedJobId: jobRow.id,
            webhookUrl: j.webhookUrl,
            status: j.discordDelivered ? DiscordDeliveryStatus.SENT : DiscordDeliveryStatus.FAILED,
            sentAt: j.discordDelivered ? finished : null,
            responseLog: j.discordDelivered
              ? ({ ok: true, source: "monitor.py" } as Prisma.InputJsonValue)
              : ({
                  ok: false,
                  source: "monitor.py",
                  error: j.discordError ?? "discord_post_failed",
                } as Prisma.InputJsonValue),
          },
        });
      }

      // クライアント事業主体（個人/法人）の自動推定を ClientProfile に反映。
      // manualOverride=true の行は手動確定値を尊重し、entityType を上書きしない。
      for (const [profileKey, cand] of profileCandidates) {
        const guess = guessClientEntity(cand.displayName, cand.signals);
        const signalsJson = {
          isOfficialAccount: cand.signals.isOfficialAccount,
          isCertifiedEmployer: cand.signals.isCertifiedEmployer,
          identityVerified: cand.signals.identityVerified,
          reason: guess.reason,
        } as Prisma.InputJsonValue;

        const existing = await tx.clientProfile.findUnique({
          where: { profileKey },
          select: { manualOverride: true },
        });

        if (!existing) {
          await tx.clientProfile.create({
            data: {
              profileKey,
              platform: cand.platform,
              displayName: cand.displayName,
              entityType: guess.type,
              autoEntityType: guess.type,
              autoConfidence: guess.confidence,
              manualOverride: false,
              signals: signalsJson,
            },
          });
        } else if (existing.manualOverride) {
          // 手動確定済み: 推定の参考値・シグナルのみ更新（表示用 entityType は触らない）。
          await tx.clientProfile.update({
            where: { profileKey },
            data: {
              platform: cand.platform,
              displayName: cand.displayName,
              autoEntityType: guess.type,
              autoConfidence: guess.confidence,
              signals: signalsJson,
            },
          });
        } else {
          await tx.clientProfile.update({
            where: { profileKey },
            data: {
              platform: cand.platform,
              displayName: cand.displayName,
              entityType: guess.type,
              autoEntityType: guess.type,
              autoConfidence: guess.confidence,
              signals: signalsJson,
            },
          });
        }
      }
    },
      { maxWait: 15_000, timeout: Math.min(55_000, (maxDuration ?? 60) * 1000 - 5_000) },
    );

    return ok({
      listings: body.listings.length,
      jobs: body.detectedJobs.length,
    });
  } catch (e) {
    console.error("[ingest]", e);
    let detail: unknown;
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      detail = { code: e.code, meta: e.meta, message: e.message };
    } else if (e instanceof Prisma.PrismaClientValidationError) {
      detail = { validation: e.message.slice(0, 2000) };
    } else if (e instanceof Error) {
      detail = { message: e.message };
    } else {
      detail = { message: String(e) };
    }

    return err("Ingest transaction failed", 500, { details: detail });
  }
}
