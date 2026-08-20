import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "./auth";

export function apiError(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

/** Единая обёртка: наружу уходит код ошибки, подробности — только в лог. */
export async function handle<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    const data = await fn();
    return NextResponse.json(data ?? { ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return apiError("UNAUTHORIZED", 401);
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "VALIDATION", issues: err.issues },
        { status: 422 }
      );
    }
    if (err instanceof HttpError) return apiError(err.code, err.status);
    console.error("api error", err);
    return apiError("INTERNAL", 500);
  }
}

export class HttpError extends Error {
  constructor(
    public code: string,
    public status: number
  ) {
    super(code);
    this.name = "HttpError";
  }
}
