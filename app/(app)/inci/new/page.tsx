import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import InciForm from "../InciForm";

export default function NewInciPage() {
  return (
    <div className="max-w-lg">
      <Link
        href="/inci"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke INCI Name
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-6">
        Tambah INCI Name
      </h1>

      <InciForm />
    </div>
  );
}
