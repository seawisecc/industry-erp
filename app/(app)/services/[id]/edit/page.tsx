import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import ServiceForm from "../../ServiceForm";

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: service } = await supabase
    .from("services")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!service) {
    notFound();
  }

  return (
    <div className="max-w-lg">
      <Link
        href="/services"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Services
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Edit Layanan Jasa{" "}
        <span className="font-mono text-[20px]">{service.kode}</span>
      </h1>
      <p className="text-muted text-sm mb-6">
        Perubahan biaya hanya memengaruhi transaksi berikutnya.
      </p>

      <ServiceForm
        id={id}
        initial={{
          nama_jasa: service.nama_jasa,
          keterangan: service.keterangan,
          biaya: Number(service.biaya),
          aktif: service.aktif,
        }}
      />
    </div>
  );
}
