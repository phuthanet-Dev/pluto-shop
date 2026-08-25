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
        <span className="state-code">403 / ไม่มีสิทธิ์</span>
        <h1>ต้องมีสิทธิ์ผู้ดูแล</h1>
        <p>บัญชีของคุณเข้าสู่ระบบแล้ว แต่ไม่มีสิทธิ์ผู้ดูแลระบบ</p>
        <Link className="primary-button" href="/api/auth/logout?callbackUrl=%2Fth" prefetch={false}>
          ออกจากระบบ
        </Link>
      </main>
    );
  }

  return (
    <main className="admin-page" id="main-content">
      <AdminProductsConsole />
      <Link className="primary-button" href="/api/auth/logout?callbackUrl=%2Fth" prefetch={false}>
        ออกจากระบบ
      </Link>
    </main>
  );
}
