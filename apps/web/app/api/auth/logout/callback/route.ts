import { finishLogout } from "@/lib/auth-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return finishLogout(request);
}
