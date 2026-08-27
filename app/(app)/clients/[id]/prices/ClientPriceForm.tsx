"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { saveClientPrices } from "../../actions";
import ProductPicker, { type ProductOption } from "@/components/ProductPicker";
import { useConfirmSave } from "@/components/ConfirmSave";

export type HargaOption = ProductOption & {
  product_id: string;
  /** harga di master produk, jadi pembanding */
  harga_master: number | null;
};

type Row = { key: string; harga: string };

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export default function ClientPriceForm({
  clientId,
  options,
  awal,
}: {
  clientId: string;
  /** seluruh kombinasi produk × varian, bukan cuma yang ada stoknya */
  options: HargaOption[];
  awal: { key: string; harga: number }[];
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const [rows, setRows] = useState<Row[]>(() =>
    awal.length > 0
      ? awal.map((a) => ({ key: a.key, harga: String(a.harga) }))
      : [{ key: "", harga: "" }]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sukses, setSukses] = useState("");

  const optOf = (key: string) => options.find((o) => o.key === key);

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setSukses("");
  }

  // Produk yang sama diisi dua kali akan ditolak RPC; ditandai lebih dulu
  // di sini supaya user tahu baris mana yang bentrok.
  const terpakai = rows.map((r) => r.key).filter(Boolean);
  const dobel = new Set(
    terpakai.filter((k, i) => terpakai.indexOf(k) !== i)
  );

  // optOf harus ada: baris yang produknya sudah tidak dikenal dibuang di
  // sini, bukan dibiarkan sampai submit lalu meledak di optOf(...)!
  const isian = rows.filter(
    (r) => r.key && r.harga.trim() !== "" && optOf(r.key)
  );
  const adaNegatif = isian.some((r) => parseNum(r.harga) < 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const lanjut = await konfirmasi.minta({
      judul: "Simpan daftar harga khusus client ini?",
      pesan:
        isian.length === 0
          ? "Daftarnya dikosongkan, client ini kembali memakai harga master."
          : "Daftar lama diganti seluruhnya oleh isi layar ini.",
      ringkasan: [
        { label: "Baris Harga", nilai: isian.length + " produk" },
      ],
    });
    if (!lanjut) return;

    setLoading(true);
    setError("");
    setSukses("");
    try {
      const result = await saveClientPrices(
        clientId,
        isian.map((r) => {
          const o = optOf(r.key)!;
          return {
            product_id: o.product_id,
            varian: o.varian === "-" ? null : o.varian,
            harga: parseNum(r.harga),
          };
        })
      );
      if (result.ok) {
        setSukses(
          isian.length === 0
            ? "Harga khusus dikosongkan, client ini kembali memakai harga master."
            : `${isian.length} harga khusus tersimpan.`
        );
        router.refresh();
      } else {
        setError(result.error || "Gagal menyimpan");
      }
    } catch {
      setError(
        "Gagal menyimpan. Koneksi bermasalah atau aplikasi baru diperbarui, muat ulang halaman lalu coba lagi."
      );
    }
    setLoading(false);
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="relative z-20 glass rounded-2xl p-5 sm:p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Daftar Harga Khusus
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Produk yang tidak terdaftar di sini otomatis memakai harga master.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { key: "", harga: "" }])}
            className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline flex-shrink-0"
          >
            <Plus size={14} /> Tambah Produk
          </button>
        </div>

        {rows.map((row, idx) => {
          const o = optOf(row.key);
          const master = o?.harga_master ?? null;
          const khusus = parseNum(row.harga);
          const selisih =
            master != null && master > 0 && row.harga.trim() !== ""
              ? ((khusus - master) / master) * 100
              : null;
          return (
            <div key={idx} className="flex flex-col gap-1">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px_32px] gap-2 items-start">
                <ProductPicker
                  options={options}
                  value={row.key}
                  onChange={(key) => updateRow(idx, { key })}
                  placeholder="Ketik kode / nama produk..."
                  showStock={false}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Harga khusus"
                  value={row.harga}
                  onChange={(e) => updateRow(idx, { harga: e.target.value })}
                  placeholder="Harga khusus (Rp)"
                  className={`${inputCls} text-right ${
                    dobel.has(row.key) ? "ring-2 ring-clay-500" : ""
                  }`}
                />
                <button
                  type="button"
                  onClick={() => {
                    setRows((rs) =>
                      rs.length > 1 ? rs.filter((_, i) => i !== idx) : [{ key: "", harga: "" }]
                    );
                    setSukses("");
                  }}
                  className="text-muted hover:text-clay-600 p-2 justify-self-end"
                  aria-label="Hapus baris"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {row.key && dobel.has(row.key) && (
                <p className="text-clay-600 text-[12px]">
                  Produk &amp; varian ini sudah diisi di baris lain.
                </p>
              )}
              {o && (
                <p className="text-[11.5px] text-muted">
                  Harga master:{" "}
                  {master != null ? formatRupiah(master) : "belum diisi"}
                  {selisih != null && (
                    <span
                      className={
                        selisih < 0
                          ? " text-clay-600 font-medium"
                          : selisih > 0
                            ? " text-botanical-700 font-medium"
                            : ""
                      }
                    >
                      {" · "}
                      {selisih > 0 ? "+" : ""}
                      {selisih.toLocaleString("id-ID", {
                        maximumFractionDigits: 1,
                      })}
                      % dari master
                    </span>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}
      {sukses && (
        <p className="text-botanical-700 text-[12.5px] font-medium">{sukses}</p>
      )}

      <button
        type="submit"
        disabled={loading || dobel.size > 0 || adaNegatif}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Menyimpan..." : "Simpan Harga Khusus"}
      </button>
      <p className="text-muted text-[12px] text-center -mt-3">
        Menyimpan akan mengganti seluruh daftar harga client ini. Baris yang
        harganya dikosongkan ikut terhapus.
      </p>
      {konfirmasi.dialog}
    </form>
  );
}
