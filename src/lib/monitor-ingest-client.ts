/** Fields mirrored from ``monitor.py`` ``job_public_dict`` / ingest ``raw`` payload. */

export type StoredClientSnapshot = {
  clientProfileUrl: string | null;
  clientOrders: string | null;
  clientRating: number | null;
  clientExtrasSummary: string | null;
  clientAvatarUrl: string | null;
};

function pickStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function pickRating(a: unknown, b: unknown): number | null {
  if (typeof a === "number" && Number.isFinite(a)) return a;
  if (typeof b === "number" && Number.isFinite(b)) return b;
  return null;
}

/** Normalize monitor ``raw`` into columns stored on ``DetectedJob`` for stable UX / querying. */
export function clientSnapshotFromMonitorRaw(raw: unknown): StoredClientSnapshot {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const profile = pickStr(r.client_profile_url) ?? pickStr(r.clientProfileUrl);
  const orders = pickStr(r.client_orders) ?? pickStr(r.clientOrders);
  const rating = pickRating(r.client_rating, r.clientRating);
  const extrasRaw = pickStr(r.client_extras) ?? pickStr(r.clientExtras);
  const extras = extrasRaw ? extrasRaw.replace(/\s+/g, " ").trim() : null;
  const avatar = pickStr(r.client_avatar_url) ?? pickStr(r.clientAvatarUrl);

  return {
    clientProfileUrl: profile,
    clientOrders: orders,
    clientRating: rating,
    clientExtrasSummary: extras && extras.length ? extras : null,
    clientAvatarUrl: avatar,
  };
}
