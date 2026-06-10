const INDUSTRY_SEGMENT = /^発注したい業種\s*[：:]/u;

/** Drop Lancers 「発注したい業種 …」segments from ingest summary (monitor no longer emits them after fix; DB may lag). */
export function sanitizeClientExtrasText(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized || !normalized.includes("発注したい業種")) return normalized;
  return normalized
    .split(/\s*·\s*/u)
    .map((s) => s.trim())
    .filter((s) => s && !INDUSTRY_SEGMENT.test(s))
    .join(" · ")
    .replace(/\s+/g, " ")
    .trim();
}
