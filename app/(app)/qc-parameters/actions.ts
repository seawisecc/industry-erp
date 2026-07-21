"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import type { QcParamInput } from "@/lib/qcParams";

/** Simpan seluruh daftar parameter (tambah / ubah / hapus sekaligus). */
export async function saveQcParameters(
  params: QcParamInput[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!isSuperAdmin && profile?.role !== "Admin")
      throw new Error("Hanya Admin yang bisa mengubah parameter uji");

    const valid = params.filter((p) => p.nama?.trim());

    // Nama boleh sama antar kategori, tapi tidak boleh dobel dalam satu kategori
    const keys = valid.map((p) => `${p.kategori}|${p.nama.trim().toLowerCase()}`);
    if (new Set(keys).size !== keys.length)
      throw new Error("Ada nama parameter yang sama dalam satu kategori");

    // Hapus yang tidak ada lagi di daftar
    const keepIds = valid.map((p) => p.id).filter(Boolean) as string[];
    let del = supabase
      .from("qc_parameters")
      .delete()
      .eq("organization_id", organizationId);
    if (keepIds.length > 0) del = del.not("id", "in", `(${keepIds.join(",")})`);
    const { error: delError } = await del;
    if (delError) throw new Error(delError.message);

    // Susun payload (urutan mengikuti posisi di layar, per kategori)
    const counter: Record<string, number> = {};
    const payload = valid.map((p) => {
      counter[p.kategori] = (counter[p.kategori] || 0) + 1;
      return {
        id: p.id,
        row: {
          organization_id: organizationId,
          kategori: p.kategori,
          nama: p.nama.trim(),
          satuan: p.satuan?.trim() || null,
          spesifikasi: p.spesifikasi?.trim() || null,
          grup: p.grup?.trim() || null,
          aktif: p.aktif,
          urutan: counter[p.kategori],
        },
      };
    });

    // Baris baru di-insert (tanpa kolom id, biar default DB yang mengisi);
    // baris lama di-update satu per satu. Dipisah supaya Supabase tidak
    // mengirim id kosong untuk baris baru.
    const baru = payload.filter((p) => !p.id).map((p) => p.row);
    if (baru.length > 0) {
      const { error } = await supabase.from("qc_parameters").insert(baru);
      if (error) throw new Error(error.message);
    }

    for (const p of payload.filter((x) => x.id)) {
      const { error } = await supabase
        .from("qc_parameters")
        .update(p.row)
        .eq("id", p.id!)
        .eq("organization_id", organizationId);
      if (error) throw new Error(error.message);
    }

    revalidatePath("/qc-parameters");
    revalidatePath("/qc-incoming");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal menyimpan" };
  }
}
