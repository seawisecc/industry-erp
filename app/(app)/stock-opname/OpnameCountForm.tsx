"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, CheckCircle2 } from "lucide-react";
import { saveOpnameCount, finishStockOpname } from "./actions";
import DataTable from "@/components/DataTable";

export type OpnameRow = {
  item_id: string;
  kode: string;
  nama: string;
  satuan: string;
  kategori: string;
  /** potret stok saat opname dibuka */
  qty_sistem: number;
  /** stok sistem SEKARANG, untuk mendeteksi mutasi selama penghitungan */
  stok_kini: number;
  qty_fisik: number | null;
  catatan: string | null;
};

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function toStr(n: number | null) {
  return n == null ? "" : String(n).replace(".", ",");
}
function formatId(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
}

export default function OpnameCountForm({
  opnameId,
  rows: awal,
  hariIni,
}: {
  opnameId: string;
  rows: OpnameRow[];
  /** Tanggal kalender zona operasional, dihitung di server (lib/dates.ts) */
  hariIni: string;
}) {
  const router = useRouter();
  const [fisik, setFisik] = useState<Record<string, string>>(() =>
    Object.fromEntries(awal.map((r) => [r.item_id, toStr(r.qty_fisik)]))
  );
  const [catatan, setCatatan] = useState<Record<string, string>>(() =>
    Object.fromEntries(awal.map((r) => [r.item_id, r.catatan || ""]))
  );
  const [tanggalTutup, setTanggalTutup] = useState(hariIni);
  const [loading, setLoading] = useState(false);
  const [menutup, setMenutup] = useState(false);
  const [error, setError] = useState("");
  const [sukses, setSukses] = useState("");

  const terisi = (id: string) => (fisik[id] ?? "").trim() !== "";
  const jumlahTerisi = awal.filter((r) => terisi(r.item_id)).length;

  /** Selisih terhadap POTRET saat opname dibuka — ini temuan opnamenya. */
  const selisihOf = (r: OpnameRow) =>
    terisi(r.item_id) ? parseNum(fisik[r.item_id]) - r.qty_sistem : 0;

  /** Selisih terhadap stok SEKARANG — ini yang benar-benar akan disesuaikan. */
  const koreksiOf = (r: OpnameRow) =>
    terisi(r.item_id) ? parseNum(fisik[r.item_id]) - r.stok_kini : 0;

  const adaTemuan = awal.filter(
    (r) => terisi(r.item_id) && Math.abs(selisihOf(r)) > 0.000001
  );
  const akanDisesuaikan = awal.filter(
    (r) => terisi(r.item_id) && Math.abs(koreksiOf(r)) > 0.000001
  );
  // Item yang stoknya bergerak setelah opname dibuka: hasil hitung fisiknya
  // akan menimpa mutasi itu, jadi perlu diperiksa manual.
  const bergerak = awal.filter(
    (r) => Math.abs(r.stok_kini - r.qty_sistem) > 0.000001
  );

  function payload() {
    return awal.map((r) => ({
      item_id: r.item_id,
      qty_fisik: terisi(r.item_id) ? parseNum(fisik[r.item_id]) : null,
      catatan: (catatan[r.item_id] || "").trim() || null,
    }));
  }

  async function simpanProgres() {
    if (loading) return;
    setLoading(true);
    setError("");
    setSukses("");
    try {
      const res = await saveOpnameCount(opnameId, payload());
      if (res.ok) {
        setSukses(`Progres tersimpan, ${jumlahTerisi} dari ${awal.length} item terhitung.`);
        router.refresh();
      } else {
        setError(res.error || "Gagal menyimpan");
      }
    } catch {
      setError(
        "Gagal menyimpan. Koneksi bermasalah atau aplikasi baru diperbarui, muat ulang halaman lalu coba lagi."
      );
    }
    setLoading(false);
  }

  async function tutupOpname() {
    if (loading) return;
    setLoading(true);
    setError("");
    setSukses("");
    try {
      // Simpan dulu, baru tutup: yang belum tersimpan tidak akan ikut
      // diperhitungkan oleh RPC penutupan.
      const simpan = await saveOpnameCount(opnameId, payload());
      if (!simpan.ok) {
        setError(simpan.error || "Gagal menyimpan hasil hitung");
        setLoading(false);
        return;
      }
      const res = await finishStockOpname(opnameId, tanggalTutup);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error || "Gagal menutup opname");
        setLoading(false);
      }
    } catch {
      setError(
        "Gagal menutup opname. Koneksi bermasalah atau aplikasi baru diperbarui, muat ulang halaman lalu coba lagi."
      );
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <div className="flex flex-col gap-5">
      {bergerak.length > 0 && (
        <div className="glass rounded-2xl px-5 py-4 border-amber-500/40 text-[12.5px] leading-relaxed">
          <b>{bergerak.length} item stoknya bergerak</b> setelah opname dibuka
          (ada penerimaan, produksi, atau penjualan di sela penghitungan).
          Untuk item itu, hasil hitung fisik akan menimpa angka terbaru —
          pastikan hitungannya diambil sesudah mutasi tersebut. Kolom{" "}
          <b>Stok Kini</b> menandainya.
        </div>
      )}

      <div className="glass rounded-2xl p-5 sm:p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Hasil Hitung Fisik
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              {jumlahTerisi} dari {awal.length} item terhitung ·{" "}
              {adaTemuan.length} selisih terhadap potret awal
            </p>
          </div>
          <button
            type="button"
            onClick={simpanProgres}
            disabled={loading}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-line text-ink text-[12.5px] font-medium hover:bg-white/60 transition-colors disabled:opacity-60"
          >
            <Save size={14} /> Simpan Progres
          </button>
        </div>

        <DataTable
          rows={awal}
          rowKey={(r) => r.item_id}
          minWidth={900}
          chrome="bare"
          expandable={false}
          empty="Tidak ada item dalam cakupan opname ini."
          rowClassName={(r) =>
            terisi(r.item_id) && Math.abs(selisihOf(r)) > 0.000001
              ? "bg-clay-100/25"
              : ""
          }
          columns={[
            {
              key: "item",
              header: "Item",
              role: "title",
              cell: (r) => (
                <>
                  <div className="font-medium">{r.nama}</div>
                  <div className="text-[11px] text-muted font-mono">
                    {r.kode} · {r.kategori}
                  </div>
                </>
              ),
              cardCell: (r) => (
                <>
                  <div>{r.nama}</div>
                  <div className="text-[11px] text-muted font-mono font-normal">
                    {r.kode} · {r.kategori}
                  </div>
                </>
              ),
            },
            {
              key: "sistem",
              header: "Stok Sistem",
              cardLabel: "Stok sistem saat opname dibuka",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) => `${formatId(r.qty_sistem)} ${r.satuan}`,
            },
            {
              key: "kini",
              header: "Stok Kini",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) => {
                const beda = Math.abs(r.stok_kini - r.qty_sistem) > 0.000001;
                return (
                  <span className={beda ? "text-amber-500 font-medium" : "text-muted"}>
                    {formatId(r.stok_kini)}
                    {beda ? " ⚠" : ""}
                  </span>
                );
              },
            },
            {
              key: "fisik",
              header: "Hitung Fisik",
              role: "primary",
              headClassName: "w-[130px]",
              cell: (r) => (
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`Hitung fisik ${r.nama}`}
                  value={fisik[r.item_id] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFisik((s) => ({ ...s, [r.item_id]: v }));
                    setSukses("");
                  }}
                  placeholder="-"
                  className={`${inputCls} text-right`}
                />
              ),
            },
            {
              key: "selisih",
              header: "Selisih",
              role: "primary",
              align: "right",
              cell: (r) => {
                if (!terisi(r.item_id))
                  return <span className="text-muted">-</span>;
                const d = selisihOf(r);
                if (Math.abs(d) < 0.000001)
                  return <span className="text-muted">cocok</span>;
                return (
                  <span
                    className={`font-mono text-[12px] font-medium whitespace-nowrap ${
                      d > 0 ? "text-botanical-700" : "text-clay-600"
                    }`}
                  >
                    {d > 0 ? "+" : ""}
                    {formatId(d)}
                  </span>
                );
              },
            },
            {
              key: "catatan",
              header: "Catatan",
              role: "secondary",
              headClassName: "w-[180px]",
              cell: (r) => (
                <input
                  type="text"
                  aria-label={`Catatan ${r.nama}`}
                  value={catatan[r.item_id] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCatatan((s) => ({ ...s, [r.item_id]: v }));
                    setSukses("");
                  }}
                  placeholder="mis. rusak, tumpah"
                  className={inputCls}
                />
              ),
            },
          ]}
        />
      </div>

      {/* ===== Penutupan ===== */}
      <div className="glass rounded-2xl p-5 sm:p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Tutup Opname &amp; Buat Adjustment
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {akanDisesuaikan.length === 0
              ? "Tidak ada item yang perlu disesuaikan, opname akan ditutup tanpa membuat adjustment."
              : `${akanDisesuaikan.length} item akan disesuaikan stoknya. Stok naik dicatat sebagai batch baru, stok turun dipotong FEFO.`}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Tanggal Penyesuaian
            </label>
            <input
              type="date"
              value={tanggalTutup}
              onChange={(e) => setTanggalTutup(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            {!menutup ? (
              <button
                type="button"
                onClick={() => setMenutup(true)}
                disabled={loading || jumlahTerisi === 0}
                className="w-full inline-flex items-center justify-center gap-2 bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-colors disabled:opacity-60"
              >
                <CheckCircle2 size={16} />
                {jumlahTerisi === 0
                  ? "Isi hasil hitung dulu"
                  : "Tutup Opname & Buat Adjustment"}
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[12.5px] text-ink/75 leading-relaxed">
                  Sesudah ditutup, hasil hitung tidak bisa diubah lagi dan
                  stok langsung menyesuaikan. Item yang belum dihitung
                  dibiarkan apa adanya.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={tutupOpname}
                    disabled={loading}
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-colors disabled:opacity-60"
                  >
                    {loading && (
                      <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    )}
                    {loading ? "Memproses..." : "Ya, Tutup Opname"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMenutup(false)}
                    disabled={loading}
                    className="px-4 py-2.5 rounded-lg border border-line text-[13px] font-medium text-muted hover:bg-white/60 transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}
        {sukses && (
          <p className="text-botanical-700 text-[12.5px] font-medium">{sukses}</p>
        )}
      </div>
    </div>
  );
}
