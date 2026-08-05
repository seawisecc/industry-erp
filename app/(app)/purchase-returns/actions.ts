"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { isAlasanRetur } from "@/lib/purchaseReturn";

export type PurchaseReturnInput = {
  tanggal: string; // yyyy-mm-dd
  receiving_id: string;
  alasan: string;
  catatan: string | null;
  items: { batch_id: string; qty: number }[];
};

/**
 * Terbitkan dokumen retur pembelian.
 *
 * Pemotongan stok dan pengurangan hutang terjadi atomik di dalam
 * create_purchase_return_tx. Batch yang sudah ditolak QC stoknya tidak
 * dipotong lagi di sana (sudah nol sejak keputusan QC), hanya hutangnya
 * yang berkurang.
 */
export async function createPurchaseReturn(
  data: PurchaseReturnInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();

    if (!organizationId) {
      throw new Error("Organisasi tidak terdeteksi. Refresh halaman dan login ulang.");
    }
    if (!data.tanggal) throw new Error("Tanggal retur wajib diisi");
    if (!data.receiving_id) throw new Error("Faktur penerimaan wajib dipilih");
    if (!isAlasanRetur(data.alasan)) throw new Error("Alasan retur wajib dipilih");

    const merged = new Map<string, number>();
    for (const it of data.items) {
      if (!it.batch_id || it.qty <= 0) continue;
      merged.set(it.batch_id, (merged.get(it.batch_id) || 0) + it.qty);
    }
    const items = Array.from(merged, ([batch_id, qty]) => ({ batch_id, qty }));
    if (items.length === 0)
      throw new Error("Minimal satu barang dengan qty lebih dari 0");

    const { data: id, error } = await supabase.rpc("create_purchase_return_tx", {
      p_organization_id: organizationId,
      p_tanggal: data.tanggal,
      p_receiving_id: data.receiving_id,
      p_alasan: data.alasan,
      p_catatan: data.catatan,
      p_dibuat_oleh: profile?.id || null,
      p_items: items,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/purchase-returns");
    revalidatePath("/payments");
    revalidatePath("/items");
    revalidatePath("/reports");
    revalidatePath("/dashboard");
    return { ok: true, id: id as string };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal menyimpan retur",
    };
  }
}

/**
 * Batalkan dokumen retur: qty kembali ke kolom asalnya (karantina atau
 * stok siap pakai) dan hutang faktur dipulihkan.
 *
 * Tanda tangan (id, alasan) mengikuti CancelTxButton. Alasannya tidak
 * disimpan karena dokumennya ikut terhapus, sama seperti pembatalan
 * produksi, invoice, dan pemakaian bahan.
 */
export async function cancelPurchaseReturn(
  id: string,
  _alasan: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!(isSuperAdmin || profile?.role === "Admin" || profile?.can_cancel))
      throw new Error("Tidak punya izin membatalkan transaksi");

    const { error } = await supabase.rpc("cancel_purchase_return_tx", {
      p_organization_id: organizationId,
      p_retur_id: id,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/purchase-returns");
    revalidatePath("/payments");
    revalidatePath("/items");
    revalidatePath("/reports");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal membatalkan",
    };
  }
}
