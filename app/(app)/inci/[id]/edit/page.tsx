import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import InciForm from "../../InciForm";

export default async function EditInciPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: inci } = await supabase
    .from("inci_master")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!inci) {
    notFound();
  }

  return (
    <div className="max-w-lg">
      <Link
        href="/inci"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke INCI Name
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-6">
        Edit INCI Name
      </h1>

      <InciForm
        id={id}
        initial={{
          inci_name: inci.inci_name,
          cas_number: inci.cas_number,
          noael: inci.noael,
          function: inci.function,
          reference: inci.reference,
        }}
      />
    </div>
  );
}
