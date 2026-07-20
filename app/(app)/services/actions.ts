"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type ServiceInput = {
  nama_jasa: string;
  keterangan: string | null;
  biaya: number;
  aktif: boolean;
};

// Kode otomatis SRV-XXXX
async function nextServiceKode(organizationId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("kode")
    .eq("organization_id", organizationId)
    .like("kode", "SRV-%")
    .order("kode", { ascending: false })
    .limit(1);
  const last = data?.[0]?.kode as string | undefined;
  const lastNum = last ? parseInt(last.slice(4)) || 0 : 0;
  return "SRV-" + String(lastNum + 1).padStart(4, "0");
}

// Simpan jasa (baru atau edit). Return {ok, error}.
export async function saveService(
  input: ServiceInput,
  id?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const nama = input.nama_jasa?.trim();
    if (!nama) throw new Error("Nama jasa wajib diisi");
    if (input.biaya == null || input.biaya < 0)
      throw new Error("Biaya tidak boleh negatif");

    // Cegah double input: nama jasa sama (case-insensitive)
    const dupQuery = supabase
      .from("services")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("nama_jasa", nama);
    const { data: dup } = id ? await dupQuery.neq("id", id) : await dupQuery;
    if (dup && dup.length > 0) {
      throw new Error(`Jasa "${nama}" sudah terdaftar`);
    }

    const payload = {
      nama_jasa: nama,
      keterangan: input.keterangan?.trim() || null,
      biaya: input.biaya,
      aktif: input.aktif,
    };

    const { error } = id
      ? await supabase
          .from("services")
          .update(payload)
          .eq("id", id)
          .eq("organization_id", organizationId)
      : await supabase.from("services").insert({
          ...payload,
          kode: await nextServiceKode(organizationId),
          organization_id: organizationId,
        });

    if (error) throw new Error(error.message);

    revalidatePath("/services");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal menyimpan" };
  }
}
