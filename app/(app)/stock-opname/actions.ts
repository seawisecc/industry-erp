"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type OpnameCountInput = {
  /**
   * id baris stock_opname_items, bukan item_id.
   *
   * Baris produk jadi tidak punya item_id sama sekali, jadi kuncinya harus
   * baris opname itu sendiri supaya satu payload bisa memuat dua jenis baris.
   */
  id: string;
  /** null = belum dihitung; 0 = dihitung dan hasilnya memang kosong */
  qty_fisik: number | null;
  catatan: string | null;
};

export async function createStockOpname(data: {
  tanggal: string;
  kategori: string | null;
  catatan: string | null;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();
    if (!organizationId) {
      throw new Error("Organisasi tidak terdeteksi. Refresh halaman dan login ulang.");
    }
    if (!data.tanggal) throw new Error("Tanggal opname wajib diisi");

    const { data: id, error } = await supabase.rpc("create_stock_opname_tx", {
      p_organization_id: organizationId,
      p_tanggal: data.tanggal,
      p_kategori: data.kategori,
      p_catatan: data.catatan,
      p_dibuat_oleh: profile?.id || null,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/stock-opname");
    return { ok: true, id: id as string };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal membuka opname",
    };
  }
}

/** Simpan progres hitung fisik. Boleh dipanggil berkali-kali. */
export async function saveOpnameCount(
  opnameId: string,
  items: OpnameCountInput[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const { error } = await supabase.rpc("save_opname_count_tx", {
      p_organization_id: organizationId,
      p_opname_id: opnameId,
      p_items: items,
    });
    if (error) throw new Error(error.message);

    revalidatePath(`/stock-opname/${opnameId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal menyimpan hasil hitung",
    };
  }
}

/**
 * Tutup opname: selisihnya jadi adjustment stok.
 *
 * Seluruh rangkaian (buat adjustment, potong/tambah batch, tandai opname
 * selesai) terjadi atomik di dalam finish_stock_opname_tx.
 */
export async function finishStockOpname(
  opnameId: string,
  tanggal: string
): Promise<{ ok: boolean; error?: string; adjustmentId?: string | null }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!tanggal) throw new Error("Tanggal penyesuaian wajib diisi");

    const { data: adjId, error } = await supabase.rpc("finish_stock_opname_tx", {
      p_organization_id: organizationId,
      p_opname_id: opnameId,
      p_tanggal: tanggal,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/stock-opname");
    revalidatePath("/items");
    revalidatePath("/finished-goods");
    revalidatePath("/reports");
    revalidatePath("/dashboard");
    revalidatePath("/data-migration/adjustment");
    return { ok: true, adjustmentId: (adjId as string | null) ?? null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal menutup opname",
    };
  }
}

/**
 * Batalkan opname yang belum ditutup.
 *
 * Tanda tangan (id, alasan) mengikuti CancelTxButton. Alasannya tidak
 * disimpan karena dokumennya ikut terhapus.
 */
export async function cancelStockOpname(
  id: string,
  _alasan: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!(isSuperAdmin || profile?.role === "Admin" || profile?.can_cancel))
      throw new Error("Tidak punya izin membatalkan transaksi");

    const { error } = await supabase.rpc("cancel_stock_opname_tx", {
      p_organization_id: organizationId,
      p_opname_id: id,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/stock-opname");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal membatalkan opname",
    };
  }
}
