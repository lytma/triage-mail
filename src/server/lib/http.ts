import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./session";

/** Wrap a route handler with consistent error → JSON mapping. */
export function handle<T>(fn: () => Promise<T>) {
  return fn().catch((err) => {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.flatten() },
        { status: 422 },
      );
    }
    console.error("[api] unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  });
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
