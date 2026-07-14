import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import SettingsForm from "./SettingsForm";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: settings }, { data: org }] = await Promise.all([
    supabase
      .from("organization_settings")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("nama")
      .eq("id", organizationId)
      .single(),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold text-ink">Pengaturan</h1>
      <p className="text-muted text-sm mt-1 mb-6">
        {org?.nama} — data perusahaan &amp; pengesahan dokumen
      </p>

      <SettingsForm initial={settings} />
    </div>
  );
}
