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
  mergeRealmRoles,
  publicAppRedirect,
  safeCallbackPath,
  sessionRoles,
  type AuthSession,
} from "@/lib/auth";

const DEFAULT_ISSUER = "http://127.0.0.1:8081/realms/pluto";
const SESSION_COOKIE = "pluto_session";
const STATE_COOKIE = "pluto_oidc_state";
const VERIFIER_COOKIE = "pluto_oidc_verifier";
const NONCE_COOKIE = "pluto_oidc_nonce";
const CALLBACK_COOKIE = "pluto_oidc_callback";
const LOGOUT_CALLBACK_PATH = "/api/auth/logout/callback";
const ACCESS_TOKEN_COOKIE = "pluto_oidc_access";

type OidcConfiguration = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
};

type StoredSession = AuthSession;

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
        userinfo_endpoint: configuration.userinfo_endpoint
          ? internalize(configuration.userinfo_endpoint)
          : undefined,
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

function logoutCallbackUri(callback: string): string {
  const url = new URL(LOGOUT_CALLBACK_PATH, publicAppOrigin());
  url.searchParams.set("callbackUrl", callback);
  return url.toString();
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
    authorization.searchParams.set("scope", "openid profile email roles");
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

function clearTransientCookies(response: NextResponse): void {
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE, NONCE_COOKIE, CALLBACK_COOKIE]) {
    response.cookies.set(name, "", { ...baseCookieOptions(0), maxAge: 0 });
  }
}

function redirectToFreshLogin(callback: string): Response {
  const login = new URL("/api/auth/login", publicAppOrigin());
  login.searchParams.set("callbackUrl", callback);
  const response = NextResponse.redirect(login);
  clearTransientCookies(response);
  return response;
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
    return redirectToFreshLogin(callback);
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

    const verifiedRoleClaims: unknown[] = [verified.payload];
    try {
      const accessVerified = await jwtVerify(token.access_token, jwks, {
        issuer: issuer(),
      });
      const audience = accessVerified.payload.aud;
      const targetsClient =
        accessVerified.payload.azp === clientId() ||
        audience === clientId() ||
        (Array.isArray(audience) && audience.includes(clientId()));
      if (targetsClient) verifiedRoleClaims.push(accessVerified.payload);
    } catch {
      // The ID token remains sufficient for authentication if the access token is opaque.
    }

    let userInfoClaims: unknown;
    if (mergeRealmRoles(...verifiedRoleClaims).length === 0 && config.userinfo_endpoint) {
      try {
        const userInfoResponse = await fetch(config.userinfo_endpoint, {
          headers: { authorization: `Bearer ${token.access_token}` },
          cache: "no-store",
        });
        if (userInfoResponse.ok) userInfoClaims = await userInfoResponse.json();
      } catch {
        // UserInfo is a role-claim fallback; ID-token authentication still stands.
      }
    }


    const session: StoredSession = {
      sub: verified.payload.sub,
      email: typeof verified.payload.email === "string" ? verified.payload.email : undefined,
      name: typeof verified.payload.name === "string" ? verified.payload.name : undefined,
      roles: mergeRealmRoles(...verifiedRoleClaims, userInfoClaims),
    };
    const encrypted = await new EncryptJWT(session)
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setIssuedAt()
      .setExpirationTime("8h")
      .encrypt(secret);
    const response = NextResponse.redirect(publicAppRedirect(callback, publicAppOrigin()));
    response.cookies.set(SESSION_COOKIE, encrypted, baseCookieOptions(8 * 60 * 60));
    const accessEncrypted = await new EncryptJWT({ token: token.access_token })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .encrypt(secret);
    response.cookies.set(ACCESS_TOKEN_COOKIE, accessEncrypted, baseCookieOptions(60 * 60));
    for (const name of [STATE_COOKIE, VERIFIER_COOKIE, NONCE_COOKIE, CALLBACK_COOKIE]) {
      response.cookies.set(name, "", { ...baseCookieOptions(0), maxAge: 0 });
    }
    return response;
  } catch {
    return NextResponse.json({ error: "authentication_failed" }, { status: 502 });
  }
}

async function getStoredSession(): Promise<StoredSession | null> {
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
      roles: sessionRoles(payload.roles),
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AuthSession | null> {
  const stored = await getStoredSession();
  if (!stored) return null;
  return stored;
}

export async function getAccessToken(): Promise<string | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const value = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!value) return null;

  try {
    const { payload } = await jwtDecrypt(value, secret, {
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
    });
    return typeof payload.token === "string" ? payload.token : null;
  } catch {
    return null;
  }
}

export async function startLogout(request: Request): Promise<Response> {
  const requestedCallback = new URL(request.url).searchParams.get("callbackUrl");
  const callback = requestedCallback === null ? "/th" : safeCallbackPath(requestedCallback);

  try {
    const config = await discover();
    if (!config.end_session_endpoint) throw new Error("OIDC logout is unavailable");
    const endSession = new URL(config.end_session_endpoint);
    endSession.searchParams.set("client_id", clientId());
    endSession.searchParams.set("post_logout_redirect_uri", logoutCallbackUri(callback));
    return NextResponse.redirect(endSession);
  } catch {
    return NextResponse.json({ error: "logout_unavailable" }, { status: 503 });
  }
}

function clearAuthCookies(response: NextResponse): void {
  for (const name of [SESSION_COOKIE, ACCESS_TOKEN_COOKIE, STATE_COOKIE, VERIFIER_COOKIE, NONCE_COOKIE, CALLBACK_COOKIE]) {
    response.cookies.set(name, "", { ...baseCookieOptions(0), maxAge: 0 });
  }
}

export function finishLogout(request: Request): Response {
  const callback = safeCallbackPath(new URL(request.url).searchParams.get("callbackUrl"));
  const response = NextResponse.redirect(publicAppRedirect(callback, publicAppOrigin()));
  clearAuthCookies(response);
  return response;
}
