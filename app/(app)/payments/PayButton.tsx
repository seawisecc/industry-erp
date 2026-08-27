"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Undo2 } from "lucide-react";
import { setInvoicePaid } from "./actions";
import { useConfirmSave } from "@/components/ConfirmSave";

export default function PayButton({
  id,
  noInvoice,
  paid,
}: {
  id: string;
  noInvoice: string | null;
  paid: boolean;
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;

    const lanjut = await konfirmasi.minta({
      judul: paid ? "Batalkan status lunas faktur ini?" : "Tandai faktur ini LUNAS?",
      pesan: paid
        ? "Faktur kembali dihitung sebagai hutang yang belum dibayar."
        : "Faktur keluar dari daftar hutang yang harus dibayar.",
      ringkasan: [{ label: "No. Faktur", nilai: noInvoice || "-" }],
      tombol: paid ? "Ya, Batalkan" : "Ya, Tandai Lunas",
      nada: paid ? "bahaya" : "simpan",
    });
    if (!lanjut) return;

    setLoading(true);
    const result = await setInvoicePaid(id, !paid);
    if (!result.ok) alert(result.error || "Gagal");
    router.refresh();
    setLoading(false);
  }

  if (paid) {
    return (
      <>
        <button
          onClick={toggle}
          disabled={loading}
          title="Batalkan lunas"
          className="inline-flex items-center gap-1 text-muted text-[11.5px] hover:text-clay-600 transition-colors disabled:opacity-60"
        >
          <Undo2 size={13} /> Batalkan
        </button>
        {konfirmasi.dialog}
      </>
    );
  }

  return (
    <>
      <button
        onClick={toggle}
        disabled={loading}
        className="inline-flex items-center gap-1.5 bg-botanical-700 text-white text-[12.5px] font-medium px-3 py-1.5 rounded-lg hover:bg-botanical-800 transition-colors disabled:opacity-60"
      >
        <Banknote size={14} /> {loading ? "..." : "Bayar"}
      </button>
      {konfirmasi.dialog}
    </>
  );
}
