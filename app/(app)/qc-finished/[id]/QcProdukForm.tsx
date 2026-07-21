"use client";

/* ============================================================
   Lembar Uji Produk Jadi — dikerjakan tim QC.
   Hasil uji dikirim ke QA sebagai dasar pelulusan batch.
   ============================================================ */

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save, Check, FileText, Printer } from "lucide-react";
import { saveQcProduk, type QcProdukHasil } from "../actions";

export type QcProdukInfo = {
  batchId: string;
  productId: string | null;
  noBatch: string;
  produkNama: string;
  produkKode: string | null;
  brand: string | null;
  tanggalProduksi: string;
  outputs: { varian: string | null; qty: number; satuan: string }[];
  jumlahSampel: string | null;
  tanggalUji: string | null;
  note: string | null;
  selesai: boolean;
  hasilTersimpan: QcProdukHasil[];
};

export default function QcProdukForm({
  info,
  parameters,
  boleh,
}: {
  info: QcProdukInfo;
  parameters: QcProdukHasil[];
  boleh: boolean;
}) {
  const router = useRouter();

  const [jumlahSampel, setJumlahSampel] = useState(info.jumlahSampel || "");
  const [tglUji, setTglUji] = useState(info.tanggalUji || "");
  const [note, setNote] = useState(info.note || "");
  const [rows, setRows] = useState<QcProdukHasil[]>(() =>
    parameters.map((p) => {
      const saved = info.hasilTersimpan.find((h) => h.nama === p.nama);
      return { ...p, hasil: saved?.hasil || "" };
    })
  );
  const [loading, setLoading] = useState<null | "draft" | "selesai">(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const terisi = rows.filter((r) => r.hasil.trim()).length;

  function sheet() {
    return {
      jumlah_sampel: jumlahSampel,
      tanggal_uji: tglUji || null,
      hasil: rows,
      note,
    };
  }

  async function simpan(selesai: boolean) {
    if (loading) return;
    if (
      selesai &&
      !confirm(
        "Tandai pengujian produk jadi SELESAI? Hasil akan dikirim ke QA untuk pelulusan."
      )
    )
      return;
    setLoading(selesai ? "selesai" : "draft");
    setError("");
    setSaved(false);
    const res = await saveQcProduk(info.batchId, info.productId, {
      ...sheet(),
      selesai,
    });
    if (res.ok) {
      if (selesai) {
        router.push("/qc-finished");
        router.refresh();
        return;
      }
      setSaved(true);
      router.refresh();
    } else setError(res.error || "Gagal menyimpan");
    setLoading(null);
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";
  const labelCls = "block text-[12.5px] font-medium text-muted mb-1.5";

  const grup = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const g = r.grup || "Lainnya";
    grup.set(g, [...(grup.get(g) || []), i]);
  });

  return (
    <div className="flex flex-col gap-4">
      {/* ===== Informasi batch ===== */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-display text-[15px] font-semibold text-ink">
            Informasi Batch
          </h3>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/print/production/${info.batchId}`}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/70 border border-line text-[12px] font-medium hover:bg-white transition-colors whitespace-nowrap"
            >
              <FileText size={13} /> Batch Record
            </Link>
            <Link
              href={`/print/qc-produk/${info.batchId}`}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/70 border border-line text-[12px] font-medium hover:bg-white transition-colors whitespace-nowrap"
            >
              <Printer size={13} /> Cetak Lembar Uji
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Produk
            </div>
            <div className="font-medium">{info.produkNama}</div>
            <div className="text-[11.5px] text-muted font-mono">
              {[info.produkKode, info.brand].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              No. Batch
            </div>
            <div className="font-mono font-medium">{info.noBatch}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Tanggal Produksi
            </div>
            <div>
              {new Date(info.tanggalProduksi + "T00:00:00").toLocaleDateString(
                "id-ID",
                { day: "numeric", month: "long", year: "numeric" }
              )}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Hasil Produksi
            </div>
            {info.outputs.map((o, i) => (
              <div key={i} className="font-medium">
                {o.varian ? `${o.varian}: ` : ""}
                {o.qty.toLocaleString("id-ID")} {o.satuan}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Data pengujian ===== */}
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-[15px] font-semibold text-ink mb-3">
          Data Pengujian Produk Jadi
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Jumlah Sampel</label>
            <input
              value={jumlahSampel}
              onChange={(e) => {
                setJumlahSampel(e.target.value);
                setSaved(false);
              }}
              placeholder="mis. 3 pcs"
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

      {/* ===== Hasil uji ===== */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 pt-5 pb-3 flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display text-[15px] font-semibold text-ink">
            Hasil Pengujian Produk Jadi
          </h3>
          <div className="text-right">
            <span className="text-[12px] text-muted block">
              {terisi}/{rows.length} parameter terisi
            </span>
            <span className="text-[11px] text-muted/80">
              Spesifikasi tersimpan ke master produk — batch berikutnya terisi
              otomatis
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="px-6 pb-5 text-muted text-[13px]">
            Belum ada parameter produk jadi. Atur dulu di Settings → Parameter Uji
            QC (tab Produk Jadi).
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
                            placeholder="Spesifikasi produk ini"
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

      {/* ===== Keputusan ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div>
          <label className={labelCls}>
            Catatan QC{" "}
            <span className="font-normal text-muted/70">
              (opsional)
            </span>
          </label>
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
            rows={2}
            placeholder="mis. seluruh parameter memenuhi spesifikasi"
            className={inputCls}
          />
        </div>

        {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}
        {saved && (
          <p className="text-botanical-700 text-[12.5px] font-medium">
            ✓ Hasil uji tersimpan (draft)
          </p>
        )}

        {boleh ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => simpan(false)}
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
            onClick={() => simpan(true)}
            disabled={loading !== null || terisi === 0}
            title={terisi === 0 ? "Isi hasil uji minimal satu parameter" : ""}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-botanical-700 text-white text-[13px] font-medium hover:bg-botanical-800 transition-colors shadow-sm disabled:opacity-60"
          >
            {loading === "selesai" ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Check size={15} />
            )}
            Selesai — Kirim ke QA
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
