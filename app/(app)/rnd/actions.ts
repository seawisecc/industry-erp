"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { toResult, type ActionResult } from "@/lib/actionResult";
import { localDateStr } from "@/lib/dates";
import type {
  FormulaItemInput,
  PackagingInput,
  RndHeaderInput,
  SpecInput,
} from "@/lib/rnd";

/**
 * Hasil aksi yang melahirkan dokumen baru. `ActionResult` sengaja
 * tidak diperluas: yang butuh id cuma dua aksi di sini, dan tipe
 * bersama yang kadang membawa id membuat setiap pemanggil lain harus
 * memeriksa field yang tidak pernah ada isinya.
 */
export type RndSaveResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function pesan(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Siapa yang boleh memutuskan formula.
 *
 * Dipakai izin `can_plan_production`, bukan kolom baru. Formula yang
 * disetujui adalah yang nanti diturunkan jadi instruksi produksi, jadi
 * orang yang berhak menetapkan instruksi itu juga yang berhak
 * menyatakan formulanya sudah jadi. Menambah izin sendiri berarti satu
 * checklist lagi di form Pengguna yang harus diingat Admin, untuk
 * keputusan yang pemegangnya sama persis.
 */
async function assertBolehPutuskan() {
  const { profile, isSuperAdmin } = await getEffectiveOrg();
  const boleh =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_plan_production;
  if (!boleh) {
    throw new Error(
      "Kamu tidak punya izin memutuskan formula. Minta Admin mengaktifkan " +
        "izin “Bisa membuat instruksi produksi” di menu Pengguna."
    );
  }
}

function segarkan(id?: string) {
  revalidatePath("/rnd");
  if (id) revalidatePath(`/rnd/${id}`);
}

/**
 * Simpan formula develop, baru maupun perubahan.
 *
 * Header + seluruh baris (bahan, spek, kemasan) ditulis ulang utuh di
 * dalam `save_rnd_formula_tx`. Tidak ada urutan tulis multi-langkah
 * yang dijahit di sini: `supabase-js` tidak punya transaksi, dan
 * formula yang bahannya tersimpan setengah lebih berbahaya daripada
 * formula yang gagal disimpan.
 */
export async function saveRndFormula(
  id: string | null,
  header: RndHeaderInput,
  items: FormulaItemInput[],
  specs: SpecInput[],
  packaging: PackagingInput[]
): Promise<RndSaveResult> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();
    if (!organizationId) {
      throw new Error(
        "Organisasi tidak terdeteksi. Refresh halaman dan login ulang."
      );
    }

    const { data, error } = await supabase.rpc("save_rnd_formula_tx", {
      p_organization_id: organizationId,
      p_formula_id: id,
      p_header: header,
      p_items: items,
      p_specs: specs,
      p_packaging: packaging,
      p_dibuat_oleh: profile?.id || null,
    });
    if (error) throw new Error(error.message);

    const baru = data as string;
    segarkan(baru);
    return { ok: true, id: baru };
  } catch (err) {
    return { ok: false, error: pesan(err, "Gagal menyimpan formula") };
  }
}

/**
 * Catatan hasil develop + hasil uji tiap parameter.
 *
 * Boleh disimpan berkali-kali: formulator mengisi sambil percobaan
 * berjalan, bukan sekali di akhir.
 */
export async function saveRndResult(
  id: string,
  hasilDevelop: string | null,
  specs: { id: string; hasil: string | null }[]
): Promise<ActionResult> {
  return toResult(async () => {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const { error } = await supabase.rpc("save_rnd_result_tx", {
      p_organization_id: organizationId,
      p_formula_id: id,
      p_hasil_develop: hasilDevelop,
      p_specs: specs,
    });
    if (error) throw new Error(error.message);
    segarkan(id);
  }, "Gagal menyimpan hasil develop");
}

/**
 * Buat revisi berikutnya. Nomornya turunan dari INDUK silsilah, jadi
 * merevisi -R2 tetap menghasilkan -R3.
 *
 * Tanggalnya dihitung di sini lewat `localDateStr`, bukan
 * `current_date` di SQL: server berjalan di UTC.
 */
export async function reviseRndFormula(
  id: string,
  alasan: string
): Promise<RndSaveResult> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!alasan.trim()) throw new Error("Alasan revisi wajib diisi");

    const { data, error } = await supabase.rpc("revise_rnd_formula_tx", {
      p_organization_id: organizationId,
      p_formula_id: id,
      p_tanggal: localDateStr(),
      p_alasan: alasan.trim(),
      p_dibuat_oleh: profile?.id || null,
    });
    if (error) throw new Error(error.message);

    const baru = data as string;
    segarkan(id);
    revalidatePath(`/rnd/${baru}`);
    return { ok: true, id: baru };
  } catch (err) {
    return { ok: false, error: pesan(err, "Gagal membuat revisi") };
  }
}

/**
 * Tandai formula ini yang berlaku, atau batalkan keputusannya.
 *
 * Revisi lain yang tadinya disetujui turun jadi Arsip di dalam
 * transaksi yang sama, jadi tidak pernah ada dua versi berlaku untuk
 * produk yang sama.
 */
export async function approveRndFormula(
  id: string,
  setuju: boolean
): Promise<ActionResult> {
  return toResult(async () => {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    await assertBolehPutuskan();

    const { error } = await supabase.rpc("approve_rnd_formula_tx", {
      p_organization_id: organizationId,
      p_formula_id: id,
      p_user: profile?.id || null,
      p_setuju: setuju,
    });
    if (error) throw new Error(error.message);
    segarkan(id);
  }, "Gagal menyimpan keputusan formula");
}

/**
 * Hapus percobaan yang batal. Tanda tangan (id, alasan) mengikuti
 * CancelTxButton; alasannya tidak disimpan karena dokumennya ikut
 * hilang, sama seperti pembatalan produksi dan pemakaian bahan.
 */
export async function deleteRndFormula(
  id: string,
  _alasan: string
): Promise<ActionResult> {
  return toResult(async () => {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!(isSuperAdmin || profile?.role === "Admin" || profile?.can_cancel))
      throw new Error("Tidak punya izin membatalkan transaksi");

    const { error } = await supabase.rpc("delete_rnd_formula_tx", {
      p_organization_id: organizationId,
      p_formula_id: id,
    });
    if (error) throw new Error(error.message);
    segarkan(id);
  }, "Gagal menghapus formula");
}
