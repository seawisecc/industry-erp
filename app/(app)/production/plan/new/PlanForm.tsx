"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Info } from "lucide-react";
import { createPlan } from "../../actions";
import StokKurangAlert from "@/components/StokKurangAlert";
import { gabungKebutuhan, hitungKekurangan, type ItemStok } from "@/lib/stokCek";
import { useConfirmSave } from "@/components/ConfirmSave";

export type ProductOpt = {
  id: string;
  kode: string | null;
  nama_produk: string;
  brand: string | null;
  batch_size_kg: number | null;
  formulas: { item_id: string; percentage: number }[];
};

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}

export default function PlanForm({
  products,
  items,
  ppicHref,
}: {
  products: ProductOpt[];
  items: ItemStok[];
  ppicHref: string | null;
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();

  const [productId, setProductId] = useState("");
  const [noBatch, setNoBatch] = useState("");
  const [jumlahBatch, setJumlahBatch] = useState("1");
  const [tanggal, setTanggal] = useState(new Date().toLocaleDateString("sv-SE"));
  const [catatan, setCatatan] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const product = products.find((p) => p.id === productId) || null;
  const nBatch = parseNum(jumlahBatch);
  const bulkKg = (product?.batch_size_kg || 0) * (nBatch || 0);

  /* ===== Cek ketersediaan bahan, hitung ulang tiap ketikan =====
     Sengaja di badan komponen, bukan useEffect + setState: nilainya
     turunan murni dari produk & jumlah batch yang sedang dipilih. */
  const itemOf = (id: string) => items.find((it) => it.id === id);
  const kekurangan = hitungKekurangan(
    gabungKebutuhan(
      bulkKg > 0
        ? (product?.formulas || []).map((f) => ({
            item_id: f.item_id,
            qty: (f.percentage / 100) * bulkKg,
          }))
        : []
    ),
    itemOf
  );
  /** Kebutuhan bisa dihitung hanya kalau produknya punya formula & ukuran batch. */
  const adaFormula = (product?.formulas.length || 0) > 0;
  const bisaDicek = !!product && adaFormula && bulkKg > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const lanjut = await konfirmasi.minta({
      judul: "Simpan rencana produksi?",
      ringkasan: [
        { label: "Produk", nilai: product?.nama_produk || "-" },
        { label: "No. Batch", nilai: noBatch },
        { label: "Jumlah Batch", nilai: jumlahBatch },
        { label: "Tanggal Rencana", nilai: tanggal },
      ],
      tombol: "Ya, Simpan Plan",
    });
    if (!lanjut) return;

    setLoading(true);
    setError("");
    try {
      const result = await createPlan({
        product_id: productId,
        no_batch: noBatch,
        jumlah_batch: parseNum(jumlahBatch),
        tanggal_rencana: tanggal,
        catatan: catatan || null,
      });
      if (result.ok) {
        router.push("/production");
        router.refresh();
      } else {
        setError(result.error || "Gagal menyimpan plan");
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="glass rounded-2xl p-6 flex flex-col gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Produk yang Diproduksi
          </label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
            className={inputCls}
          >
            <option value="">Pilih produk</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.kode} · {p.nama_produk}
                {p.brand ? ` (${p.brand})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              No. Batch Produksi
            </label>
            <input
              value={noBatch}
              onChange={(e) => setNoBatch(e.target.value)}
              required
              placeholder="Format pabrik sendiri"
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Jumlah Batch
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={jumlahBatch}
              onChange={(e) => setJumlahBatch(e.target.value)}
              required
              className={inputCls}
            />
            {product?.batch_size_kg ? (
              <p className="text-[11.5px] text-muted mt-1">
                = {bulkKg.toLocaleString("id-ID")} kg bulk
              </p>
            ) : null}
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Rencana Tanggal Produksi
            </label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              required
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Catatan <span className="font-normal text-muted/70">(opsional)</span>
          </label>
          <input
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="Instruksi khusus untuk tim produksi"
            className={inputCls}
          />
        </div>
      </div>

      {/* ===== Peringatan stok, muncul sebelum plan disimpan ===== */}
      <StokKurangAlert
        kekurangan={bisaDicek ? kekurangan : []}
        keterangan={`${nBatch.toLocaleString("id-ID")} batch (${bulkKg.toLocaleString(
          "id-ID"
        )} kg ruahan)`}
        ppicHref={ppicHref}
      />

      {bisaDicek && kekurangan.length === 0 && (
        <div className="glass rounded-2xl border-botanical-700/30 px-4 py-3 flex items-start gap-2.5">
          <CheckCircle2 size={16} className="text-botanical-700 mt-0.5 flex-shrink-0" />
          <p className="text-[12.5px] text-ink leading-snug">
            Stok semua bahan formula cukup untuk{" "}
            {nBatch.toLocaleString("id-ID")} batch.{" "}
            <span className="text-muted">
              Kemasan belum ikut dicek di sini, jumlahnya baru diketahui setelah
              rencana pcs per varian diisi di layar Execution.
            </span>
          </p>
        </div>
      )}

      {product && !adaFormula && (
        <div className="glass rounded-2xl px-4 py-3 flex items-start gap-2.5">
          <Info size={16} className="text-muted mt-0.5 flex-shrink-0" />
          <p className="text-[12.5px] text-muted leading-snug">
            Produk ini belum punya formula, jadi kebutuhan bahannya tidak bisa
            dicek. Isi formulanya di menu Products supaya peringatan stok bisa
            muncul sebelum produksi dimulai.
          </p>
        </div>
      )}

      {product && adaFormula && bulkKg <= 0 && (
        <div className="glass rounded-2xl px-4 py-3 flex items-start gap-2.5">
          <Info size={16} className="text-muted mt-0.5 flex-shrink-0" />
          <p className="text-[12.5px] text-muted leading-snug">
            Ukuran batch produk ini belum diisi, jadi kebutuhan bahannya tidak
            bisa dihitung. Isi Batch Size (kg) di menu Products.
          </p>
        </div>
      )}

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Menyimpan..." : "Simpan Plan Produksi"}
      </button>
      {konfirmasi.dialog}
    </form>
  );
}
