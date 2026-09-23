import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { rencanaDariQuery } from "@/lib/ppic";
import { kunciBahan } from "@/lib/rndCost";
import type { RndPpicFormula } from "@/lib/rndPpic";
import { getPpicData } from "../../ppic/data";
import { getRndOptions } from "../data";
import RndPpicPlanner from "./RndPpicPlanner";

type FormulaRaw = {
  id: string;
  no_formula: string;
  nama_produk: string;
  brand: string | null;
  status: string;
  netto_gram: number | null;
  rnd_formula_items: {
    material_id: string | null;
    item_id: string | null;
    percentage: number;
  }[];
  rnd_formula_packaging: {
    material_id: string | null;
    item_id: string | null;
    nama: string | null;
    qty_per_pcs: number;
    harga_estimasi: number | null;
  }[];
};

/** Formula yang disetujui paling atas: itu yang biasanya di-launching. */
const URUTAN_STATUS: Record<string, number> = { Disetujui: 0, Trial: 1, Draft: 2 };

export default async function RndPpicPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string | string[] }>;
}) {
  const { r } = await searchParams;
  const { organizationId } = await getEffectiveOrg();
  const supabase = await createClient();

  const [{ data, error }, opts, ppic] = await Promise.all([
    // Arsip tidak ikut: versi itu sudah digantikan revisinya, dan
    // merencanakan launching dari formula lama adalah salah pilih yang
    // baru ketahuan waktu bahannya sudah dibeli.
    supabase
      .from("rnd_formulas")
      .select(
        "id, no_formula, nama_produk, brand, status, netto_gram, " +
          "rnd_formula_items(material_id, item_id, percentage), " +
          "rnd_formula_packaging(material_id, item_id, nama, qty_per_pcs, harga_estimasi)"
      )
      .eq("organization_id", organizationId)
      .neq("status", "Arsip")
      .order("no_formula", { ascending: false }),
    getRndOptions(organizationId!),
    getPpicData(organizationId!),
  ]);

  const formulas: RndPpicFormula[] = ((data || []) as unknown as FormulaRaw[])
    .map((f) => ({
      id: f.id,
      noFormula: f.no_formula,
      nama: f.nama_produk,
      brand: f.brand?.trim() || null,
      status: f.status,
      nettoGram: f.netto_gram == null ? null : Number(f.netto_gram),
      formula: f.rnd_formula_items.map((it) => ({
        key: kunciBahan(it.material_id, it.item_id),
        percentage: Number(it.percentage),
      })),
      kemasan: f.rnd_formula_packaging.map((p) => ({
        key: p.material_id || p.item_id ? kunciBahan(p.material_id, p.item_id) : null,
        nama: p.nama,
        qty_per_pcs: Number(p.qty_per_pcs),
        harga_estimasi: p.harga_estimasi == null ? null : Number(p.harga_estimasi),
      })),
    }))
    .sort(
      (a, b) =>
        (URUTAN_STATUS[a.status] ?? 9) - (URUTAN_STATUS[b.status] ?? 9) ||
        b.noFormula.localeCompare(a.noFormula)
    );

  return (
    <div>
      <Link
        href="/rnd"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke R&amp;D Formulation
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink">PPIC R&amp;D</h1>
      <p className="text-muted text-sm mt-1 max-w-3xl">
        Rencana dana launching produk. Pilih formula dan jumlah pcs yang mau
        diproduksi, sistem menghitung kebutuhan bahan & kemasan, membandingkannya
        dengan stok, karantina QC, PO terbuka, dan Plan Produksi yang sedang
        berjalan, lalu menjumlahkan dana pembelian yang harus disiapkan.
      </p>

      <div className="mt-5">
        <RndPpicPlanner
          formulas={formulas}
          bahan={opts.bahan}
          items={ppic.items}
          planTerbuka={ppic.planTerbuka}
          rencanaAwal={rencanaDariQuery(r).map((x) => ({
            formulaId: x.productId,
            pcs: Math.round(x.batches),
          }))}
          gagalMuat={ppic.gagal || !!error}
        />
      </div>
    </div>
  );
}
