import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFeatures } from "@/lib/featuresServer";
import { canAccessModule } from "@/lib/modules";
import SettingsNav, { SettingsCard } from "./SettingsNav";

const CARDS: SettingsCard[] = [
  {
    href: "/products",
    title: "Products",
    subtitle: "Data produk, formula, varian, HPP",
  },
  {
    href: "/services",
    title: "Services",
    subtitle: "Layanan jasa yang bisa dijual",
  },
  {
    href: "/production",
    title: "Production",
    subtitle: "Plan → Execution → Result",
  },
  {
    href: "/finished-goods",
    title: "Finished Goods",
    subtitle: "Stok produk jadi per varian",
  },
  {
    href: "/qc-finished",
    title: "QC Produk Jadi",
    subtitle: "Uji produk jadi sebelum pelulusan",
  },
  {
    href: "/qa-release",
    title: "QA Release",
    subtitle: "Tinjau bukti & luluskan batch",
  },
];

/**
 * Kerangka halaman Products: kartu navigasi kiri, konten kanan —
 * dipakai bersama oleh /products, /production, dan /finished-goods.
 */
export default async function ProdukShell({
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
      // Kartu QA hanya tampil bila QA Release aktif (paket full)
      (c.href !== "/qa-release" || features.qa) &&
      (c.href !== "/qc-finished" || (features.qa && features.qc))
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Products</h1>
      <p className="text-muted text-sm mt-1">
        Data produk, proses produksi, dan stok produk jadi
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
