"use client";

import { Printer, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PrintButton() {
  const router = useRouter();
  return (
    <div className="sticky top-0 z-30 mb-4 print:hidden bg-[#FAF7F1]/85 backdrop-blur-sm border-b border-line/60">
      <div className="max-w-[210mm] mx-auto flex items-center justify-between gap-2 px-3 py-2.5">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-muted text-[13px] hover:text-ink py-1.5 pr-2"
        >
          <ArrowLeft size={16} /> Kembali
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-botanical-700 text-white text-[13.5px] font-medium px-4 py-2.5 rounded-lg hover:bg-botanical-800 active:scale-95 transition-all shadow-sm"
        >
          <Printer size={16} /> Cetak / Simpan PDF
        </button>
      </div>
    </div>
  );
}
