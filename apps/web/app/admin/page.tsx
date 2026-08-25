import { redirect } from "next/navigation";
import Link from "next/link";
import { hasAdminRole } from "@/lib/auth";
import { getSession } from "@/lib/auth-server";
import { AdminProductsConsole } from "@/components/admin-products-console";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login?callbackUrl=%2Fadmin");
  }

  if (!hasAdminRole(session)) {
    return (
      <main className="not-found" id="main-content">
        <span className="state-code">403 / FORBIDDEN</span>
        <h1>Admin access required</h1>
        <p>Your account is authenticated but does not have the ADMIN role.</p>
        <Link className="primary-button" href="/api/auth/logout?callbackUrl=%2Fth" prefetch={false}>
          Sign out
        </Link>
      </main>
    );
  }

  return (
    <main className="admin-page" id="main-content">
      <AdminProductsConsole />
      <Link className="primary-button" href="/api/auth/logout?callbackUrl=%2Fth" prefetch={false}>
        Sign out
      </Link>
    </main>
  );
}
