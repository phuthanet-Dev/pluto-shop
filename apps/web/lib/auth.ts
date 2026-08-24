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
  const roles = (payload as { realm_access?: { roles?: unknown } }).realm_access?.roles;
  if (!Array.isArray(roles)) return [];
  return roles.filter((role): role is string => typeof role === "string");
}
