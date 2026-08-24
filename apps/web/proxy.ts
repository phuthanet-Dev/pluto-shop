import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const firstSegment = request.nextUrl.pathname.split("/")[1];
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pluto-locale", firstSegment === "en" ? "en" : "th");

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|og.png).*)"],
};
