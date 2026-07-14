"use client";

import { Printer, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PrintButton() {
  const router = useRouter();
  return (
    <div className="max-w-[210mm] mx-auto mb-4 flex items-center justify-between print:hidden px-2">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-muted text-[13px] hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali
      </button>
      <button
        onClick={() => window.print()}
        className="flex items-center gap-2 bg-botanical-700 text-white text-[13.5px] font-medium px-4 py-2.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm"
      >
        <Printer size={16} /> Cetak / Simpan PDF
      </button>
    </div>
  );
}
