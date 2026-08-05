"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

// Catatan: JANGAN di-export dari file "use server" (hanya fungsi async yang
// boleh di-export), export const di sini menyebabkan server action error 500
// di production. Dipakai hanya di dalam file ini.
const CLIENT_KATEGORI = [
  "Brand Owner",
  "University/Corporation",
  "Research",
  "Reseller",
  "Walk In Customer",
  "Other",
] as const;

export type ClientInput = {
  company_brand: string;
  cp: string | null;
  npwp: string | null;
  phone: string | null;
  kategori: string;
  alamat: string | null;
  aktif: boolean;
};

function validate(data: ClientInput) {
  if (!data.company_brand?.trim()) throw new Error("Company/Brand wajib diisi");
  if (!CLIENT_KATEGORI.includes(data.kategori as (typeof CLIENT_KATEGORI)[number]))
    throw new Error("Kategori tidak valid");
}

async function nextKode(organizationId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("kode")
    .eq("organization_id", organizationId)
    .not("kode", "is", null)
    .order("kode", { ascending: false })
    .limit(1);

  const last = data?.[0]?.kode as string | undefined;
  const lastNum = last?.startsWith("CL-") ? parseInt(last.slice(3)) || 0 : 0;
  return "CL-" + String(lastNum + 1).padStart(4, "0");
}

export async function createClientData(
  data: ClientInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) {
      throw new Error("Organisasi tidak terdeteksi. Refresh halaman dan login ulang.");
    }
    validate(data);

    // Cegah double input: nama company/brand sama (case-insensitive) di org ini
    const { data: dup } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("company_brand", data.company_brand.trim());
    if (dup && dup.length > 0) {
      throw new Error(`Client "${data.company_brand.trim()}" sudah terdaftar`);
    }

    const { error } = await supabase.from("clients").insert({
      kode: await nextKode(organizationId),
      company_brand: data.company_brand.trim(),
      cp: data.cp?.trim() || null,
      npwp: data.npwp?.trim() || null,
      phone: data.phone?.trim() || null,
      kategori: data.kategori,
      alamat: data.alamat?.trim() || null,
      aktif: data.aktif,
      organization_id: organizationId,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/clients");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

export async function updateClientData(
  id: string,
  data: ClientInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) {
      throw new Error("Organisasi tidak terdeteksi. Refresh halaman dan login ulang.");
    }
    validate(data);

    // Cegah double input: nama sama di client LAIN (case-insensitive)
    const { data: dup } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("company_brand", data.company_brand.trim())
      .neq("id", id);
    if (dup && dup.length > 0) {
      throw new Error(`Client "${data.company_brand.trim()}" sudah terdaftar`);
    }

    const { error } = await supabase
      .from("clients")
      .update({
        company_brand: data.company_brand.trim(),
        cp: data.cp?.trim() || null,
        npwp: data.npwp?.trim() || null,
        phone: data.phone?.trim() || null,
        kategori: data.kategori,
        alamat: data.alamat?.trim() || null,
        aktif: data.aktif,
      })
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);

    revalidatePath("/clients");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

/**
 * Ganti seluruh daftar harga khusus satu client.
 *
 * Hapus lalu sisip ulang dikerjakan di dalam save_client_prices_tx, bukan
 * dua panggilan dari sini: gagal di antara keduanya berarti client
 * kehilangan seluruh harga khususnya dan diam-diam kembali ke harga
 * master, dan tidak ada yang akan sadar sampai tagihannya salah.
 */
export async function saveClientPrices(
  clientId: string,
  items: { product_id: string; varian: string | null; harga: number }[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!clientId) throw new Error("Client tidak dikenal");

    const bersih = items.filter((i) => i.product_id && i.harga >= 0);

    const { error } = await supabase.rpc("save_client_prices_tx", {
      p_organization_id: organizationId,
      p_client_id: clientId,
      p_items: bersih,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/clients");
    revalidatePath("/sales-invoices");
    revalidatePath("/pos");
    revalidatePath("/consignments");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal menyimpan harga khusus",
    };
  }
}
