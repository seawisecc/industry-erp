"use client";

/* ============================================================
   Tombol "Hitung Ulang" pemakaian penyimpanan.

   Angkanya snapshot, jadi layar WAJIB menyebut kapan diambil,
   tanpa itu tidak ada yang tahu apakah 9,7 GB itu kondisi tadi pagi
   atau kondisi bulan lalu, dan angka yang dipakai menagih tidak
   boleh setengah diketahui begitu.
   ============================================================ */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { hitungUlangStorage } from "./actions";
import { waktuHitung } from "@/lib/storage";

export default function StorageRefresh({
  dihitungPada,
  paksa = false,
}: {
  dihitungPada: string | null;
  /** Super admin boleh melewati rem 10 menit di fungsi SQL-nya */
  paksa?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function jalankan() {
    if (loading) return;
    setLoading(true);
    setError("");
    const res = await hitungUlangStorage(paksa);
    if (!res.ok) setError(res.error || "Gagal menghitung");
    else router.refresh();
    setLoading(false);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        onClick={jalankan}
        disabled={loading}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-white/70 border border-line text-ink text-[12.5px] font-medium hover:bg-white transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        {loading ? "Menghitung…" : "Hitung Ulang"}
      </button>
      <span className="text-[12px] text-muted">
        {error ? (
          <span className="text-clay-600">{error}</span>
        ) : (
          `Angka terakhir dihitung ${waktuHitung(dihitungPada)}`
        )}
      </span>
    </div>
  );
}
