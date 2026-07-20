import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SupplierForm from "../SupplierForm";

export default function NewSupplierPage() {
  return (
    <div className="max-w-lg">
      <Link
        href="/suppliers"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Supplier
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-6">
        Tambah Supplier
      </h1>

      <SupplierForm />
    </div>
  );
}
