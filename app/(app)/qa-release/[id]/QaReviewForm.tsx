"use client";

/* ============================================================
   Lembar Pelulusan QA — tinjauan menyeluruh sebelum batch dijual.
   QA tidak menguji; QA memverifikasi bukti: hasil uji bahan baku &
   kemas, IPC, uji produk jadi oleh QC, batch record, lalu checklist
   kesesuaian dokumen. Release baru terbuka setelah semua tercentang.
   ============================================================ */

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  X,
  FileText,
  Printer,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { decideQaReview, type QaChecklistItem } from "../actions";

export type UjiRow = {
  nama: string;
  satuan: string | null;
  spesifikasi: string | null;
  grup: string | null;
  hasil: string;
};

export type BahanUji = {
  kode: string;
  nama: string;
  lot: string | null;
  kategori: string;
  status: string;
  tanggal: string | null;
  oleh: string | null;
  batchId: string;
  hasil: UjiRow[];
};

export type QaReviewInfo = {
  batchId: string;
  noBatch: string;
  produkNama: string;
  produkKode: string | null;
  brand: string | null;
  tanggalProduksi: string;
  outputs: { varian: string | null; qty: number; satuan: string }[];
  bahan: BahanUji[];
  ipc: UjiRow[];
  produkJadi: UjiRow[];
  produkJadiSelesai: boolean;
  produkJadiOleh: string | null;
  produkJadiTanggal: string | null;
  checklistTersimpan: QaChecklistItem[];
  note: string | null;
};

const CHECKLIST_DEF = [
  {
    key: "uji_bahan",
    label: "Seluruh bahan baku & kemas telah lulus uji QC",
  },
  { key: "ipc", label: "Hasil IPC sesuai spesifikasi" },
  { key: "uji_produk", label: "Hasil uji produk jadi memenuhi spesifikasi" },
  { key: "batch_record", label: "Batch record lengkap & sesuai prosedur" },
  { key: "izin_edar", label: "Dokumen izin edar / notifikasi tersedia & berlaku" },
  { key: "label", label: "Kesesuaian label & artwork produk" },
  { key: "no_batch", label: "Penulisan nomor batch pada kemasan sesuai" },
  { key: "exp", label: "Penulisan tanggal kadaluarsa sesuai" },
];

function formatTanggal(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Tabel hasil uji ringkas (parameter · spesifikasi · hasil)
function TabelUji({ rows }: { rows: UjiRow[] }) {
  if (rows.length === 0)
    return <p className="text-muted text-[12.5px] px-4 pb-3">Tidak ada data.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[12.5px]">
        <thead>
          <tr className="text-left text-muted text-[11px] uppercase tracking-wide border-y border-line bg-white/40">
            <th className="px-4 py-1.5 font-semibold">Parameter</th>
            <th className="px-4 py-1.5 font-semibold">Spesifikasi</th>
            <th className="px-4 py-1.5 font-semibold">Hasil</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              <td className="px-4 py-1.5">
                {r.nama}
                {r.satuan && (
                  <span className="text-muted text-[11px]"> ({r.satuan})</span>
                )}
              </td>
              <td className="px-4 py-1.5 text-muted">{r.spesifikasi || "—"}</td>
              <td className="px-4 py-1.5 font-medium">{r.hasil || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function QaReviewForm({ info,
  boleh,
}: { info: QaReviewInfo;
  boleh: boolean;
}) {
  const router = useRouter();

  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const c of CHECKLIST_DEF) {
      init[c.key] =
        info.checklistTersimpan.find((x) => x.key === c.key)?.ok === true;
    }
    return init;
  });
  const [note, setNote] = useState(info.note || "");
  const [openBahan, setOpenBahan] = useState<string | null>(null);
  const [loading, setLoading] = useState<null | "release" | "reject">(null);
  const [error, setError] = useState("");

  const semuaTercentang = CHECKLIST_DEF.every((c) => checks[c.key]);
  const jumlahCentang = CHECKLIST_DEF.filter((c) => checks[c.key]).length;

  async function putuskan(status: "Released" | "Rejected") {
    if (loading) return;
    if (
      !confirm(
        status === "Released"
          ? "Luluskan batch ini? Produk jadi masuk stok dan bisa dijual."
          : "Tolak batch ini? Produk tidak akan pernah masuk stok jual."
      )
    )
      return;
    setLoading(status === "Released" ? "release" : "reject");
    setError("");
    const checklist: QaChecklistItem[] = CHECKLIST_DEF.map((c) => ({
      key: c.key,
      label: c.label,
      ok: !!checks[c.key],
    }));
    const res = await decideQaReview(info.batchId, status, checklist, note);
    if (res.ok) {
      router.push("/qa-release");
      router.refresh();
    } else {
      setError(res.error || "Gagal memutuskan");
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ===== Informasi batch ===== */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-display text-[15px] font-semibold text-ink">
            Informasi Batch
          </h3>
          <Link
            href={`/print/production/${info.batchId}`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/70 border border-line text-[12px] font-medium hover:bg-white transition-colors whitespace-nowrap"
          >
            <FileText size={13} /> Batch Record
          </Link>
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
            <div>{formatTanggal(info.tanggalProduksi)}</div>
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

      {/* ===== 1. Riwayat uji bahan baku & kemas ===== */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <h3 className="font-display text-[15px] font-semibold text-ink">
            1. Uji Bahan Baku &amp; Bahan Kemas
          </h3>
          <p className="text-muted text-[12px] mt-0.5">
            Lot yang terpakai di batch ini — klik untuk melihat hasil ujinya.
          </p>
        </div>
        {info.bahan.length === 0 ? (
          <p className="px-6 pb-5 text-muted text-[13px]">
            Tidak ada data uji bahan (QC Module mungkin baru diaktifkan setelah
            bahan ini diterima).
          </p>
        ) : (
          <div className="px-4 pb-4 flex flex-col gap-1.5">
            {info.bahan.map((b) => {
              const open = openBahan === b.batchId;
              const lulus = b.status === "Released";
              return (
                <div key={b.batchId} className="border border-line rounded-xl">
                  <button
                    type="button"
                    onClick={() => setOpenBahan(open ? null : b.batchId)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                  >
                    {open ? (
                      <ChevronDown size={15} className="text-muted flex-shrink-0" />
                    ) : (
                      <ChevronRight size={15} className="text-muted flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">
                        {b.nama}
                      </div>
                      <div className="text-[11px] text-muted font-mono">
                        {b.kode}
                        {b.lot ? ` · lot ${b.lot}` : ""} · {b.kategori}
                      </div>
                    </div>
                    <span className="text-[11.5px] text-muted whitespace-nowrap hidden sm:block">
                      {formatTanggal(b.tanggal)}
                      {b.oleh ? ` · ${b.oleh}` : ""}
                    </span>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                        lulus
                          ? "bg-botanical-100 text-botanical-700"
                          : b.status === "Rejected"
                            ? "bg-clay-100 text-clay-600"
                            : "bg-amber-100 text-amber-500"
                      }`}
                    >
                      {b.status}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-line pt-1 pb-2">
                      <TabelUji rows={b.hasil} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== 2. IPC ===== */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <h3 className="font-display text-[15px] font-semibold text-ink">
            2. Hasil IPC (Produk Ruahan)
          </h3>
        </div>
        <TabelUji rows={info.ipc} />
        <div className="h-3" />
      </div>

      {/* ===== 3. Uji produk jadi ===== */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-ink">
              3. Uji Produk Jadi
            </h3>
            <p className="text-muted text-[12px] mt-0.5">
              Dikerjakan tim QC
              {info.produkJadiOleh ? ` — ${info.produkJadiOleh}` : ""}
              {info.produkJadiTanggal
                ? ` · ${formatTanggal(info.produkJadiTanggal)}`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                info.produkJadiSelesai
                  ? "bg-botanical-100 text-botanical-700"
                  : "bg-amber-100 text-amber-500"
              }`}
            >
              {info.produkJadiSelesai ? "Selesai diuji" : "Belum diuji QC"}
            </span>
            <Link
              href={`/print/qc-produk/${info.batchId}`}
              className="inline-flex items-center gap-1 text-botanical-700 text-[12px] font-medium hover:underline"
            >
              <Printer size={12} /> Cetak
            </Link>
          </div>
        </div>
        <TabelUji rows={info.produkJadi} />
        <div className="h-3" />
      </div>

      {/* ===== 4. Checklist pelulusan ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display text-[15px] font-semibold text-ink">
            4. Checklist Pelulusan
          </h3>
          <span
            className={`text-[12px] font-medium ${
              semuaTercentang ? "text-botanical-700" : "text-muted"
            }`}
          >
            {jumlahCentang}/{CHECKLIST_DEF.length} terverifikasi
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          {CHECKLIST_DEF.map((c) => (
            <label
              key={c.key}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                checks[c.key]
                  ? "border-botanical-700/30 bg-botanical-100/30"
                  : "border-line hover:bg-white/50"
              }`}
            >
              <input
                type="checkbox"
                checked={checks[c.key] || false}
                onChange={(e) =>
                  setChecks((s) => ({ ...s, [c.key]: e.target.checked }))
                }
                className="accent-[#2f4f3e] w-4 h-4"
              />
              <span className="text-[13px]">{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ===== Keputusan ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Catatan QA{" "}
            <span className="font-normal text-muted/70">
              (wajib diisi bila Reject)
            </span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="mis. seluruh dokumen lengkap, batch memenuhi persyaratan pelulusan"
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>

        {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}
        {!semuaTercentang && (
          <p className="text-amber-500 text-[12px] bg-amber-100 rounded-lg px-3 py-2">
            Seluruh poin checklist harus diverifikasi sebelum batch bisa
            diluluskan.
          </p>
        )}

        {boleh ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => putuskan("Rejected")}
            disabled={loading !== null || !note.trim()}
            title={!note.trim() ? "Isi catatan QA dulu sebagai alasan reject" : ""}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-white border border-line text-clay-600 text-[13px] font-medium hover:bg-clay-100 transition-colors disabled:opacity-50"
          >
            {loading === "reject" ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-clay-600/30 border-t-clay-600 rounded-full animate-spin" />
            ) : (
              <X size={15} />
            )}
            Reject
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => putuskan("Released")}
            disabled={loading !== null || !semuaTercentang}
            title={
              !semuaTercentang ? "Centang seluruh poin checklist dulu" : ""
            }
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-botanical-700 text-white text-[13px] font-medium hover:bg-botanical-800 transition-colors shadow-sm disabled:opacity-50"
          >
            {loading === "release" ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Check size={15} />
            )}
            Luluskan ke Stok Jual
          </button>
        </div>
        ) : (
          <p className="text-muted text-[12.5px] bg-white/50 rounded-lg px-3 py-2.5">
            Mode lihat saja — hanya petugas dengan izin QA yang bisa meluluskan
            atau menolak batch. Minta Admin mengaktifkan izin ini di menu Users.
          </p>
        )}
      </div>
    </div>
  );
}
