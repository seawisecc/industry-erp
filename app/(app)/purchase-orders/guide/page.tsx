import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import GuideOrderForm, { GuideItem } from "./GuideOrderForm";

type ItemRaw = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  stok_minimum: number;
  moq: number | null;
  purchase_batches: { qty_sisa: number }[];
};

type LinkRaw = {
  item_id: string;
  supplier_id: string | null;
  suppliers: { nama: string } | null;
};

export default async function GuideOrderPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: items }, { data: links }, { data: batches }] = await Promise.all([
    supabase
      .from("items")
      .select("id, kode, nama, satuan, stok_minimum, moq, purchase_batches(qty_sisa)")
      .eq("organization_id", organizationId)
      .eq("aktif", true)
      .order("kode"),
    supabase
      .from("materials")
      .select("item_id, supplier_id, suppliers(nama)")
      .eq("organization_id", organizationId)
      .not("item_id", "is", null),
    supabase
      .from("purchase_batches")
      .select("item_id, harga_per_unit, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
  ]);

  // Supplier & harga terakhir per item
  const supplierOf = new Map<string, { id: string; nama: string }>();
  for (const l of (links || []) as unknown as LinkRaw[]) {
    if (l.supplier_id && l.suppliers?.nama && !supplierOf.has(l.item_id)) {
      supplierOf.set(l.item_id, { id: l.supplier_id, nama: l.suppliers.nama });
    }
  }
  const lastHarga = new Map<string, number>();
  for (const b of (batches || []) as { item_id: string; harga_per_unit: number }[]) {
    const h = Number(b.harga_per_unit);
    if (h > 0 && !lastHarga.has(b.item_id)) lastHarga.set(b.item_id, h);
  }

  // Item yang perlu dibeli: stok ≤ stok minimum (dan punya stok minimum > 0,
  // atau stoknya benar-benar habis)
  const guideItems: GuideItem[] = ((items || []) as unknown as ItemRaw[])
    .map((it) => {
      const stok = (it.purchase_batches || []).reduce(
        (s, b) => s + Number(b.qty_sisa),
        0
      );
      const sup = supplierOf.get(it.id);
      return {
        id: it.id,
        kode: it.kode,
        nama: it.nama,
        satuan: it.satuan,
        stok,
        stokMin: Number(it.stok_minimum),
        moq: it.moq == null ? null : Number(it.moq),
        harga: lastHarga.get(it.id) ?? null,
        supplier_id: sup?.id || null,
        supplier_nama: sup?.nama || null,
      };
    })
    .filter((it) => it.stok <= it.stokMin || it.stok <= 0)
    .sort((a, b) => a.stok - b.stok || a.kode.localeCompare(b.kode));

  return (
    <div className="max-w-5xl">
      <Link
        href="/purchase-orders"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Purchase Order
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Guide Order
      </h1>
      <p className="text-muted text-sm mb-6">
        {guideItems.length} item di bawah stok minimum. Qty sudah disarankan
        (dibulatkan ke MOQ) — sesuaikan bila perlu, lalu sistem membuat PO
        terpisah untuk tiap supplier.
      </p>

      <GuideOrderForm items={guideItems} />
    </div>
  );
}
