import { clearSession } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return clearSession(request);
}
