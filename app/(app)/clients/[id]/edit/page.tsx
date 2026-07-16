import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ClientForm from "../../ClientForm";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!client) notFound();

  return (
    <div className="max-w-2xl">
      <Link
        href="/clients"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Clients
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Edit Client <span className="font-mono text-[20px]">{client.kode}</span>
      </h1>
      <p className="text-muted text-sm mb-6">{client.company_brand}</p>

      <ClientForm client={client} />
    </div>
  );
}
