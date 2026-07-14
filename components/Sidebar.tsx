import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import SidebarNav from "./SidebarNav";

export default async function Sidebar() {
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

  let organizations: { id: string; nama: string; slug: string; aktif: boolean }[] = [];
  if (isSuperAdmin) {
    const { data } = await supabase.from("organizations").select("*").order("nama");
    organizations = data || [];
  }

  const { data: currentOrg } = await supabase
    .from("organizations")
    .select("nama")
    .eq("id", organizationId)
    .single();

  return (
    <SidebarNav
      profileNama={profile?.nama || ""}
      isSuperAdmin={isSuperAdmin}
      role={profile?.role || ""}
      allowedModules={profile?.allowed_modules ?? null}
      organizations={organizations}
      currentOrgId={organizationId || ""}
      currentOrgNama={currentOrg?.nama || ""}
    />
  );
}