"use client";

/* ============================================================
   Tombol "Formula OK" dan pembatalannya.

   Satu versi berlaku per silsilah: menyetujui yang ini menurunkan
   versi lama jadi Arsip. Kalimat itu ditulis di dialognya, bukan
   cuma di dokumentasi, karena akibatnya menyentuh dokumen LAIN yang
   sedang tidak dilihat orang.
   ============================================================ */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Undo2 } from "lucide-react";
import { useConfirmSave } from "@/components/ConfirmSave";
import { approveRndFormula } from "../actions";

export default function KeputusanButton({
  id,
  noFormula,
  namaProduk,
  disetujui,
  versiLain,
}: {
  id: string;
  noFormula: string;
  namaProduk: string;
  disetujui: boolean;
  /** nomor versi lain yang sedang berstatus Disetujui, bila ada */
  versiLain: string | null;
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function jalankan(setuju: boolean) {
    if (loading) return;

    const lanjut = await konfirmasi.minta({
      judul: setuju
        ? "Tandai formula ini sebagai formula yang berlaku?"
        : "Batalkan persetujuan formula ini?",
      pesan: setuju
        ? (versiLain
            ? `Versi ${versiLain} yang sekarang dipakai otomatis turun jadi Arsip. `
            : "") +
          "Formula ini ditandai sebagai formula yang dipakai lalu dibekukan, jadi " +
          "perubahan sesudahnya lewat revisi baru. Tidak ada produk yang dibuat " +
          "otomatis dan tidak ada stok yang bergerak."
        : "Formula kembali ke status Trial dan bisa disunting lagi. Versi yang tadinya diarsipkan TIDAK ikut dikembalikan.",
      tombol: setuju ? "Ya, Formula OK" : "Ya, Batalkan",
      nada: setuju ? "simpan" : "bahaya",
      ringkasan: [
        { label: "No. Formula", nilai: noFormula },
        { label: "Produk", nilai: namaProduk },
      ],
    });
    if (!lanjut) return;

    setLoading(true);
    setError("");
    try {
      const res = await approveRndFormula(id, setuju);
      if (res.ok) {
        router.refresh();
        setLoading(false);
      } else {
        setError(res.error);
        setLoading(false);
      }
    } catch {
      setError(
        "Gagal, koneksi bermasalah atau aplikasi baru diperbarui. Muat ulang lalu coba lagi."
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {disetujui ? (
        <button
          onClick={() => jalankan(false)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-clay-500/40 text-clay-600 text-[12.5px] font-medium hover:bg-clay-100/60 transition-colors disabled:opacity-60"
        >
          <Undo2 size={15} /> Batalkan Persetujuan
        </button>
      ) : (
        <button
          onClick={() => jalankan(true)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-botanical-700 text-white text-[12.5px] font-medium hover:bg-botanical-800 transition-colors shadow-sm disabled:opacity-60"
        >
          <BadgeCheck size={15} /> Formula OK
        </button>
      )}
      {error && <p className="text-clay-600 text-[12px]">{error}</p>}
      {konfirmasi.dialog}
    </div>
  );
}
