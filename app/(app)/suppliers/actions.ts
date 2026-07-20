"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type SupplierInput = {
  nama: string;
  alamat: string | null;
  nama_kontak: string | null;
  no_telp: string | null;
  email: string | null;
  npwp: string | null;
};

// Simpan supplier (baru atau edit). Return {ok, error} — tidak throw,
// supaya pesan error asli tetap terlihat di production.
export async function saveSupplier(
  input: SupplierInput,
  id?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const nama = input.nama?.trim();
    if (!nama) throw new Error("Nama supplier wajib diisi");

    // Cegah double input: cek nama yang sama (case-insensitive) di org ini
    const dupQuery = supabase
      .from("suppliers")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("nama", nama);
    const { data: dup } = id ? await dupQuery.neq("id", id) : await dupQuery;
    if (dup && dup.length > 0) {
      throw new Error(`Supplier "${nama}" sudah terdaftar`);
    }

    const payload = {
      nama,
      alamat: input.alamat?.trim() || null,
      nama_kontak: input.nama_kontak?.trim() || null,
      no_telp: input.no_telp?.trim() || null,
      email: input.email?.trim() || null,
      npwp: input.npwp?.trim() || null,
    };

    const { error } = id
      ? await supabase
          .from("suppliers")
          .update(payload)
          .eq("id", id)
          .eq("organization_id", organizationId)
      : await supabase
          .from("suppliers")
          .insert({ ...payload, organization_id: organizationId });

    if (error) throw new Error(error.message);

    revalidatePath("/suppliers");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal menyimpan" };
  }
}

export async function importSuppliers(rows: {
  nama: string;
  alamat?: string;
  nama_kontak?: string;
  no_telp?: string;
  email?: string;
  npwp?: string;
}[]) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }

  const validRows = rows.filter((r) => r.nama && r.nama.trim() !== "");

  if (validRows.length === 0) {
    throw new Error("Tidak ada baris valid untuk diimport");
  }

  const { error } = await supabase.from("suppliers").insert(
    validRows.map((r) => ({
      nama: r.nama.trim(),
      alamat: r.alamat || null,
      nama_kontak: r.nama_kontak || null,
      no_telp: r.no_telp || null,
      email: r.email || null,
      npwp: r.npwp || null,
      organization_id: organizationId,
    }))
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/suppliers");
  return { success: true, count: validRows.length };
}

