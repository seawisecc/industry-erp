import { createClient } from "@/lib/supabase/server";
import {
  parseTaxSettings,
  TAX_MODE_DEFAULT,
  TAX_PERCENT_DEFAULT,
  type TaxSettings,
} from "@/lib/invoiceMath";

/**
 * Model pajak & tarif bawaan perusahaan.
 *
 * Selalu dibaca di server, tidak pernah dipercaya dari props klien:
 * angka yang dikirim form ikut dihitung ulang di server action dengan
 * hasil query ini, jadi tab yang sudah lama terbuka tidak bisa menerbitkan
 * dokumen dengan model pajak yang sudah tidak berlaku.
 */
export async function getTaxSettings(
  organizationId: string
): Promise<TaxSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_settings")
    .select("tax_mode, tax_percent, tax_dpp_nilai_lain")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) {
    return {
      taxMode: TAX_MODE_DEFAULT,
      taxPercent: TAX_PERCENT_DEFAULT,
      dppNilaiLain: true,
    };
  }
  return parseTaxSettings(data);
}
