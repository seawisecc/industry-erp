"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setCompanyActive } from "./actions";

export default function CompanyToggle({
  id,
  nama,
  aktif,
}: {
  id: string;
  nama: string;
  aktif: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    if (
      aktif &&
      !confirm(`Nonaktifkan ${nama}? Semua user company ini tidak bisa memakai aplikasi.`)
    )
      return;
    setLoading(true);
    try {
      await setCompanyActive(id, !aktif);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal mengubah status");
    }
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`text-[12.5px] font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 ${
        aktif
          ? "text-clay-600 border border-clay-500/40 hover:bg-clay-100"
          : "bg-botanical-700 text-white hover:bg-botanical-800"
      }`}
    >
      {loading ? "..." : aktif ? "Nonaktifkan" : "Aktifkan"}
    </button>
  );
}
