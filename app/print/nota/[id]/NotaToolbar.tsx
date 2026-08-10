"use client";

import { Printer, ArrowLeft, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NotaToolbar({ invoiceId }: { invoiceId: string }) {
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
        <div className="flex items-center gap-2">
          <Link
            href={`/print/invoice/${invoiceId}`}
            className="flex items-center gap-1.5 bg-white/70 border border-line text-[13px] font-medium px-3 py-2.5 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
          >
            <FileText size={15} /> Invoice A4
          </Link>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-botanical-700 text-white text-[13.5px] font-medium px-4 py-2.5 rounded-lg hover:bg-botanical-800 active:scale-95 transition-all shadow-sm whitespace-nowrap"
          >
            <Printer size={16} /> Cetak Nota
          </button>
        </div>
      </div>
    </div>
  );
}
