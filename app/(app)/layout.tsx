import Sidebar from "@/components/Sidebar";
import AccessGuard from "@/components/AccessGuard";
import SignOutButton from "@/components/SignOutButton";
import IdleLogout from "@/components/IdleLogout";
import Logo from "@/components/Logo";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

  // Company belum aktif / masa aktif habis → tampilkan layar blokir
  if (!isSuperAdmin && organizationId) {
    const { data: org } = await supabase
      .from("organizations")
      .select("nama, aktif, aktif_sampai")
      .eq("id", organizationId)
      .single();

    const todayStr = new Date().toLocaleDateString("sv-SE");
    const expired =
      org?.aktif && org.aktif_sampai !== null && org.aktif_sampai < todayStr;

    if (org && (!org.aktif || expired)) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="glass rounded-3xl p-10 max-w-md text-center">
            <div className="inline-flex bg-botanical-900/90 rounded-2xl p-3 mb-5">
              <Logo size={32} />
            </div>
            <h1 className="font-display text-[22px] font-semibold text-ink mb-2">
              {expired ? "Masa Aktif Berakhir" : "Menunggu Aktivasi"}
            </h1>
            <p className="text-muted text-[13.5px] leading-relaxed mb-6">
              {expired ? (
                <>
                  Masa aktif <b>{org.nama}</b> sudah berakhir. Hubungi tim
                  Seawise untuk perpanjangan supaya bisa lanjut menggunakan
                  aplikasi.
                </>
              ) : (
                <>
                  Perusahaan <b>{org.nama}</b> sudah terdaftar tapi belum
                  diaktifkan oleh tim Seawise. Kamu akan bisa menggunakan
                  aplikasi begitu aktivasi selesai.
                </>
              )}
            </p>
            <SignOutButton variant="solid" />
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex min-h-screen">
      <IdleLogout />
      <Sidebar />
      <main className="flex-1 p-4 pt-[72px] sm:p-8 sm:pt-8 max-w-[1200px] mx-auto w-full min-w-0">
        <AccessGuard
          isSuperAdmin={isSuperAdmin}
          role={profile?.role || ""}
          allowedModules={profile?.allowed_modules ?? null}
        >
          {children}
        </AccessGuard>
      </main>
    </div>
  );
}
