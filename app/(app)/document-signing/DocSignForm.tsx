"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_TYPES, type DocTypeKey, type SignSlot } from "@/lib/docSign";
import { saveDocSignSettings } from "./actions";

export type DocSignInitial = Record<DocTypeKey, SignSlot[]>;

export default function DocSignForm({ initial }: { initial: DocSignInitial }) {
  const router = useRouter();
  const [data, setData] = useState<DocSignInitial>(initial);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function setSlot(
    docType: DocTypeKey,
    idx: number,
    patch: Partial<SignSlot>
  ) {
    setSaved(false);
    setData((d) => ({
      ...d,
      [docType]: d[docType].map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setSaved(false);
    const result = await saveDocSignSettings(
      DOC_TYPES.map((d) => ({ doc_type: d.key, slots: data[d.key] }))
    );
    if (result.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setError(result.error || "Gagal menyimpan");
    }
    setLoading(false);
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700 disabled:opacity-40";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {DOC_TYPES.map((doc) => {
        const aktifCount = data[doc.key].filter((s) => s.aktif).length;
        return (
          <div key={doc.key} className="glass rounded-2xl p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-display text-[15px] font-semibold text-ink">
                {doc.label}
              </h3>
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  aktifCount > 0
                    ? "bg-botanical-100 text-botanical-700"
                    : "bg-clay-100 text-clay-600"
                }`}
              >
                {aktifCount > 0
                  ? `${aktifCount} kolom tanda tangan`
                  : "Tanpa tanda tangan"}
              </span>
              {doc.key === "qa" && (
                <span className="w-full text-[11.5px] text-muted">
                  Muncul di Sertifikat Analisa produk jadi — biasanya Diperiksa
                  oleh (analis) dan Disetujui oleh (Manager QA).
                </span>
              )}
              {doc.key === "qc" && (
                <span className="w-full text-[11.5px] text-muted">
                  Muncul di cetakan lembar pengujian — biasanya Diperiksa oleh
                  (analis QC) dan Disetujui oleh (Manager QC).
                </span>
              )}
            </div>

            {data[doc.key].map((slot, idx) => (
              <div
                key={slot.key}
                className="grid grid-cols-1 sm:grid-cols-[150px_1fr_1fr] gap-3 items-center"
              >
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={slot.aktif}
                    onChange={(e) =>
                      setSlot(doc.key, idx, { aktif: e.target.checked })
                    }
                    className="accent-[#2f4f3e] w-4 h-4"
                  />
                  <span
                    className={`text-[13px] font-medium ${
                      slot.aktif ? "text-ink" : "text-muted line-through"
                    }`}
                  >
                    {slot.label.replace(",", "")}
                  </span>
                </label>
                <input
                  value={slot.nama}
                  onChange={(e) => setSlot(doc.key, idx, { nama: e.target.value })}
                  disabled={!slot.aktif}
                  placeholder="Nama"
                  className={inputCls}
                />
                <input
                  value={slot.jabatan}
                  onChange={(e) =>
                    setSlot(doc.key, idx, { jabatan: e.target.value })
                  }
                  disabled={!slot.aktif}
                  placeholder="Jabatan"
                  className={inputCls}
                />
              </div>
            ))}
          </div>
        );
      })}

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}
      {saved && (
        <p className="text-botanical-700 text-[12.5px] font-medium">
          ✓ Pengaturan pengesahan tersimpan
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Menyimpan..." : "Simpan Semua Pengaturan"}
      </button>
    </form>
  );
}
