import { z } from "zod";

import { ok, err } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  webhookUrl: z.string().url(),
  message: z.string().min(3).max(500).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return err("Invalid payload", 422, { details: parsed.error.flatten() });

  try {
    const res = await fetch(parsed.data.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content:
          parsed.data.message ??
          "Job Hunter dashboard test ping — webhook is reachable ✅",
      }),
    });

    const text = await res.text().catch(() => "");
    return ok({
      ok: res.ok,
      status: res.status,
      excerpt: text.slice(0, 600),
    });
  } catch (e) {
    return err("Webhook request failed", 502, {
      details: e instanceof Error ? e.message : "unknown_error",
    });
  }
}
