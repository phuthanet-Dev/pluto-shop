import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createRemoteJWKSet,
  EncryptJWT,
  jwtDecrypt,
  jwtVerify,
} from "jose";
import {
  publicAppRedirect,
  realmRoles,
  safeCallbackPath,
  type AuthSession,
} from "@/lib/auth";

const DEFAULT_ISSUER = "http://127.0.0.1:8081/realms/pluto";
const SESSION_COOKIE = "pluto_session";
const STATE_COOKIE = "pluto_oidc_state";
const VERIFIER_COOKIE = "pluto_oidc_verifier";
const NONCE_COOKIE = "pluto_oidc_nonce";
const CALLBACK_COOKIE = "pluto_oidc_callback";

type OidcConfiguration = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

type StoredSession = AuthSession & {
  accessToken: string;
};

let discoveryPromise: Promise<OidcConfiguration> | undefined;
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function issuer(): string {
  return (process.env.OIDC_ISSUER ?? DEFAULT_ISSUER).replace(/\/$/u, "");
}

function internalIssuer(): string {
  return (process.env.OIDC_INTERNAL_ISSUER ?? issuer()).replace(/\/$/u, "");
}

function clientId(): string {
  return process.env.OIDC_CLIENT_ID ?? "pluto-web";
}

function publicAppOrigin(): string {
  return process.env.SITE_URL ?? "http://127.0.0.1:3000";
}

function sessionSecret(): Uint8Array | null {
  const value = process.env.AUTH_SESSION_SECRET;
  if (!value) return null;
  const secret = Buffer.from(value, "hex");
  if (secret.length !== 32) return null;
  return secret;
}

function baseCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function randomValue(): string {
  return randomBytes(32).toString("base64url");
}

function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function sameSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function discover(): Promise<OidcConfiguration> {
  if (!discoveryPromise) {
    discoveryPromise = fetch(`${internalIssuer()}/.well-known/openid-configuration`, {
      cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) throw new Error("OIDC discovery failed");
      const configuration = (await response.json()) as OidcConfiguration;
      const publicOrigin = new URL(issuer()).origin;
      const internalOrigin = new URL(internalIssuer()).origin;
      const internalize = (endpoint: string) =>
        endpoint.startsWith(publicOrigin)
          ? `${internalOrigin}${endpoint.slice(publicOrigin.length)}`
          : endpoint;
      return {
        ...configuration,
        token_endpoint: internalize(configuration.token_endpoint),
        jwks_uri: internalize(configuration.jwks_uri),
      };
    });
  }
  return discoveryPromise;
}

function redirectUri(request: Request): string {
  return (
    process.env.OIDC_REDIRECT_URI ??
    new URL("/api/auth/callback", request.url).toString()
  );
}

export async function startLogin(
  request: Request,
  action: "login" | "register" = "login",
): Promise<Response> {
  const secret = sessionSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "authentication_not_configured" },
      { status: 503 },
    );
  }

  try {
    const requestUrl = new URL(request.url);
    const config = await discover();
    const state = randomValue();
    const verifier = randomValue();
    const nonce = randomValue();
    const callback = safeCallbackPath(requestUrl.searchParams.get("callbackUrl"));
    const authorization = new URL(config.authorization_endpoint);

    authorization.searchParams.set("client_id", clientId());
    authorization.searchParams.set("redirect_uri", redirectUri(request));
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("scope", "openid profile email");
    authorization.searchParams.set("state", state);
    authorization.searchParams.set("nonce", nonce);
    authorization.searchParams.set("code_challenge", codeChallenge(verifier));
    authorization.searchParams.set("code_challenge_method", "S256");
    if (action === "register") authorization.searchParams.set("kc_action", "register");

    const response = NextResponse.redirect(authorization);
    const options = baseCookieOptions(600);
    response.cookies.set(STATE_COOKIE, state, options);
    response.cookies.set(VERIFIER_COOKIE, verifier, options);
    response.cookies.set(NONCE_COOKIE, nonce, options);
    response.cookies.set(CALLBACK_COOKIE, callback, options);
    return response;
  } catch {
    return NextResponse.json(
      { error: "authentication_unavailable" },
      { status: 503 },
    );
  }
}

export async function finishLogin(request: Request): Promise<Response> {
  const secret = sessionSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "authentication_not_configured" },
      { status: 503 },
    );
  }

  const requestUrl = new URL(request.url);
  const cookieStore = await cookies();
  const state = cookieStore.get(STATE_COOKIE)?.value;
  const verifier = cookieStore.get(VERIFIER_COOKIE)?.value;
  const nonce = cookieStore.get(NONCE_COOKIE)?.value;
  const callback = safeCallbackPath(cookieStore.get(CALLBACK_COOKIE)?.value);
  const code = requestUrl.searchParams.get("code");
  const returnedState = requestUrl.searchParams.get("state");

  if (!state || !verifier || !nonce || !code || !returnedState || !sameSecret(state, returnedState)) {
    return NextResponse.json({ error: "invalid_auth_callback" }, { status: 400 });
  }

  try {
    const config = await discover();
    const tokenResponse = await fetch(config.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId(),
        code,
        redirect_uri: redirectUri(request),
        code_verifier: verifier,
      }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) throw new Error("OIDC token exchange failed");

    const token = (await tokenResponse.json()) as {
      access_token?: unknown;
      id_token?: unknown;
    };
    if (typeof token.access_token !== "string" || typeof token.id_token !== "string") {
      throw new Error("OIDC token response is incomplete");
    }

    jwks ??= createRemoteJWKSet(new URL(config.jwks_uri));
    const verified = await jwtVerify(token.id_token, jwks, {
      issuer: issuer(),
      audience: clientId(),
    });
    if (verified.payload.nonce !== nonce || typeof verified.payload.sub !== "string") {
      throw new Error("OIDC token claims are invalid");
    }

    const session: StoredSession = {
      sub: verified.payload.sub,
      email: typeof verified.payload.email === "string" ? verified.payload.email : undefined,
      name: typeof verified.payload.name === "string" ? verified.payload.name : undefined,
      roles: realmRoles(verified.payload),
      accessToken: token.access_token,
    };
    const encrypted = await new EncryptJWT(session)
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setIssuedAt()
      .setExpirationTime("8h")
      .encrypt(secret);
    const response = NextResponse.redirect(publicAppRedirect(callback, publicAppOrigin()));
    response.cookies.set(SESSION_COOKIE, encrypted, baseCookieOptions(8 * 60 * 60));
    for (const name of [STATE_COOKIE, VERIFIER_COOKIE, NONCE_COOKIE, CALLBACK_COOKIE]) {
      response.cookies.set(name, "", { ...baseCookieOptions(0), maxAge: 0 });
    }
    return response;
  } catch {
    return NextResponse.json({ error: "authentication_failed" }, { status: 502 });
  }
}

export async function getSession(): Promise<AuthSession | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;

  try {
    const { payload } = await jwtDecrypt(value, secret, {
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
    });
    if (typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      roles: realmRoles(payload),
    };
  } catch {
    return null;
  }
}

export function clearSession(): Response {
  const response = NextResponse.redirect(publicAppRedirect("/th", publicAppOrigin()));
  response.cookies.set(SESSION_COOKIE, "", { ...baseCookieOptions(0), maxAge: 0 });
  return response;
}
