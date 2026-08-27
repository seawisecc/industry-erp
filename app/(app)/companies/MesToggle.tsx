"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { setCompanyFeature } from "./actions";
import { useConfirmSave } from "@/components/ConfirmSave";

// Chip toggle fitur berbayar per company (MES / QC / QA), paket Full
export default function MesToggle({
  organizationId,
  initialOn,
  featureKey = "mes",
}: {
  organizationId: string;
  initialOn: boolean;
  featureKey?: "mes" | "qc" | "qa";
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const [on, setOn] = useState(initialOn);
  const [loading, setLoading] = useState(false);

  const label = featureKey.toUpperCase();

  async function toggle() {
    if (loading) return;
    const next = !on;

    const lanjut = await konfirmasi.minta({
      judul: next
        ? `Aktifkan fitur ${label} untuk company ini?`
        : `Matikan fitur ${label} untuk company ini?`,
      pesan: next
        ? "Modulnya langsung muncul untuk semua pengguna company ini."
        : "Modulnya hilang dari semua pengguna company ini.",
      tombol: next ? "Ya, Aktifkan" : "Ya, Matikan",
      nada: next ? "simpan" : "bahaya",
    });
    if (!lanjut) return;

    setLoading(true);
    const result = await setCompanyFeature(organizationId, featureKey, next);
    if (result.ok) {
      setOn(next);
      router.refresh();
    } else {
      alert(result.error || "Gagal mengubah fitur");
    }
    setLoading(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        title={on ? `Matikan ${label}` : `Aktifkan ${label} (paket Full)`}
        className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11.5px] font-semibold border transition-colors disabled:opacity-50 ${
          on
            ? "bg-botanical-700 text-white border-botanical-700 hover:bg-botanical-800"
            : "bg-white text-muted border-line hover:border-botanical-700/40 hover:text-ink"
        }`}
      >
        {loading ? (
          <span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />
        ) : on ? (
          <Check size={12} strokeWidth={3} />
        ) : (
          <span className="w-3 text-center leading-none">+</span>
        )}
        {label}
      </button>
      {konfirmasi.dialog}
    </>
  );
}
