/* ============================================================
   Estimasi awal biaya bahan satu batch produksi.

   Yang tercatat di `production_batches.total_cost_bahan` adalah biaya
   REAL: hasil timbang nyata dikali harga lot yang benar-benar
   terpotong FEFO. Angka itu jujur tapi sendirian tidak bisa dibaca,
   petugas tidak tahu apakah Rp 4,2 juta itu wajar atau membeludak.

   Pembandingnya dihitung di sini: biaya SEANDAINYA semuanya berjalan
   sesuai rencana, bahan persis takaran formula, kemasan persis
   rencana pcs, dengan harga per unit yang SAMA dengan yang dipakai
   batch itu.

   Harga sengaja disamakan, bukan dipakai harga rencana lama. Kalau
   harganya ikut berbeda, selisihnya jadi campuran dua sebab (boros
   bahan + harga naik) dan tidak bisa ditindaklanjuti siapa pun.
   Dengan harga dikunci, selisih yang muncul murni soal PEMAKAIAN,
   yang memang yang dikendalikan orang produksi.

   Bahan adjusting TIDAK punya estimasi dan itu bukan kelalaian: menurut
   definisinya dia penambahan di luar formula selama proses. Biayanya
   masuk sisi real saja, jadi setiap kali adjusting dipakai, selisihnya
   memang naik, dan itu justru informasi yang dicari.

   Mengembalikan null untuk batch yang tidak punya plan/eksekusi
   (dibuat langsung lewat form produksi, atau data migrasi): tidak ada
   angka teoritis yang bisa dipercaya, dan menebak lebih buruk
   daripada tidak menampilkan apa-apa.
   ============================================================ */

import { createClient } from "@/lib/supabase/server";
import type { ExecutionData } from "@/app/(app)/production/actions";

export type KomponenBiaya = {
  item_id: string;
  qty_terpakai: number;
  harga_per_unit: number;
  subtotal: number;
};

export type EstimasiProduksi = {
  /** estimasi biaya bahan formula (takaran teoritis) */
  bahan: number;
  /** estimasi biaya kemasan (rencana pcs × kebutuhan per pcs) */
  kemasan: number;
  total: number;
  /** total_cost_bahan batch ini */
  real: number;
  /** real − estimasi; positif = melebihi rencana */
  selisih: number;
  /** selisih dalam persen estimasi, null bila estimasinya nol */
  persen: number | null;
  /** nama bahan yang sama sekali tidak punya acuan harga */
  tanpaHarga: string[];
};

type VariantRaw = {
  nama_varian: string;
  variant_packaging: { item_id: string; qty_per_pcs: number }[];
};

export async function hitungEstimasiProduksi(
  organizationId: string,
  batchId: string,
  komponen: KomponenBiaya[],
  real: number
): Promise<EstimasiProduksi | null> {
  const supabase = await createClient();

  const { data: plan } = await supabase
    .from("production_plans")
    .select("product_id, execution_data")
    .eq("production_batch_id", batchId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  const exec = plan?.execution_data as ExecutionData | null;
  if (!exec) return null;

  // Harga per unit yang BENAR-BENAR dibayar batch ini. Satu bahan bisa
  // terpotong dari beberapa lot dengan harga berbeda, jadi rata-rata
  // tertimbang, bukan harga lot pertama.
  const harga = new Map<string, number>();
  const qtyTotal = new Map<string, number>();
  const subtotalTotal = new Map<string, number>();
  for (const c of komponen) {
    qtyTotal.set(c.item_id, (qtyTotal.get(c.item_id) || 0) + Number(c.qty_terpakai));
    subtotalTotal.set(
      c.item_id,
      (subtotalTotal.get(c.item_id) || 0) + Number(c.subtotal)
    );
  }
  for (const [itemId, qty] of qtyTotal) {
    if (qty > 0) harga.set(itemId, (subtotalTotal.get(itemId) || 0) / qty);
  }

  const bahanTeoritis = (exec.bahan || []).filter((b) => Number(b.teoritis) > 0);

  // Kebutuhan kemasan teoritis = rencana pcs tiap varian × takaran
  // kemasan varian itu.
  const kemasanTeoritis = new Map<string, number>();
  if (plan?.product_id && (exec.variants || []).length > 0) {
    const { data: varRows } = await supabase
      .from("product_variants")
      .select("nama_varian, variant_packaging(item_id, qty_per_pcs)")
      .eq("product_id", plan.product_id)
      .eq("organization_id", organizationId);

    const packOf = new Map(
      ((varRows || []) as unknown as VariantRaw[]).map((v) => [
        v.nama_varian,
        v.variant_packaging || [],
      ])
    );
    for (const v of exec.variants || []) {
      const pcs = Number(v.rencana_pcs) || 0;
      if (pcs <= 0) continue;
      for (const p of packOf.get(v.nama_varian) || []) {
        kemasanTeoritis.set(
          p.item_id,
          (kemasanTeoritis.get(p.item_id) || 0) + pcs * Number(p.qty_per_pcs)
        );
      }
    }
  }

  // Bahan yang direncanakan tapi tidak sekali pun terpotong di batch ini
  // (mis. kemasan yang habis lalu diganti) tidak punya harga dari
  // komponen, pakai harga pembelian terakhirnya.
  const perluHarga = [
    ...bahanTeoritis.map((b) => b.item_id),
    ...kemasanTeoritis.keys(),
  ].filter((id) => !harga.has(id));

  const tanpaHarga: string[] = [];
  if (perluHarga.length > 0) {
    const ids = Array.from(new Set(perluHarga));
    const { data: lots } = await supabase
      .from("purchase_batches")
      .select("item_id, harga_per_unit, created_at")
      .eq("organization_id", organizationId)
      .in("item_id", ids)
      .order("created_at", { ascending: false });

    for (const l of (lots || []) as { item_id: string; harga_per_unit: number }[]) {
      if (!harga.has(l.item_id)) harga.set(l.item_id, Number(l.harga_per_unit));
    }

    const masihKosong = ids.filter((id) => !harga.has(id));
    if (masihKosong.length > 0) {
      const { data: its } = await supabase
        .from("items")
        .select("id, nama")
        .eq("organization_id", organizationId)
        .in("id", masihKosong);
      const namaOf = new Map(
        ((its || []) as { id: string; nama: string }[]).map((i) => [i.id, i.nama])
      );
      for (const id of masihKosong) tanpaHarga.push(namaOf.get(id) || "item");
    }
  }

  let bahan = 0;
  for (const b of bahanTeoritis) {
    bahan += Number(b.teoritis) * (harga.get(b.item_id) || 0);
  }
  let kemasan = 0;
  for (const [itemId, qty] of kemasanTeoritis) {
    kemasan += qty * (harga.get(itemId) || 0);
  }

  const total = bahan + kemasan;
  const selisih = Number(real) - total;
  return {
    bahan,
    kemasan,
    total,
    real: Number(real),
    selisih,
    persen: total > 0 ? (selisih / total) * 100 : null,
    tanpaHarga,
  };
}
