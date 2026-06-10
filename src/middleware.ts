import { NextResponse, type NextRequest } from "next/server";

const WINDOW_MS = 60_000;
const MAX_REQ = 240;

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api")) return NextResponse.next();

  const key =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip")?.trim() ??
    "anon";
  const now = Date.now();
  type G = typeof globalThis & { __hits?: Map<string, number[]> };
  const g = globalThis as G;
  const m = g.__hits ?? new Map<string, number[]>();
  const arr = m.get(key) ?? [];
  while (arr.length && now - arr[0]! > WINDOW_MS) arr.shift();
  arr.push(now);
  m.set(key, arr);
  g.__hits = m;

  if (arr.length > MAX_REQ) {
    return NextResponse.json(
      {
        ok: false as const,
        error: { message: "Rate limit exceeded.", code: "RATE_LIMIT" },
      },
      { status: 429 },
    );
  }

  const res = NextResponse.next();

  const origin = req.headers.get("origin");
  const allow =
    origin && (origin.includes("localhost") || origin.endsWith(".vercel.app")) ? origin : "*";
  res.headers.set("Access-Control-Allow-Origin", allow);
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: res.headers });

  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
