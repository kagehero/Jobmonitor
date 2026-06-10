import { NextResponse } from "next/server";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiError = {
  ok: false;
  error: { message: string; code?: string; details?: unknown };
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true as const, data }, init);
}

export function err(
  message: string,
  status = 400,
  extras?: Omit<ApiError["error"], "message">,
) {
  return NextResponse.json(
    {
      ok: false as const,
      error: { message, ...extras },
    },
    { status },
  );
}
