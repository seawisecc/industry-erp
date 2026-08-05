"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { isTujuanPemakaian } from "@/lib/materialIssue";

export type MaterialIssueInput = {
  tanggal: string; // yyyy-mm-dd, dihitung di sisi klien/aplikasi
  tujuan: string;
  catatan: string | null;
  items: { item_id: string; qty: number }[];
};

/**
 * Catat pemakaian bahan di luar produksi.
 *
 * Seluruh pemotongan stok terjadi atomik di dalam RPC
 * create_material_issue_tx (FEFO, satu advisory lock per organisasi).
 * Tidak ada urutan tulis multi-langkah yang dijahit di sini.
 */
export async function createMaterialIssue(
  data: MaterialIssueInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();

    if (!organizationId) {
      throw new Error("Organisasi tidak terdeteksi. Refresh halaman dan login ulang.");
    }
    if (!data.tanggal) throw new Error("Tanggal pemakaian wajib diisi");
    if (!isTujuanPemakaian(data.tujuan)) throw new Error("Tujuan pemakaian wajib dipilih");

    // Gabungkan bahan yang sama jadi satu baris supaya validasi stok
    // di RPC melihat total, bukan tiap baris terpisah.
    const merged = new Map<string, number>();
    for (const it of data.items) {
      if (!it.item_id || it.qty <= 0) continue;
      merged.set(it.item_id, (merged.get(it.item_id) || 0) + it.qty);
    }
    const items = Array.from(merged, ([item_id, qty]) => ({ item_id, qty }));
    if (items.length === 0)
      throw new Error("Minimal satu bahan dengan qty lebih dari 0");

    const { data: id, error } = await supabase.rpc("create_material_issue_tx", {
      p_organization_id: organizationId,
      p_tanggal: data.tanggal,
      p_tujuan: data.tujuan,
      p_catatan: data.catatan,
      p_dibuat_oleh: profile?.id || null,
      p_items: items,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/material-issues");
    revalidatePath("/items");
    revalidatePath("/reports");
    revalidatePath("/dashboard");
    return { ok: true, id: id as string };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal menyimpan pemakaian bahan",
    };
  }
}

/**
 * Batalkan dokumen pemakaian: qty dikembalikan ke batch asalnya,
 * lalu dokumennya dihapus. Reversal atomik di cancel_material_issue_tx.
 *
 * Tanda tangan (id, alasan) mengikuti CancelTxButton. Alasan tidak
 * disimpan karena dokumennya ikut terhapus, sama seperti pembatalan
 * produksi dan invoice.
 */
export async function cancelMaterialIssue(
  id: string,
  _alasan: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!(isSuperAdmin || profile?.role === "Admin" || profile?.can_cancel))
      throw new Error("Tidak punya izin membatalkan transaksi");

    const { error } = await supabase.rpc("cancel_material_issue_tx", {
      p_organization_id: organizationId,
      p_issue_id: id,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/material-issues");
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
