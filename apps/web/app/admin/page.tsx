import { redirect } from "next/navigation";
import { hasAdminRole } from "@/lib/auth";
import { getSession } from "@/lib/auth-server";
import { LogoutDialog } from "@/components/logout-dialog";

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
        <LogoutDialog />
      </main>
    );
  }

  return (
    <main className="not-found" id="main-content">
      <span className="state-code">ADMIN / PLUTO SHOP</span>
      <h1>Admin console</h1>
      <p>Authentication is ready. Product and stock management is the next slice.</p>
      <LogoutDialog />
    </main>
  );
}
