import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getSalesOptions } from "@/lib/salesOptions";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import InvoiceForm from "../InvoiceForm";

export default async function NewInvoicePage() {
  const { organizationId } = await getEffectiveOrg();
  const { clients, options } = await getSalesOptions(organizationId!, { includeServices: true });

  return (
    <div className="max-w-3xl">
      <Link
        href="/sales-invoices"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Invoices
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Buat Proforma / Invoice
      </h1>
      <p className="text-muted text-sm mb-6">
        No. dokumen dibuat otomatis (INV.YYYYMM###). Penjualan Direct memotong
        stok produk jadi.
      </p>

      <InvoiceForm clients={clients} options={options} mode="invoice" />
    </div>
  );
}
