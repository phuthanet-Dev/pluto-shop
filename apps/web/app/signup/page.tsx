import { AuthShell } from "@/components/auth-shell";
import { safeCallbackPath } from "@/lib/auth";

type SignupPageProps = {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const rawCallback = Array.isArray(params.callbackUrl)
    ? params.callbackUrl[0]
    : params.callbackUrl;
  const callback = safeCallbackPath(rawCallback);
  const thai = callback.startsWith("/th");
  const encodedCallback = encodeURIComponent(callback);

  return (
    <AuthShell
      eyebrow={thai ? "PLUTO / สมัครสมาชิก 01" : "PLUTO / SIGNUP 01"}
      title={thai ? "สร้างบัญชีของคุณ" : "Create your account"}
      description={
        thai
          ? "เริ่มต้นการเดินทางใน Pluto Shop และเก็บรถเข็นของคุณไว้ทุกครั้งที่กลับมา"
          : "Start your Pluto Shop journey and keep your cart ready for every return."
      }
      primaryHref={`/api/auth/signup?callbackUrl=${encodedCallback}`}
      primaryLabel={thai ? "สมัครสมาชิกต่อ" : "Continue to signup"}
      secondaryHref={`/login?callbackUrl=${encodedCallback}`}
      secondaryLabel={thai ? "มีบัญชีอยู่แล้ว" : "I already have an account"}
      footer={
        thai
          ? "ข้อมูลบัญชีถูกจัดการโดยระบบ identity ที่ปลอดภัยของ Pluto Shop"
          : "Your account is handled by Pluto Shop's secure identity system."
      }
    />
  );
}
