"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createInci(formData: FormData) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }

  const inci_name = formData.get("inci_name") as string;
  const cas_number = formData.get("cas_number") as string;
  const noael = formData.get("noael") as string;
  const inci_function = formData.get("function") as string;
  const reference = formData.get("reference") as string;

  if (!inci_name) {
    throw new Error("INCI Name wajib diisi");
  }

  const { error } = await supabase.from("inci_master").insert({
    inci_name,
    cas_number: cas_number || null,
    noael: noael || null,
    function: inci_function || null,
    reference: reference || null,
    organization_id: organizationId,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/inci");
  redirect("/inci");
}

export async function updateInci(id: string, formData: FormData) {
  const supabase = await createClient();

  const inci_name = formData.get("inci_name") as string;
  const cas_number = formData.get("cas_number") as string;
  const noael = formData.get("noael") as string;
  const inci_function = formData.get("function") as string;
  const reference = formData.get("reference") as string;

  if (!inci_name) {
    throw new Error("INCI Name wajib diisi");
  }

  const { error } = await supabase
    .from("inci_master")
    .update({
      inci_name,
      cas_number: cas_number || null,
      noael: noael || null,
      function: inci_function || null,
      reference: reference || null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/inci");
  redirect("/inci");
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