"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createSupplier(formData: FormData) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const nama = formData.get("nama") as string;
  const alamat = formData.get("alamat") as string;
  const nama_kontak = formData.get("nama_kontak") as string;
  const no_telp = formData.get("no_telp") as string;
  const email = formData.get("email") as string;
  const npwp = formData.get("npwp") as string;

  if (!nama) {
    throw new Error("Nama supplier wajib diisi");
  }

  const { error } = await supabase.from("suppliers").insert({
    nama,
    alamat: alamat || null,
    nama_kontak: nama_kontak || null,
    no_telp: no_telp || null,
    email: email || null,
    npwp: npwp || null,
    organization_id: organizationId,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/suppliers");
  redirect("/suppliers");
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

export async function updateSupplier(id: string, formData: FormData) {
  const supabase = await createClient();

  const nama = formData.get("nama") as string;
  const alamat = formData.get("alamat") as string;
  const nama_kontak = formData.get("nama_kontak") as string;
  const no_telp = formData.get("no_telp") as string;
  const email = formData.get("email") as string;
  const npwp = formData.get("npwp") as string;

  if (!nama) {
    throw new Error("Nama supplier wajib diisi");
  }

  const { error } = await supabase
    .from("suppliers")
    .update({
      nama,
      alamat: alamat || null,
      nama_kontak: nama_kontak || null,
      no_telp: no_telp || null,
      email: email || null,
      npwp: npwp || null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/suppliers");
  redirect("/suppliers");
}