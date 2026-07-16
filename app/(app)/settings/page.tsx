import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import SettingsForm from "./SettingsForm";
import AccountForm from "./AccountForm";
import SettingsShell from "@/components/SettingsShell";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { profile, organizationId } = await getEffectiveOrg();

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
    <SettingsShell>
      <div className="max-w-3xl">
        <h2 className="font-display text-lg font-semibold text-ink mb-4">
          Company Profile — {org?.nama}
        </h2>

        <AccountForm
          companyNama={org?.nama || ""}
          adminNama={profile?.nama || ""}
          email={profile?.email || ""}
        />

        <SettingsForm initial={settings} />
      </div>
    </SettingsShell>
  );
}
