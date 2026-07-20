import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { canAccessModule } from "@/lib/modules";
import SettingsNav, { SettingsCard } from "./SettingsNav";

const CARDS: SettingsCard[] = [
  {
    href: "/settings",
    title: "Company Profile",
    subtitle: "Data perusahaan & akun",
  },
  {
    href: "/document-signing",
    title: "Document Signing",
    subtitle: "Kolom tanda tangan per dokumen cetak",
  },
  {
    href: "/data-migration",
    title: "Data Migration",
    subtitle: "Import CSV & adjustment stok",
  },
  {
    href: "/users",
    title: "Users",
    subtitle: "Akses pengguna, anggota tim",
  },
];

/**
 * Kerangka halaman Pengaturan: kartu navigasi di kiri, konten di kanan —
 * dipakai bersama oleh /settings, /data-migration, dan /users.
 */
export default async function SettingsShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, isSuperAdmin } = await getEffectiveOrg();
  const access = {
    isSuperAdmin,
    role: profile?.role || "",
    allowedModules: profile?.allowed_modules ?? null,
  };

  const cards = CARDS.filter((c) => canAccessModule(access, c.href.slice(1)));

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Settings</h1>
      <p className="text-muted text-sm mt-1">
        Kelola profil company, data, dan pengguna
      </p>

      <div className="mt-6 flex flex-col lg:flex-row gap-5 items-start">
        <div className="w-full lg:w-72 lg:flex-shrink-0 lg:sticky lg:top-8">
          <SettingsNav cards={cards} />
        </div>
        <div className="flex-1 min-w-0 w-full">{children}</div>
      </div>
    </div>
  );
}
