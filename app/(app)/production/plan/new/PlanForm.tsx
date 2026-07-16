"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPlan } from "../../actions";

export type ProductOpt = {
  id: string;
  kode: string | null;
  nama_produk: string;
  brand: string | null;
  batch_size_kg: number | null;
};

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}

export default function PlanForm({ products }: { products: ProductOpt[] }) {
  const router = useRouter();

  const [productId, setProductId] = useState("");
  const [noBatch, setNoBatch] = useState("");
  const [jumlahBatch, setJumlahBatch] = useState("1");
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [catatan, setCatatan] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const product = products.find((p) => p.id === productId) || null;
  const bulkKg = (product?.batch_size_kg || 0) * (parseNum(jumlahBatch) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
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
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 flex flex-col gap-4">
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
          <option value="">— Pilih produk —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.kode} — {p.nama_produk}
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
    </form>
  );
}
