import { createClient } from "@/lib/supabase/server";
import type { ItemRnd } from "@/lib/rndCost";
import type { ClientOption } from "@/components/ClientPicker";

type ItemRaw = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  kategori: "Bahan Baku" | "Kemasan";
};

type BatchRaw = { item_id: string; qty_sisa: number; harga_per_unit: number };
type LinkRaw = { item_id: string; suppliers: { nama: string } | null };

/**
 * Daftar bahan (dengan stok, harga terakhir, dan suppliernya) plus daftar
 * client, untuk form develop maupun panel cek produksi.
 *
 * Item TIDAK disaring `aktif = true`, dan itu disengaja dua kali:
 * alasan yang sama dengan layar produksi (bahan yang dinonaktifkan setelah
 * formulanya dibuat akan terbaca stok nol), ditambah alasan khas R&D, yaitu
 * bahan yang sudah lama tidak dibeli justru sering jadi yang dijajaki.
 *
 * Harganya `harga_per_unit`, bukan `harga_faktur`: yang dihitung di sini
 * biaya, dan biaya selalu tanpa pajak (lihat bab Dua harga per batch).
 */
export async function getRndOptions(organizationId: string): Promise<{
  items: ItemRnd[];
  clients: ClientOption[];
}> {
  const supabase = await createClient();

  const [{ data: items }, { data: batches }, { data: links }, { data: clients }] =
    await Promise.all([
      supabase
        .from("items")
        .select("id, kode, nama, satuan, kategori")
        .eq("organization_id", organizationId)
        .order("kode"),
      supabase
        .from("purchase_batches")
        .select("item_id, qty_sisa, harga_per_unit, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("materials")
        .select("item_id, suppliers(nama)")
        .eq("organization_id", organizationId)
        .not("item_id", "is", null),
      supabase
        .from("clients")
        .select("id, kode, company_brand")
        .eq("organization_id", organizationId)
        .order("company_brand"),
    ]);

  const stok = new Map<string, number>();
  const harga = new Map<string, number>();
  for (const b of (batches || []) as unknown as BatchRaw[]) {
    stok.set(b.item_id, (stok.get(b.item_id) || 0) + Number(b.qty_sisa));
    // Baris sudah urut created_at menurun, jadi yang pertama masuk adalah
    // pembelian terakhir.
    if (!harga.has(b.item_id)) harga.set(b.item_id, Number(b.harga_per_unit));
  }

  const supplierOf = new Map<string, string>();
  for (const l of (links || []) as unknown as LinkRaw[]) {
    if (l.suppliers?.nama && !supplierOf.has(l.item_id)) {
      supplierOf.set(l.item_id, l.suppliers.nama);
    }
  }

  return {
    items: ((items || []) as ItemRaw[]).map((it) => ({
      id: it.id,
      kode: it.kode,
      nama: it.nama,
      satuan: it.satuan,
      kategori: it.kategori,
      stok: stok.get(it.id) || 0,
      harga: harga.get(it.id) ?? null,
      supplier: supplierOf.get(it.id) || null,
    })),
    clients: (clients || []) as ClientOption[],
  };
}
