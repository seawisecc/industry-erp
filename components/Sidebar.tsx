import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFeatures } from "@/lib/featuresServer";
import SidebarNav from "./SidebarNav";
import MobileBottomNav from "./MobileBottomNav";
import { SIDEBAR_COOKIE, bacaRail } from "@/lib/sidebarPref";

export default async function Sidebar() {
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  const features = await getFeatures(organizationId!);

  let organizations: { id: string; nama: string; slug: string; aktif: boolean }[] = [];
  if (isSuperAdmin) {
    const { data } = await supabase.from("organizations").select("*").order("nama");
    organizations = data || [];
  }

  // Lebar sidebar dibaca di SERVER supaya HTML pertama sudah benar.
  // Lihat lib/sidebarPref.ts: dulu ini di localStorage dan sidebar
  // selalu berkedip lebar lalu sempit di tiap muat halaman.
  const railAwal = bacaRail((await cookies()).get(SIDEBAR_COOKIE)?.value);

  const { data: currentOrg } = await supabase
    .from("organizations")
    .select("nama")
    .eq("id", organizationId)
    .single();

  return (
    <>
      <SidebarNav
        profileNama={profile?.nama || ""}
        isSuperAdmin={isSuperAdmin}
        role={profile?.role || ""}
        allowedModules={profile?.allowed_modules ?? null}
        organizations={organizations}
        currentOrgId={organizationId || ""}
        currentOrgNama={currentOrg?.nama || ""}
        railAwal={railAwal}
      />
      <MobileBottomNav
        isSuperAdmin={isSuperAdmin}
        role={profile?.role || ""}
        allowedModules={profile?.allowed_modules ?? null}
        hasQc={features.qc}
        hasQa={features.qa}
      />
    </>
  );
}