import { createClient } from "@/lib/supabase/server";
import { parseFeatures, type FeatureFlags } from "@/lib/features";

/** Ambil feature flags perusahaan (default semua off bila belum diatur). */
export async function getFeatures(
  organizationId: string
): Promise<FeatureFlags> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_settings")
    .select("features")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return parseFeatures(data?.features);
}
