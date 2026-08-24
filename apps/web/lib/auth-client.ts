import { z } from "zod";

const authUserSchema = z
  .object({
    sub: z.string().min(1),
    email: z.string().email().optional(),
    name: z.string().min(1).optional(),
    roles: z.array(z.string()),
  })
  .strict();

export const authSessionSchema = z.union([
  z.object({ authenticated: z.literal(false) }).strict(),
  z.object({ authenticated: z.literal(true), user: authUserSchema }).strict(),
]);

export type AuthSessionResponse = z.infer<typeof authSessionSchema>;

export async function fetchAuthSession(
  fetcher: typeof fetch = fetch,
): Promise<AuthSessionResponse> {
  try {
    const response = await fetcher("/api/auth/session", {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return { authenticated: false };
    const parsed = authSessionSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : { authenticated: false };
  } catch {
    return { authenticated: false };
  }
}
