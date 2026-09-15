import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { rencanaDariQuery } from "@/lib/ppic";
import PembelianShell from "@/components/PembelianShell";
import PpicPlanner from "./PpicPlanner";
import { getPpicData } from "./data";

export default async function PpicPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string | string[] }>;
}) {
  const { r } = await searchParams;
  const { organizationId } = await getEffectiveOrg();
  const { products, items, gagal } = await getPpicData(organizationId!);

  return (
    <PembelianShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          PPIC Planner
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Susun rencana produksi. Sistem menghitung kebutuhan bahan dari formula,
          membandingkan dengan stok, lalu merekomendasikan pembelian (MOQ,
          supplier, estimasi dana).
        </p>
      </div>

      <div className="mt-4">
        <PpicPlanner
          products={products}
          items={items}
          rencanaAwal={rencanaDariQuery(r)}
          gagalMuat={gagal}
        />
      </div>
    </PembelianShell>
  );
}
