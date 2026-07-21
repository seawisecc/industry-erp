"use client";

/* ============================================================
   Lembar Pengujian QC — bahan masuk.
   Tim QC mengisi jumlah sampel, tanggal sampling & uji, lalu hasil
   tiap parameter (spesifikasi diambil dari master Parameter Uji).
   Keputusan Release/Reject dilakukan dari halaman ini.
   ============================================================ */

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Check, X } from "lucide-react";
import { saveQcSheet, decideQc, type QcHasilRow } from "../actions";

export type SheetInfo = {
  batchId: string;
  itemKode: string;
  itemNama: string;
  satuan: string;
  qty: number;
  noLot: string | null;
  supplier: string | null;
  tanggalTerima: string;
  expDate: string | null;
  jumlahSampel: string | null;
  tanggalSampling: string | null;
  tanggalUji: string | null;
  note: string | null;
  hasilTersimpan: QcHasilRow[];
};

export default function QcSheetForm({
  info,
  parameters,
  boleh,
}: {
  info: SheetInfo;
  parameters: QcHasilRow[]; // dari master (hasil kosong);
  boleh: boolean;
}) {
  const router = useRouter();

  const [jumlahSampel, setJumlahSampel] = useState(info.jumlahSampel || "");
  const [tglSampling, setTglSampling] = useState(info.tanggalSampling || "");
  const [tglUji, setTglUji] = useState(info.tanggalUji || "");
  const [note, setNote] = useState(info.note || "");
  const [rows, setRows] = useState<QcHasilRow[]>(() =>
    parameters.map((p) => {
      const saved = info.hasilTersimpan.find((h) => h.nama === p.nama);
      return { ...p, hasil: saved?.hasil || "" };
    })
  );
  const [loading, setLoading] = useState<null | "draft" | "release" | "reject">(
    null
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const terisi = rows.filter((r) => r.hasil.trim()).length;

  function sheet() {
    return {
      jumlah_sampel: jumlahSampel,
      tanggal_sampling: tglSampling || null,
      tanggal_uji: tglUji || null,
      hasil: rows,
      note,
    };
  }

  async function simpanDraft() {
    if (loading) return;
    setLoading("draft");
    setError("");
    setSaved(false);
    const res = await saveQcSheet(info.batchId, sheet());
    if (res.ok) {
      setSaved(true);
      router.refresh();
    } else setError(res.error || "Gagal menyimpan");
    setLoading(null);
  }

  async function putuskan(status: "Released" | "Rejected") {
    if (loading) return;
    const label = status === "Released" ? "RELEASE" : "REJECT";
    if (
      !confirm(
        status === "Released"
          ? `Release batch ini? Stok masuk ke gudang siap pakai (FEFO).`
          : `Reject batch ini? Stok hangus dan tercatat di audit log. Tindakan tidak bisa dibatalkan.`
      )
    )
      return;
    setLoading(status === "Released" ? "release" : "reject");
    setError("");
    const res = await decideQc(info.batchId, status, sheet());
    if (res.ok) {
      router.push("/qc-incoming");
      router.refresh();
    } else {
      setError(res.error || `Gagal ${label}`);
      setLoading(null);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";
  const labelCls = "block text-[12.5px] font-medium text-muted mb-1.5";

  // Kelompokkan parameter per grup
  const grup = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const g = r.grup || "Lainnya";
    grup.set(g, [...(grup.get(g) || []), i]);
  });

  return (
    <div className="flex flex-col gap-4">
      {/* ===== Informasi barang ===== */}
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-[15px] font-semibold text-ink mb-3">
          Informasi Barang
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Bahan
            </div>
            <div className="font-medium">{info.itemNama}</div>
            <div className="text-[11.5px] text-muted font-mono">{info.itemKode}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              No. Batch / Lot
            </div>
            <div className="font-mono">{info.noLot || "—"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Jumlah Diterima
            </div>
            <div className="font-medium">
              {info.qty.toLocaleString("id-ID")} {info.satuan}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Supplier
            </div>
            <div className="truncate" title={info.supplier || undefined}>
              {info.supplier || "—"}
            </div>
          </div>
        </div>
      </div>

      {/* ===== Data pengambilan sampel ===== */}
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-[15px] font-semibold text-ink mb-3">
          Data Pengujian
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className={labelCls}>Tanggal Penerimaan</label>
            <input
              type="date"
              value={info.tanggalTerima}
              disabled
              className={`${inputCls} opacity-60`}
            />
          </div>
          <div>
            <label className={labelCls}>Jumlah Sampel</label>
            <input
              value={jumlahSampel}
              onChange={(e) => {
                setJumlahSampel(e.target.value);
                setSaved(false);
              }}
              placeholder={`mis. 100 ${info.satuan}`}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Tanggal Ambil Sampel</label>
            <input
              type="date"
              value={tglSampling}
              onChange={(e) => {
                setTglSampling(e.target.value);
                setSaved(false);
              }}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Tanggal Uji</label>
            <input
              type="date"
              value={tglUji}
              onChange={(e) => {
                setTglUji(e.target.value);
                setSaved(false);
              }}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* ===== Tabel parameter uji ===== */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 pt-5 pb-3 flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display text-[15px] font-semibold text-ink">
            Hasil Pengujian
          </h3>
          <div className="text-right">
            <span className="text-[12px] text-muted block">
              {terisi}/{rows.length} parameter terisi
            </span>
            <span className="text-[11px] text-muted/80">
              Spesifikasi tersimpan ke master bahan — pengujian berikutnya terisi
              otomatis
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="px-6 pb-5 text-muted text-[13px]">
            Belum ada parameter aktif. Atur dulu di Settings → Parameter Uji QC.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead>
                <tr className="text-left text-muted text-[11px] uppercase tracking-wide border-y border-line bg-white/40">
                  <th className="px-4 py-2 font-semibold">Parameter</th>
                  <th className="px-4 py-2 font-semibold w-[230px]">Spesifikasi</th>
                  <th className="px-4 py-2 font-semibold w-[230px]">Hasil Uji</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(grup.entries()).map(([namaGrup, idxs]) => (
                  <Fragment key={namaGrup}>
                    <tr className="bg-botanical-100/40">
                      <td
                        colSpan={3}
                        className="px-4 py-1.5 text-[11px] uppercase tracking-wide font-semibold text-botanical-700"
                      >
                        {namaGrup}
                      </td>
                    </tr>
                    {idxs.map((i) => (
                      <tr key={rows[i].nama} className="border-b border-line last:border-0">
                        <td className="px-4 py-2.5">
                          {rows[i].nama}
                          {rows[i].satuan && (
                            <span className="text-muted text-[11.5px]">
                              {" "}
                              ({rows[i].satuan})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            value={rows[i].spesifikasi || ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSaved(false);
                              setRows((rs) =>
                                rs.map((r, j) =>
                                  j === i ? { ...r, spesifikasi: v } : r
                                )
                              );
                            }}
                            placeholder="Spesifikasi bahan ini"
                            className="w-full glass-input rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-botanical-700"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            value={rows[i].hasil}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSaved(false);
                              setRows((rs) =>
                                rs.map((r, j) => (j === i ? { ...r, hasil: v } : r))
                              );
                            }}
                            placeholder="Hasil"
                            className="w-full glass-input rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-botanical-700"
                          />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== Catatan & keputusan ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div>
          <label className={labelCls}>
            Catatan QC{" "}
            <span className="font-normal text-muted/70">
              (wajib diisi bila Reject)
            </span>
          </label>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
            rows={2}
            placeholder="mis. COA sesuai, organoleptik OK / warna menyimpang dari standar"
            className={inputCls}
          />
        </div>

        {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}
        {saved && (
          <p className="text-botanical-700 text-[12.5px] font-medium">
            ✓ Lembar pengujian tersimpan (belum diputuskan)
          </p>
        )}

        {boleh ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={simpanDraft}
            disabled={loading !== null}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-white/70 border border-line text-[13px] font-medium hover:bg-white transition-colors disabled:opacity-60"
          >
            {loading === "draft" ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-botanical-700/30 border-t-botanical-700 rounded-full animate-spin" />
            ) : (
              <Save size={15} />
            )}
            Simpan Draft
          </button>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => putuskan("Rejected")}
            disabled={loading !== null || !note.trim()}
            title={!note.trim() ? "Isi catatan QC dulu sebagai alasan reject" : ""}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-white border border-line text-clay-600 text-[13px] font-medium hover:bg-clay-100 transition-colors disabled:opacity-50"
          >
            {loading === "reject" ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-clay-600/30 border-t-clay-600 rounded-full animate-spin" />
            ) : (
              <X size={15} />
            )}
            Reject
          </button>
          <button
            type="button"
            onClick={() => putuskan("Released")}
            disabled={loading !== null}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-botanical-700 text-white text-[13px] font-medium hover:bg-botanical-800 transition-colors shadow-sm disabled:opacity-60"
          >
            {loading === "release" ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Check size={15} />
            )}
            Release ke Stok
          </button>
        </div>
        ) : (
          <p className="text-muted text-[12.5px] bg-white/50 rounded-lg px-3 py-2.5">
            Mode lihat saja — hanya petugas dengan izin QC yang bisa menyimpan
            dan memutuskan hasil uji. Minta Admin mengaktifkan izin ini di menu
            Users.
          </p>
        )}
      </div>
    </div>
  );
}
