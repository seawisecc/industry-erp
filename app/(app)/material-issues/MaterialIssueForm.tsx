"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { createMaterialIssue } from "./actions";
import { TUJUAN_PEMAKAIAN } from "@/lib/materialIssue";
import { useConfirmSave } from "@/components/ConfirmSave";
import { enterKeFieldBerikutnya, klasSorot, tombolCombo } from "@/lib/keyboard";
import NumberInput from "@/components/NumberInput";

export type IssueItem = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  stok: number;
  /** harga pembelian terakhir, untuk perkiraan biaya di layar */
  lastHarga: number | null;
};

type Row = { item: IssueItem | null; query: string; open: boolean; qty: string };

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function formatId(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

const BARIS_KOSONG: Row = { item: null, query: "", open: false, qty: "" };

export default function MaterialIssueForm({
  items,
  hariIni,
}: {
  items: IssueItem[];
  /** Tanggal kalender zona operasional, dihitung di server (lib/dates.ts) */
  hariIni: string;
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const [tanggal, setTanggal] = useState(hariIni);
  const [tujuan, setTujuan] = useState<string>(TUJUAN_PEMAKAIAN[0]);
  const [catatan, setCatatan] = useState("");
  const [rows, setRows] = useState<Row[]>([{ ...BARIS_KOSONG }]);
  const [sorot, setSorot] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function options(row: Row) {
    if (!row.open || !row.query) return [];
    const q = row.query.toLowerCase();
    const dipakai = rows.map((r) => r.item?.id).filter(Boolean);
    return items
      .filter((it) => !dipakai.includes(it.id) || it.id === row.item?.id)
      .filter(
        (it) => it.nama.toLowerCase().includes(q) || it.kode.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }

  // Perkiraan saja: biaya sebenarnya dihitung ulang dari lot yang
  // benar-benar terpotong FEFO di dalam RPC.
  const perkiraanBiaya = rows.reduce((s, r) => {
    if (!r.item || r.item.lastHarga == null) return s;
    return s + parseNum(r.qty) * r.item.lastHarga;
  }, 0);

  const adaLebihStok = rows.some(
    (r) => r.item && parseNum(r.qty) > r.item.stok + 0.000001
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const dipakai = rows.filter((r) => r.item && parseNum(r.qty) > 0);
    const lanjut = await konfirmasi.minta({
      judul: "Simpan pemakaian bahan ini?",
      pesan: "Stok bahan langsung dipotong FEFO begitu disimpan.",
      ringkasan: [
        { label: "Tanggal", nilai: tanggal },
        { label: "Tujuan", nilai: tujuan },
        { label: "Bahan", nilai: dipakai.length + " item" },
      ],
      tombol: "Ya, Catat Pemakaian",
      nada: "bahaya",
    });
    if (!lanjut) return;

    setLoading(true);
    setError("");
    try {
      const result = await createMaterialIssue({
        tanggal,
        tujuan,
        catatan: catatan.trim() || null,
        items: rows
          .filter((r) => r.item && parseNum(r.qty) > 0)
          .map((r) => ({ item_id: r.item!.id, qty: parseNum(r.qty) })),
      });
      if (result.ok) {
        router.push("/material-issues");
        router.refresh();
      } else {
        setError(result.error || "Gagal menyimpan");
        setLoading(false);
      }
    } catch {
      setError(
        "Gagal menyimpan. Koneksi bermasalah atau aplikasi baru diperbarui, muat ulang halaman lalu coba lagi."
      );
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";
  const labelCls = "block text-[12.5px] font-medium text-muted mb-1.5";

  return (
    <form onSubmit={handleSubmit} onKeyDown={enterKeFieldBerikutnya} className="flex flex-col gap-5">
      <div className="glass rounded-2xl p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Tanggal Pemakaian</label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Tujuan Pemakaian</label>
          <select
            value={tujuan}
            onChange={(e) => setTujuan(e.target.value)}
            className={inputCls}
          >
            {TUJUAN_PEMAKAIAN.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>
            Catatan <span className="font-normal text-muted/70">(opsional)</span>
          </label>
          <input
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="Dipakai siapa, untuk apa"
            className={inputCls}
          />
        </div>
      </div>

      {/* ===== Bahan yang dipakai ===== */}
      <div className="relative z-20 glass rounded-2xl p-5 sm:p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Bahan yang Dipakai
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Stok dipotong FEFO, batch paling cepat kedaluwarsa lebih dulu.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { ...BARIS_KOSONG }])}
            className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline flex-shrink-0"
          >
            <Plus size={14} /> Tambah Bahan
          </button>
        </div>

        {rows.map((row, idx) => {
          const saran = options(row);
          const lebih = row.item && parseNum(row.qty) > row.item.stok + 0.000001;
          return (
            <div key={idx} className="flex flex-col gap-1">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_32px] gap-2 items-start">
                <div className="relative">
                  {row.item ? (
                    <div className="flex items-center gap-2 glass-input rounded-lg px-3 py-2.5 text-sm">
                      <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                        {row.item.kode}
                      </span>
                      <span className="truncate flex-1">{row.item.nama}</span>
                      <span className="text-[11px] text-muted flex-shrink-0">
                        stok {formatId(row.item.stok)} {row.item.satuan}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateRow(idx, { item: null, query: "" })}
                        className="text-muted hover:text-clay-600 flex-shrink-0"
                        aria-label="Ganti bahan"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        value={row.query}
                        onChange={(e) => {
                          updateRow(idx, { query: e.target.value, open: true });
                          setSorot(0);
                        }}
                        onFocus={() => {
                          updateRow(idx, { open: true });
                          setSorot(0);
                        }}
                        onBlur={() =>
                          setTimeout(() => updateRow(idx, { open: false }), 150)
                        }
                        onKeyDown={(e) =>
                          tombolCombo(e, {
                            jumlah: saran.length,
                            sorot,
                            setSorot,
                            buka: !!row.open,
                            setBuka: (b) => updateRow(idx, { open: b }),
                            pilih: (i) =>
                              updateRow(idx, {
                                item: saran[i],
                                query: "",
                                open: false,
                              }),
                          })
                        }
                        placeholder="Ketik kode / nama bahan..."
                        role="combobox"
                        aria-expanded={!!row.open}
                        aria-controls={`daftar-bahan-${idx}`}
                        className={inputCls}
                      />
                      {saran.length > 0 && (
                        <div
                          role="listbox"
                          id={`daftar-bahan-${idx}`}
                          className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg overflow-hidden z-50 max-h-52 overflow-y-auto"
                        >
                          {saran.map((it, i) => (
                            <button
                              key={it.id}
                              type="button"
                              role="option"
                              aria-selected={i === sorot}
                              tabIndex={-1}
                              data-sorot={row.open && i === sorot ? "true" : undefined}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                updateRow(idx, {
                                  item: it,
                                  query: "",
                                  open: false,
                                });
                              }}
                              onMouseEnter={() => setSorot(i)}
                              className={`w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 ${klasSorot(
                                i === sorot
                              )}`}
                            >
                              <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                                {it.kode}
                              </span>
                              <span className="truncate flex-1">{it.nama}</span>
                              <span
                                className={`text-[11px] flex-shrink-0 ${
                                  it.stok > 0 ? "text-muted" : "text-clay-600"
                                }`}
                              >
                                {formatId(it.stok)} {it.satuan}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <NumberInput
                  value={row.qty}
                  onChange={(nilai) => updateRow(idx, { qty: nilai })}
                  placeholder={row.item ? `Qty (${row.item.satuan})` : "Qty"}
                  className={`${inputCls} ${lebih ? "ring-2 ring-clay-500" : ""}`}
                />
                <button
                  type="button"
                  onClick={() =>
                    setRows((rs) =>
                      rs.length > 1
                        ? rs.filter((_, i) => i !== idx)
                        : [{ ...BARIS_KOSONG }]
                    )
                  }
                  className="text-muted hover:text-clay-600 p-2 justify-self-end"
                  aria-label="Hapus baris"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {lebih && (
                <p className="text-clay-600 text-[12px]">
                  Melebihi stok tersedia ({formatId(row.item!.stok)}{" "}
                  {row.item!.satuan})
                </p>
              )}
            </div>
          );
        })}

        <div className="flex justify-between border-t border-line pt-3 mt-1 text-[13px]">
          <span className="text-muted">
            Perkiraan biaya{" "}
            <span className="text-[11.5px]">(harga beli terakhir)</span>
          </span>
          <span className="font-semibold">{formatRupiah(perkiraanBiaya)}</span>
        </div>
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading || adaLebihStok}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Menyimpan..." : "Simpan Pemakaian Bahan"}
      </button>
      <p className="text-muted text-[12px] text-center -mt-3">
        Biaya final dihitung dari harga lot yang benar-benar terpotong, bisa
        berbeda dari perkiraan di atas.
      </p>
      {konfirmasi.dialog}
    </form>
  );
}
