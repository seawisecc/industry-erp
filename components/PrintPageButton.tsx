"use client";

import { Printer } from "lucide-react";

export default function PrintPageButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print-hide flex items-center gap-1.5 bg-botanical-700 text-white text-[13px] font-medium px-3.5 py-2.5 rounded-sm hover:bg-botanical-800 transition-colors"
    >
      <Printer size={15} /> Cetak / PDF
    </button>
  );
}
