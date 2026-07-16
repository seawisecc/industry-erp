import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { canAccessModule } from "@/lib/modules";
import SettingsNav, { SettingsCard } from "./SettingsNav";

const CARDS: SettingsCard[] = [
  {
    href: "/clients",
    title: "Clients",
    subtitle: "Master data client & brand owner",
  },
  {
    href: "/consignments",
    title: "Consignment",
    subtitle: "Kirim barang, stok konsinyasi, laporan laku",
  },
  {
    href: "/sales-invoices",
    title: "Invoices",
    subtitle: "Proforma & invoice, dengan/tanpa tax",
  },
  {
    href: "/pos",
    title: "POS",
    subtitle: "Penjualan walk-in & event",
  },
  {
    href: "/sales-payments",
    title: "Payments",
    subtitle: "Pelunasan & reminder jatuh tempo",
  },
];

/**
 * Kerangka halaman Sales: kartu navigasi kiri, konten kanan.
 */
export default async function SalesShell({
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
      <h1 className="font-display text-2xl font-semibold text-ink">Sales</h1>
      <p className="text-muted text-sm mt-1">
        Client, konsinyasi, invoice, POS, dan pembayaran penjualan
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
