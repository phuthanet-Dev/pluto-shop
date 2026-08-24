import { AuthShell } from "@/components/auth-shell";
import { safeCallbackPath } from "@/lib/auth";

type LogoutPageProps = {
  searchParams?: Promise<{ callbackUrl?: string | string[] }>;
};

export default async function LogoutPage({ searchParams }: LogoutPageProps) {
  const params = searchParams ? await searchParams : {};
  const rawCallback = Array.isArray(params.callbackUrl)
    ? params.callbackUrl[0]
    : params.callbackUrl;
  const callback = safeCallbackPath(rawCallback);
  const thai = callback.startsWith("/th");
  const encodedCallback = encodeURIComponent(callback);

  return (
    <AuthShell
      eyebrow={thai ? "PLUTO / ออกจากระบบ 01" : "PLUTO / SIGN OUT 01"}
      title={thai ? "แล้วพบกันใหม่" : "See you in orbit"}
      description={
        thai
          ? "ออกจากระบบ Pluto Shop และ Keycloak session บนอุปกรณ์นี้อย่างปลอดภัย"
          : "Sign out of Pluto Shop and the identity session on this device."
      }
      primaryHref={`/api/auth/logout?callbackUrl=${encodedCallback}`}
      primaryLabel={thai ? "ออกจากระบบอย่างปลอดภัย" : "Sign out securely"}
      secondaryHref={callback}
      secondaryLabel={thai ? "กลับไป Pluto Shop" : "Return to Pluto Shop"}
      footer={
        thai
          ? "คุณสามารถกลับเข้าสู่ระบบได้ทุกเมื่อ"
          : "You can return whenever you are ready."
      }
    />
  );
}
