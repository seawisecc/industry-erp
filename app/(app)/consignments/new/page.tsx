import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getSalesOptions } from "@/lib/salesOptions";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ConsignmentForm from "./ConsignmentForm";

export default async function NewConsignmentPage() {
  const { organizationId } = await getEffectiveOrg();
  const { clients, options } = await getSalesOptions(organizationId!);

  return (
    <div className="max-w-3xl">
      <Link
        href="/consignments"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Consignment
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Kirim Konsinyasi
      </h1>
      <p className="text-muted text-sm mb-6">
        Barang keluar dari stok produk jadi dan tercatat sebagai stok di lokasi
        client.
      </p>

      <ConsignmentForm clients={clients} options={options} />
    </div>
  );
}
