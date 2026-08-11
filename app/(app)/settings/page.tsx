import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import SettingsForm from "./SettingsForm";
import AccountForm from "./AccountForm";
import SettingsShell from "@/components/SettingsShell";
import StorageCard from "./StorageCard";
import type { StorageRow } from "@/lib/storage";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { profile, organizationId } = await getEffectiveOrg();

  const [{ data: settings }, { data: org }, { data: storage }] =
    await Promise.all([
      supabase
        .from("organization_settings")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("organizations")
        .select("nama, storage_quota_gb")
        .eq("id", organizationId)
        .single(),
      supabase
        .from("organization_storage")
        .select("organization_id, bytes, baris, per_tabel, dihitung_pada")
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);

  return (
    <SettingsShell>
      <div className="max-w-5xl">
        <h2 className="font-display text-lg font-semibold text-ink mb-4">
          Company Profile · {org?.nama}
        </h2>

        <AccountForm
          companyNama={org?.nama || ""}
          adminNama={profile?.nama || ""}
          email={profile?.email || ""}
        />

        <SettingsForm initial={settings} />

        <StorageCard
          row={(storage as StorageRow | null) ?? null}
          quotaGb={org?.storage_quota_gb ?? null}
        />
      </div>
    </SettingsShell>
  );
}
