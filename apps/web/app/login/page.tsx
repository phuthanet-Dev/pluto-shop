import { AuthShell } from "@/components/auth-shell";
import { safeCallbackPath } from "@/lib/auth";

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const rawCallback = Array.isArray(params.callbackUrl)
    ? params.callbackUrl[0]
    : params.callbackUrl;
  const callback = safeCallbackPath(rawCallback);
  const thai = callback.startsWith("/th");
  const encodedCallback = encodeURIComponent(callback);

  return (
    <AuthShell
      eyebrow={thai ? "PLUTO / เข้าสู่ระบบ 01" : "PLUTO / LOGIN 01"}
      title={thai ? "ยินดีต้อนรับกลับมา" : "Welcome back"}
      description={
        thai
          ? "เข้าสู่ระบบเพื่อจัดการรถเข็นและประสบการณ์สร้างสรรค์ของคุณอย่างปลอดภัย"
          : "Sign in to keep your cart and creative journey in orbit."
      }
      primaryHref={`/api/auth/login?callbackUrl=${encodedCallback}`}
      primaryLabel={thai ? "เข้าสู่ระบบต่อ" : "Continue to login"}
      secondaryHref={`/signup?callbackUrl=${encodedCallback}`}
      secondaryLabel={thai ? "สร้างบัญชีใหม่" : "Create an account"}
      footer={
        thai
          ? "ระบบจะพาไปยังหน้าเข้าสู่ระบบที่ปลอดภัยของ Pluto Shop"
          : "You will continue to Pluto Shop's secure identity page."
      }
    />
  );
}
