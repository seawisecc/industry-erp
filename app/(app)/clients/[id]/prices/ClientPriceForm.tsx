"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { saveClientPrices } from "../../actions";
import ProductPicker, { type ProductOption } from "@/components/ProductPicker";
import { useConfirmSave } from "@/components/ConfirmSave";
import { enterKeFieldBerikutnya } from "@/lib/keyboard";
import NumberInput from "@/components/NumberInput";

export type HargaOption = ProductOption & {
  product_id: string;
  /** harga di master produk, jadi pembanding */
  harga_master: number | null;
};

/**
 * Satu baris kesepakatan. Harga dan diskon dua-duanya boleh kosong
 * sendiri-sendiri: outlet konsinyasi biasanya cuma punya diskon, sementara
 * reseller yang harganya sudah dikunci cuma punya harga.
 */
type Row = { key: string; harga: string; diskon: string };

const BARIS_KOSONG: Row = { key: "", harga: "", diskon: "" };

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
function formatPersen(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 }) + "%";
}

export default function ClientPriceForm({
  clientId,
  options,
  awal,
}: {
  clientId: string;
  /** seluruh kombinasi produk × varian, bukan cuma yang ada stoknya */
  options: HargaOption[];
  awal: { key: string; harga: number | null; diskon: number | null }[];
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const [rows, setRows] = useState<Row[]>(() =>
    awal.length > 0
      ? awal.map((a) => ({
          key: a.key,
          harga: a.harga == null ? "" : String(a.harga),
          diskon: a.diskon == null ? "" : String(a.diskon),
        }))
      : [{ ...BARIS_KOSONG }]
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

  const terisi = (r: Row) => r.harga.trim() !== "" || r.diskon.trim() !== "";

  // optOf harus ada: baris yang produknya sudah tidak dikenal dibuang di
  // sini, bukan dibiarkan sampai submit lalu meledak di optOf(...)!
  const isian = rows.filter((r) => r.key && terisi(r) && optOf(r.key));
  const adaNegatif = isian.some(
    (r) => r.harga.trim() !== "" && parseNum(r.harga) < 0
  );
  const adaDiskonJanggal = isian.some(
    (r) =>
      r.diskon.trim() !== "" &&
      (parseNum(r.diskon) < 0 || parseNum(r.diskon) > 100)
  );

  /** Harga dasar baris ini: harga khusus kalau diisi, kalau tidak harga master. */
  function hargaDasar(row: Row): number | null {
    if (row.harga.trim() !== "") return parseNum(row.harga);
    return optOf(row.key)?.harga_master ?? null;
  }

  /** Harga yang benar-benar ditagihkan sesudah diskon. */
  function hargaAkhir(row: Row): number | null {
    const dasar = hargaDasar(row);
    if (dasar == null) return null;
    if (row.diskon.trim() === "") return dasar;
    return dasar - (dasar * parseNum(row.diskon)) / 100;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const berdiskon = isian.filter((r) => r.diskon.trim() !== "").length;
    const lanjut = await konfirmasi.minta({
      judul: "Simpan harga & diskon khusus client ini?",
      pesan:
        isian.length === 0
          ? "Daftarnya dikosongkan, client ini kembali memakai harga master penuh."
          : "Daftar lama diganti seluruhnya oleh isi layar ini.",
      ringkasan: [
        { label: "Baris Kesepakatan", nilai: isian.length + " produk" },
        { label: "Pakai Diskon", nilai: berdiskon + " produk" },
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
            harga: r.harga.trim() === "" ? null : parseNum(r.harga),
            diskon_persen: r.diskon.trim() === "" ? null : parseNum(r.diskon),
          };
        })
      );
      if (result.ok) {
        setSukses(
          isian.length === 0
            ? "Daftar dikosongkan, client ini kembali memakai harga master penuh."
            : `${isian.length} baris tersimpan.`
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
    <form onSubmit={handleSubmit} onKeyDown={enterKeFieldBerikutnya} className="flex flex-col gap-5">
      <div className="relative z-20 glass rounded-2xl p-5 sm:p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Daftar Harga &amp; Diskon
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Isi salah satu atau dua-duanya. Produk yang tidak terdaftar di
              sini memakai harga master penuh.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { ...BARIS_KOSONG }])}
            className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline flex-shrink-0"
          >
            <Plus size={14} /> Tambah Produk
          </button>
        </div>

        {rows.map((row, idx) => {
          const o = optOf(row.key);
          const master = o?.harga_master ?? null;
          const dasar = hargaDasar(row);
          const akhir = hargaAkhir(row);
          const adaDiskon = row.diskon.trim() !== "" && parseNum(row.diskon) > 0;
          const diskonJanggal =
            row.diskon.trim() !== "" &&
            (parseNum(row.diskon) < 0 || parseNum(row.diskon) > 100);
          return (
            <div key={idx} className="flex flex-col gap-1">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px_120px_32px] gap-2 items-start">
                <ProductPicker
                  options={options}
                  value={row.key}
                  onChange={(key) => updateRow(idx, { key })}
                  placeholder="Ketik kode / nama produk..."
                  showStock={false}
                />
                <NumberInput
                  aria-label="Harga khusus"
                  value={row.harga}
                  onChange={(nilai) => updateRow(idx, { harga: nilai })}
                  placeholder="Harga khusus (Rp)"
                  className={`${inputCls} text-right ${
                    dobel.has(row.key) ? "ring-2 ring-clay-500" : ""
                  }`}
                />
                <div className="relative">
                  <NumberInput
                    aria-label="Diskon persen"
                    value={row.diskon}
                    onChange={(nilai) => updateRow(idx, { diskon: nilai })}
                    placeholder="Diskon"
                    className={`${inputCls} text-right pr-7 ${
                      diskonJanggal ? "ring-2 ring-clay-500" : ""
                    }`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[12.5px] pointer-events-none">
                    %
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRows((rs) =>
                      rs.length > 1
                        ? rs.filter((_, i) => i !== idx)
                        : [{ ...BARIS_KOSONG }]
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
              {diskonJanggal && (
                <p className="text-clay-600 text-[12px]">
                  Diskon harus antara 0 dan 100 persen.
                </p>
              )}
              {o && (
                <p className="text-[11.5px] text-muted">
                  Harga master:{" "}
                  {master != null ? formatRupiah(master) : "belum diisi"}
                  {dasar != null && row.harga.trim() !== "" && (
                    <>
                      {" · dasar "}
                      {formatRupiah(dasar)}
                    </>
                  )}
                  {adaDiskon && akhir != null && (
                    <span className="text-botanical-700 font-medium">
                      {" · setelah diskon "}
                      {formatPersen(parseNum(row.diskon))}
                      {" jadi "}
                      {formatRupiah(akhir)}
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
        disabled={loading || dobel.size > 0 || adaNegatif || adaDiskonJanggal}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Menyimpan..." : "Simpan Harga & Diskon"}
      </button>
      <p className="text-muted text-[12px] text-center -mt-3">
        Menyimpan akan mengganti seluruh daftar client ini. Baris yang harga
        dan diskonnya dikosongkan ikut terhapus.
      </p>
      {konfirmasi.dialog}
    </form>
  );
}
