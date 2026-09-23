import type { SupabaseClient } from "@supabase/supabase-js";
import { hitungTotalPembelian, parsePurchaseTaxMode } from "@/lib/purchaseTax";

/* ============================================================
   PO yang masih menggantung, untuk kartu ringkasan di atas daftar
   Purchase Orders dan Receiving.

   Angkanya WAJIB dihitung dari seluruh PO perusahaan, bukan dari
   baris halaman yang sedang tampil: tabelnya paginasi di server,
   dan jumlah dari 50 baris terlihat masuk akal padahal salah.

   Nilai rupiahnya lewat hitungTotalPembelian dengan model pajak yang
   dibekukan di tiap PO, sama persis dengan kolom Total di tabel.
   ============================================================ */

export type PipelineStatus =
  | "Dibuat"
  | "Disetujui"
  | "Dikirim"
  | "Diterima Sebagian";

export type PipelinePO = {
  id: string;
  no_po: string | null;
  tanggal_po: string;
  status: PipelineStatus;
  supplier_nama: string;
  /** nilai seluruh PO, termasuk pajak menurut modelnya */
  total: number;
  /** nilai barang yang BELUM diterima, termasuk pajak menurut modelnya */
  sisa: number;
  /** jumlah baris item yang qty-nya belum datang semua */
  itemSisa: number;
  /**
   * Baris yang barangnya belum datang semua, urutan apa adanya di PO.
   * `nilai` = qty sisa x harga seperti tertulis di PO (pada PO Include
   * sudah memuat pajak), konvensi yang sama dengan catatan isi PO di
   * daftar Purchase Orders.
   */
  rincianSisa: { nama: string; satuan: string; qty: number; nilai: number }[];
};

type Raw = {
  id: string;
  no_po: string | null;
  tanggal_po: string;
  status: PipelineStatus;
  ppn_percent: number;
  tax_mode: string | null;
  tax_dpp_nilai_lain: boolean | null;
  suppliers: { nama: string } | null;
  po_items: {
    qty_pesan: number;
    qty_diterima: number;
    harga_per_unit: number;
    items: { nama: string; satuan: string } | null;
  }[];
};

// PostgREST memotong hasil di max-rows (bawaan 1000) tanpa error apa
// pun, jadi diambil per halaman sampai habis.
const HALAMAN = 1000;

export async function getPoPipeline(
  supabase: SupabaseClient,
  organizationId: string,
  statuses: PipelineStatus[]
): Promise<PipelinePO[] | null> {
  const hasil: PipelinePO[] = [];

  for (let dari = 0; ; dari += HALAMAN) {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select(
        "id, no_po, tanggal_po, status, ppn_percent, tax_mode, tax_dpp_nilai_lain, suppliers(nama), po_items(qty_pesan, qty_diterima, harga_per_unit, items(nama, satuan))"
      )
      .eq("organization_id", organizationId)
      .in("status", statuses)
      .order("tanggal_po", { ascending: true })
      .order("id", { ascending: true })
      .range(dari, dari + HALAMAN - 1);
    // Null, bukan throw: ringkasan yang gagal dimuat tidak boleh ikut
    // menjatuhkan tabel di bawahnya. Pemanggil wajib menulis keterangannya.
    if (error) return null;

    const rows = (data || []) as unknown as Raw[];
    for (const po of rows) {
      const mode = parsePurchaseTaxMode(po.tax_mode);
      const tarif = Number(po.ppn_percent);
      const dpp = po.tax_dpp_nilai_lain !== false;

      let subtotal = 0;
      let subtotalSisa = 0;
      let itemSisa = 0;
      const rincianSisa: PipelinePO["rincianSisa"] = [];
      for (const it of po.po_items) {
        const harga = Number(it.harga_per_unit);
        const qtySisa = Math.max(
          0,
          Number(it.qty_pesan) - Number(it.qty_diterima)
        );
        subtotal += Number(it.qty_pesan) * harga;
        subtotalSisa += qtySisa * harga;
        if (qtySisa > 0) {
          itemSisa++;
          rincianSisa.push({
            nama: it.items?.nama || "Item terhapus",
            satuan: it.items?.satuan || "",
            qty: qtySisa,
            nilai: qtySisa * harga,
          });
        }
      }

      hasil.push({
        id: po.id,
        no_po: po.no_po,
        tanggal_po: po.tanggal_po,
        status: po.status,
        supplier_nama: po.suppliers?.nama || "-",
        total: hitungTotalPembelian(subtotal, mode, tarif, dpp).total,
        sisa: hitungTotalPembelian(subtotalSisa, mode, tarif, dpp).total,
        itemSisa,
        rincianSisa,
      });
    }

    if (rows.length < HALAMAN) break;
  }

  return hasil;
}
