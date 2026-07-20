import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import SupplierForm from "../../SupplierForm";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!supplier) {
    notFound();
  }

  return (
    <div className="max-w-lg">
      <Link
        href="/suppliers"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Supplier
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-6">
        Edit Supplier
      </h1>

      <SupplierForm
        id={id}
        initial={{
          nama: supplier.nama,
          alamat: supplier.alamat,
          nama_kontak: supplier.nama_kontak,
          no_telp: supplier.no_telp,
          email: supplier.email,
          npwp: supplier.npwp,
        }}
      />
    </div>
  );
}
