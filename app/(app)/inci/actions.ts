"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type InciInput = {
  inci_name: string;
  cas_number: string | null;
  noael: string | null;
  function: string | null;
  reference: string | null;
};

// Simpan INCI (baru atau edit). Return {ok, error} — tidak throw,
// supaya pesan error asli tetap terlihat di production.
export async function saveInci(
  input: InciInput,
  id?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const inci_name = input.inci_name?.trim();
    if (!inci_name) throw new Error("INCI Name wajib diisi");

    // Cegah double input: nama sama (case-insensitive) di org ini
    const dupQuery = supabase
      .from("inci_master")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("inci_name", inci_name);
    const { data: dup } = id ? await dupQuery.neq("id", id) : await dupQuery;
    if (dup && dup.length > 0) {
      throw new Error(`INCI "${inci_name}" sudah terdaftar`);
    }

    const payload = {
      inci_name,
      cas_number: input.cas_number?.trim() || null,
      noael: input.noael?.trim() || null,
      function: input.function?.trim() || null,
      reference: input.reference?.trim() || null,
    };

    const { error } = id
      ? await supabase
          .from("inci_master")
          .update(payload)
          .eq("id", id)
          .eq("organization_id", organizationId)
      : await supabase
          .from("inci_master")
          .insert({ ...payload, organization_id: organizationId });

    if (error) throw new Error(error.message);

    revalidatePath("/inci");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal menyimpan" };
  }
}

export async function importInci(rows: {
  inci_name: string;
  cas_number?: string;
  noael?: string;
  function?: string;
  reference?: string;
}[]) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }

  const validRows = rows.filter((r) => r.inci_name && r.inci_name.trim() !== "");

  if (validRows.length === 0) {
    throw new Error("Tidak ada baris valid untuk diimport");
  }

  // Buang duplikat DI DALAM file (nama sama muncul >1x, ambil yang pertama)
  const seen = new Set<string>();
  const uniqueRows = validRows.filter((r) => {
    const key = r.inci_name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // upsert + ignoreDuplicates: baris yang namanya sudah ada di database dilewati, bukan bikin gagal
  const { error } = await supabase.from("inci_master").upsert(
    uniqueRows.map((r) => ({
      inci_name: r.inci_name.trim(),
      cas_number: r.cas_number || null,
      noael: r.noael || null,
      function: r.function || null,
      reference: r.reference || null,
      organization_id: organizationId,
    })),
    { onConflict: "organization_id,inci_name", ignoreDuplicates: true }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/inci");
  return { success: true, count: uniqueRows.length };
}