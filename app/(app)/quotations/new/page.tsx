import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getTaxSettings } from "@/lib/taxServer";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import QuotationForm from "../QuotationForm";
import { getQuotationClients } from "../data";

export default async function NewQuotationPage() {
  const { organizationId } = await getEffectiveOrg();
  const [clients, taxSettings] = await Promise.all([
    getQuotationClients(organizationId!),
    getTaxSettings(organizationId!),
  ]);

  return (
    <div className="max-w-5xl">
      <Link
        href="/quotations"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Quotations
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Buat Quotation
      </h1>
      <p className="text-muted text-sm mb-6">
        No. dokumen dibuat otomatis (QUO.YYYYMM###). Quotation tidak memotong
        stok; Proforma baru terbit setelah client setuju.
      </p>

      <QuotationForm clients={clients} taxSettings={taxSettings} />
    </div>
  );
}
