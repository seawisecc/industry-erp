import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import FromMaterialForm, { MaterialRow } from "./FromMaterialForm";

type Raw = {
  id: string;
  material_code: string;
  tradename: string;
  kategori: "Bahan Baku" | "Kemasan";
  suppliers: { nama: string } | null;
};

export default async function FromMaterialPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  // Hanya material yang BELUM punya item stok
  const { data: materials } = await supabase
    .from("materials")
    .select("id, material_code, tradename, kategori, suppliers(nama)")
    .eq("organization_id", organizationId)
    .is("item_id", null)
    .order("material_code");

  const rows: MaterialRow[] = ((materials || []) as unknown as Raw[]).map((m) => ({
    id: m.id,
    material_code: m.material_code,
    tradename: m.tradename,
    kategori: m.kategori,
    supplier_nama: m.suppliers?.nama || null,
  }));

  return (
    <div className="max-w-4xl">
      <Link
        href="/items"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Stok Bahan
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Tambah Item dari Material
      </h1>
      <p className="text-muted text-sm mb-6">
        {rows.length} material belum punya item stok. Satuan otomatis: kg (bahan
        baku) / pcs (kemasan) — bisa diubah per baris.
      </p>

      <FromMaterialForm materials={rows} />
    </div>
  );
}
