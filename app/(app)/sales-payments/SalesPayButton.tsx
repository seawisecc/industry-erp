"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Undo2 } from "lucide-react";
import { setSalesInvoicePaid } from "./actions";

export default function SalesPayButton({
  id,
  noInvoice,
  paid,
}: {
  id: string;
  noInvoice: string | null;
  paid: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    if (!paid && !confirm(`Tandai ${noInvoice || "invoice ini"} sebagai LUNAS?`)) return;
    if (paid && !confirm("Batalkan status lunas?")) return;
    setLoading(true);
    const result = await setSalesInvoicePaid(id, !paid);
    if (!result.ok) alert(result.error || "Gagal");
    router.refresh();
    setLoading(false);
  }

  if (paid) {
    return (
      <button
        onClick={toggle}
        disabled={loading}
        className="inline-flex items-center gap-1 text-muted text-[11.5px] hover:text-clay-600 transition-colors disabled:opacity-60"
      >
        <Undo2 size={13} /> Batalkan
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="inline-flex items-center gap-1.5 bg-botanical-700 text-white text-[12.5px] font-medium px-3 py-1.5 rounded-lg hover:bg-botanical-800 transition-colors disabled:opacity-60"
    >
      <Banknote size={14} /> {loading ? "..." : "Terima Bayar"}
    </button>
  );
}
