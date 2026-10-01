import { createClient } from "@/lib/supabase/server";
import type { ClientOption } from "@/components/ClientPicker";

/**
 * Daftar client untuk pemilih di form quotation. Yang nonaktif tidak
 * ditawarkan, sama dengan form penjualan lain; quotation lama yang
 * menunjuk client nonaktif tetap ikut supaya pilihannya tidak hilang
 * diam-diam waktu dokumennya disunting.
 */
export async function getQuotationClients(
  organizationId: string,
  tetapIkut?: string | null
): Promise<ClientOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, kode, company_brand, aktif")
    .eq("organization_id", organizationId)
    .order("company_brand");
  return ((data || []) as (ClientOption & { aktif: boolean | null })[])
    .filter((c) => c.aktif !== false || c.id === tetapIkut)
    .map(({ id, kode, company_brand }) => ({ id, kode, company_brand }));
}
