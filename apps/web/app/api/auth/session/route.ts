import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  return NextResponse.json(
    session ? { authenticated: true, user: session } : { authenticated: false },
    { headers: { "cache-control": "no-store" } },
  );
}
