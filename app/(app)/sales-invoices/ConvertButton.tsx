"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { convertToInvoice } from "./actions";

export default function ConvertButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function convert() {
    if (loading) return;
    const top = prompt("Jadikan Invoice — TOP berapa hari? (0 = tunai)", "0");
    if (top === null) return;
    setLoading(true);
    try {
      const result = await convertToInvoice(id, Math.max(0, parseInt(top) || 0));
      if (!result.ok) alert(result.error || "Gagal");
      router.refresh();
    } catch {
      alert("Gagal — koneksi bermasalah atau aplikasi baru diperbarui. Muat ulang halaman lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={convert}
      disabled={loading}
      className="text-botanical-700 text-[12.5px] font-medium hover:underline disabled:opacity-60"
    >
      {loading ? "..." : "Jadikan Invoice"}
    </button>
  );
}
