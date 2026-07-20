import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ServiceForm from "../ServiceForm";

export default function NewServicePage() {
  return (
    <div className="max-w-lg">
      <Link
        href="/services"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Services
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Tambah Layanan Jasa
      </h1>
      <p className="text-muted text-sm mb-6">
        Kode dibuat otomatis (SRV-XXXX) saat disimpan.
      </p>

      <ServiceForm />
    </div>
  );
}
