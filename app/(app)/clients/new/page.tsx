import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ClientForm from "../ClientForm";

export default function NewClientPage() {
  return (
    <div className="max-w-2xl">
      <Link
        href="/clients"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Clients
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Tambah Client
      </h1>
      <p className="text-muted text-sm mb-6">
        Kode client dibuat otomatis (CL-0001) saat disimpan.
      </p>

      <ClientForm />
    </div>
  );
}
