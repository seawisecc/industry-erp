import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import AdjustmentForm, { AdjustItem } from "../AdjustmentForm";

type ItemRaw = {
  id: string;
  kode: string;
  nama: string;
  kategori: string;
  satuan: string;
};

type BatchRaw = {
  item_id: string;
  qty_sisa: number;
  harga_per_unit: number;
  created_at: string;
};

export default async function NewAdjustmentPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: items }, { data: batches }] = await Promise.all([
    supabase
      .from("items")
      .select("id, kode, nama, kategori, satuan")
      .eq("organization_id", organizationId)
      .eq("aktif", true)
      .order("kode"),
    supabase
      .from("purchase_batches")
      .select("item_id, qty_sisa, harga_per_unit, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
  ]);

  // Hitung stok sistem + harga terakhir per item
  const stok = new Map<string, number>();
  const lastHarga = new Map<string, number>();
  for (const b of (batches || []) as BatchRaw[]) {
    stok.set(b.item_id, (stok.get(b.item_id) || 0) + Number(b.qty_sisa));
    if (!lastHarga.has(b.item_id)) {
      lastHarga.set(b.item_id, Number(b.harga_per_unit));
    }
  }

  const adjustItems: AdjustItem[] = ((items || []) as ItemRaw[]).map((it) => ({
    id: it.id,
    kode: it.kode,
    nama: it.nama,
    kategori: it.kategori,
    satuan: it.satuan,
    stok: stok.get(it.id) || 0,
    lastHarga: lastHarga.get(it.id) ?? null,
  }));

  return (
    <div className="max-w-4xl">
      <Link
        href="/data-migration/adjustment"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Adjustment Stok
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Adjustment Baru
      </h1>
      <p className="text-muted text-sm mb-6">
        Untuk stock opname atau input stok awal. Stok bertambah dicatat sebagai
        batch &ldquo;Stock Adjustment&rdquo;; stok berkurang dipotong FEFO.
      </p>

      <AdjustmentForm items={adjustItems} />
    </div>
  );
}
