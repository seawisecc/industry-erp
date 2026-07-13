import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MaterialForm from "../MaterialForm";

export default async function NewMaterialPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: suppliers }, { data: inciOptions }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, nama")
      .eq("organization_id", organizationId)
      .order("nama"),
    supabase
      .from("inci_master")
      .select("id, inci_name, cas_number")
      .eq("organization_id", organizationId)
      .order("inci_name"),
  ]);

  return (
    <div className="max-w-2xl">
      <Link href="/materials" className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink">
        <ArrowLeft size={15} /> Kembali ke Material
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-6">Tambah Material</h1>

      <MaterialForm suppliers={suppliers || []} inciOptions={inciOptions || []} />
    </div>
  );
}