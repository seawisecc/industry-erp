import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFeatures } from "@/lib/featuresServer";
import { canAccessModule } from "@/lib/modules";
import SettingsNav, { SettingsCard } from "./SettingsNav";

const CARDS: SettingsCard[] = [
  {
    href: "/items",
    title: "Stock Items",
    subtitle: "Item gudang, stok sisa, batch",
  },
  {
    href: "/qc-incoming",
    title: "QC Incoming",
    subtitle: "Karantina & release barang masuk",
  },
  {
    href: "/materials",
    title: "Materials",
    subtitle: "Master material, komposisi INCI, supplier",
  },
  {
    href: "/inci",
    title: "INCI Names",
    subtitle: "Master data regulasi INCI",
  },
];

/**
 * Kerangka halaman Bahan & Stok: kartu navigasi kiri, konten kanan —
 * dipakai bersama oleh /items, /materials, dan /inci.
 */
export default async function BahanShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  const features = await getFeatures(organizationId!);
  const access = {
    isSuperAdmin,
    role: profile?.role || "",
    allowedModules: profile?.allowed_modules ?? null,
  };

  const cards = CARDS.filter(
    (c) =>
      canAccessModule(access, c.href.slice(1)) &&
      // Kartu QC hanya tampil bila QC Module aktif (paket full)
      (c.href !== "/qc-incoming" || features.qc)
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">
        Materials &amp; Stock
      </h1>
      <p className="text-muted text-sm mt-1">
        Stok gudang, master material, dan data regulasi INCI
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
