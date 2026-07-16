import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { canAccessModule } from "@/lib/modules";
import SettingsNav, { SettingsCard } from "./SettingsNav";

const CARDS: SettingsCard[] = [
  {
    href: "/purchase-orders",
    title: "Purchase Orders",
    subtitle: "Pesanan pembelian & approval",
  },
  {
    href: "/receivings",
    title: "Receiving",
    subtitle: "Penerimaan barang dari PO",
  },
  {
    href: "/payments",
    title: "Payments",
    subtitle: "Faktur, jatuh tempo, pelunasan",
  },
];

/**
 * Kerangka halaman Pembelian: kartu navigasi kiri, konten kanan —
 * dipakai bersama oleh /purchase-orders, /receivings, dan /payments.
 */
export default async function PembelianShell({
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
      <h1 className="font-display text-2xl font-semibold text-ink">Purchasing</h1>
      <p className="text-muted text-sm mt-1">
        Purchase order, penerimaan barang, dan pembayaran faktur
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
