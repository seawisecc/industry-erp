"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DOC_TYPES,
  SLOT_DEFS,
  pengesahQr,
  type DocTypeKey,
  type QrSignDoc,
  type SignSlot,
} from "@/lib/docSign";
import { saveDocSignSettings } from "./actions";
import { useConfirmSave } from "@/components/ConfirmSave";

export type DocSignInitial = Record<DocTypeKey, SignSlot[]>;
export type QrSignInitial = Record<DocTypeKey, QrSignDoc>;

export default function DocSignForm({
  initial,
  qrAwal,
}: {
  initial: DocSignInitial;
  qrAwal: QrSignInitial;
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const [data, setData] = useState<DocSignInitial>(initial);
  const [qr, setQr] = useState<QrSignInitial>(qrAwal);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function setQrDoc(docType: DocTypeKey, patch: Partial<QrSignDoc>) {
    setSaved(false);
    setQr((q) => ({ ...q, [docType]: { ...q[docType], ...patch } }));
  }

  /** Dokumen yang QR-nya dinyalakan tapi pengesahnya belum sah. */
  const qrBermasalah = DOC_TYPES.filter(
    (d) => qr[d.key].aktif && !pengesahQr(data[d.key], qr[d.key])
  );

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
    // Dicek di sini DAN di server. Yang di sini supaya user langsung
    // tahu dokumen mana yang belum beres; yang di server supaya
    // aturannya tetap berlaku walau form-nya dilewati.
    if (qrBermasalah.length > 0) {
      setError(
        `Pengesah QR belum sah di: ${qrBermasalah
          .map((d) => d.label)
          .join(", ")}. Kolom yang dipilih harus dicentang dan nama & jabatannya terisi.`
      );
      return;
    }

    const lanjut = await konfirmasi.minta({
      judul: "Simpan pengaturan tanda tangan dokumen?",
      pesan: "Berlaku untuk dokumen yang dicetak setelah ini.",
      ringkasan: [
        { label: "Jenis Dokumen", nilai: DOC_TYPES.length + " dokumen" },
        {
          label: "Pakai QR",
          nilai: DOC_TYPES.filter((d) => qr[d.key]?.aktif).length + " dokumen",
        },
      ],
    });
    if (!lanjut) return;

    setLoading(true);
    setError("");
    setSaved(false);
    try {
      const result = await saveDocSignSettings(
        DOC_TYPES.map((d) => ({
          doc_type: d.key,
          slots: data[d.key],
          qr_sign: qr[d.key],
        }))
      );
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error || "Gagal menyimpan");
      }
    } catch {
      setError(
        "Gagal menyimpan. Koneksi bermasalah atau aplikasi baru diperbarui, muat ulang halaman lalu coba lagi."
      );
      setLoading(false);
    }
    setLoading(false);
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700 disabled:opacity-40";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {DOC_TYPES.map((doc) => {
        const aktifCount = data[doc.key].filter((s) => s.aktif).length;
        const qrDoc = qr[doc.key];
        const pengesah = pengesahQr(data[doc.key], qrDoc);
        return (
          <div key={doc.key} className="glass rounded-2xl p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-display text-[15px] font-semibold text-ink">
                {doc.label}
              </h3>
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  pengesah
                    ? "bg-botanical-100 text-botanical-700"
                    : aktifCount > 0
                      ? "bg-botanical-100 text-botanical-700"
                      : "bg-clay-100 text-clay-600"
                }`}
              >
                {pengesah
                  ? `QR · ${pengesah.nama}`
                  : aktifCount > 0
                    ? `${aktifCount} kolom tanda tangan`
                    : "Tanpa tanda tangan"}
              </span>
              {doc.key === "qa" && (
                <span className="w-full text-[11.5px] text-muted">
                  Muncul di Sertifikat Analisa produk jadi, biasanya Diperiksa
                  oleh (analis) dan Disetujui oleh (Manager QA).
                </span>
              )}
              {doc.key === "qc" && (
                <span className="w-full text-[11.5px] text-muted">
                  Muncul di cetakan lembar pengujian, biasanya Diperiksa oleh
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

            {/* ===== QR Signature dokumen ini ===== */}
            <div className="border-t border-line pt-3 mt-1 flex flex-col gap-2.5">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={qrDoc.aktif}
                  onChange={(e) =>
                    setQrDoc(doc.key, { aktif: e.target.checked })
                  }
                  className="accent-[#2f4f3e] w-4 h-4 mt-0.5"
                />
                <span>
                  <span className="text-[13px] font-medium text-ink">
                    Sahkan dengan QR Signature
                  </span>
                  <span className="block text-[11.5px] text-muted">
                    Kolom tanda tangan di atas tidak ikut tercetak, diganti
                    kotak QR yang bisa dipindai siapa pun untuk memastikan
                    dokumen ini benar terbit dari sistem.
                  </span>
                </span>
              </label>

              {qrDoc.aktif && (
                <div className="pl-6 flex flex-col gap-2">
                  <span className="text-[12px] text-muted">
                    Yang mengesahkan:
                  </span>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {SLOT_DEFS.map((def) => {
                      const s2 = data[doc.key].find((x) => x.key === def.key);
                      // Slot yang dimatikan atau belum lengkap tidak boleh
                      // dipilih. QR yang menunjuk pengesah kosong membuat
                      // dokumen tampak sah tanpa ada yang bertanggung jawab.
                      const bisa =
                        !!s2 && s2.aktif && !!s2.nama.trim() && !!s2.jabatan.trim();
                      return (
                        <label
                          key={def.key}
                          className={`flex items-center gap-1.5 select-none ${
                            bisa ? "cursor-pointer" : "opacity-45"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`qr-slot-${doc.key}`}
                            checked={qrDoc.slot === def.key}
                            disabled={!bisa}
                            onChange={() => setQrDoc(doc.key, { slot: def.key })}
                            className="accent-[#2f4f3e] w-4 h-4"
                          />
                          <span className="text-[12.5px]">
                            {def.label.replace(",", "")}
                            {s2?.nama ? (
                              <span className="text-muted"> · {s2.nama}</span>
                            ) : (
                              <span className="text-muted"> · belum diisi</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {!pengesah && (
                    <p className="text-clay-600 text-[12px]">
                      Pilih kolom yang sudah dicentang dan lengkap nama serta
                      jabatannya.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <p className="text-[11.5px] text-muted -mt-1">
        QR Signature ini <b>non-certified</b>: tidak ada PSrE dan tidak punya
        kekuatan hukum setara e-Meterai. Gunanya validasi internal, memastikan
        selembar kertas benar keluar dari sistem ini dan bukan diketik ulang
        orang lain. Keterangan itu ikut tercetak di dokumennya.
      </p>

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
      {konfirmasi.dialog}
    </form>
  );
}
