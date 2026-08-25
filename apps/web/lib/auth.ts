export type AuthSession = {
  sub: string;
  email?: string;
  name?: string;
  roles: string[];
};

export function safeCallbackPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("\r") ||
    value.includes("\n")
  ) {
    return "/admin";
  }
  return value;
}

export function publicAppRedirect(callbackPath: string, publicOrigin: string): string {
  return new URL(safeCallbackPath(callbackPath), publicOrigin).toString();
}

export function hasAdminRole(session: { roles?: string[] } | null | undefined): boolean {
  return Array.isArray(session?.roles) && session.roles.includes("ADMIN");
}

export function realmRoles(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as {
    realm_access?: { roles?: unknown };
    "realm_access.roles"?: unknown;
  };
  const nestedRoles = record.realm_access?.roles;
  const flatRoles = record["realm_access.roles"];
  const roles = Array.isArray(nestedRoles) ? nestedRoles : flatRoles;
  if (!Array.isArray(roles)) return [];
  return roles.filter((role): role is string => typeof role === "string");
}

export function mergeRealmRoles(...payloads: unknown[]): string[] {
  return [...new Set(payloads.flatMap(realmRoles))];
}

export function sessionRoles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((role): role is string => typeof role === "string");
}
