import { NextResponse } from "next/server";

export function parsePositiveId(value: string | undefined, label: string): number | NextResponse {
  if (!value || !/^\d+$/u.test(value)) {
    return NextResponse.json(
      { type: "about:blank", title: `Invalid ${label} id`, status: 400 },
      { status: 400, headers: { "content-type": "application/problem+json" } },
    );
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json(
      { type: "about:blank", title: `Invalid ${label} id`, status: 400 },
      { status: 400, headers: { "content-type": "application/problem+json" } },
    );
  }
  return id;
}
