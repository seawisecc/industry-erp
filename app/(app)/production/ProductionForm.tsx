"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Trash2 } from "lucide-react";
import { createProduction } from "./actions";

export type ProductOption = {
  id: string;
  kode: string | null;
  nama_produk: string;
  brand: string | null;
  batch_size_kg: number | null;
  formulas: { item_id: string; percentage: number }[];
  variants: {
    id: string;
    nama_varian: string;
    netto: number | null;
    satuan_netto: string | null;
    packaging: { item_id: string; qty_per_pcs: number }[];
  }[];
};

export type ItemOption = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  stok: number;
};

type Row = {
  item: ItemOption | null;
  query: string;
  open: boolean;
  qty: string;
  source: "formula" | "kemasan" | "adjust";
};

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}

function toStr(n: number) {
  return String(Math.round(n * 10000) / 10000).replace(".", ",");
}

function formatId(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export default function ProductionForm({
  products,
  items,
}: {
  products: ProductOption[];
  items: ItemOption[];
}) {
  const router = useRouter();

  const [productId, setProductId] = useState("");
  const [noBatch, setNoBatch] = useState("");
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [jumlahBatch, setJumlahBatch] = useState("1");
  const [variantQty, setVariantQty] = useState<Record<string, string>>({});
  const [bahanRows, setBahanRows] = useState<Row[]>([]);
  const [kemasanRows, setKemasanRows] = useState<Row[]>([]);
  const [adjustRows, setAdjustRows] = useState<Row[]>([]);
  const [catatan, setCatatan] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedProduct = products.find((p) => p.id === productId) || null;
  const bulkKg =
    (selectedProduct?.batch_size_kg || 0) * (parseNum(jumlahBatch) || 0);

  const allRows = [...bahanRows, ...kemasanRows, ...adjustRows];
  const usedIds = allRows.map((r) => r.item?.id).filter(Boolean);

  function buildBahanRows(product: ProductOption, mult: number): Row[] {
    const kg = (product.batch_size_kg || 0) * mult;
    return product.formulas
      .map((f) => {
        const item = items.find((it) => it.id === f.item_id);
        if (!item) return null;
        return {
          item,
          query: "",
          open: false,
          qty: kg > 0 ? toStr((f.percentage / 100) * kg) : "",
          source: "formula",
        } as Row;
      })
      .filter((r): r is Row => r !== null);
  }

  function buildKemasanRows(
    product: ProductOption,
    vQty: Record<string, string>
  ): Row[] {
    const acc = new Map<string, number>();
    for (const v of product.variants) {
      const pcs = parseNum(vQty[v.id] || "");
      if (pcs <= 0) continue;
      for (const p of v.packaging) {
        acc.set(p.item_id, (acc.get(p.item_id) || 0) + p.qty_per_pcs * pcs);
      }
    }
    return Array.from(acc, ([itemId, qty]) => {
      const item = items.find((it) => it.id === itemId);
      if (!item) return null;
      return { item, query: "", open: false, qty: toStr(qty), source: "kemasan" } as Row;
    }).filter((r): r is Row => r !== null);
  }

  function handleProductChange(nextId: string) {
    setProductId(nextId);
    setError("");
    setVariantQty({});
    setKemasanRows([]);
    setAdjustRows([]);
    const product = products.find((p) => p.id === nextId);
    setBahanRows(product ? buildBahanRows(product, parseNum(jumlahBatch) || 1) : []);
  }

  function handleJumlahBatchChange(next: string) {
    setJumlahBatch(next);
    if (!selectedProduct) return;
    const mult = parseNum(next);
    if (mult > 0) setBahanRows(buildBahanRows(selectedProduct, mult));
  }

  function handleVariantQtyChange(variantId: string, qty: string) {
    const nextVQty = { ...variantQty, [variantId]: qty };
    setVariantQty(nextVQty);
    if (selectedProduct) setKemasanRows(buildKemasanRows(selectedProduct, nextVQty));
  }

  function updateIn(
    setter: React.Dispatch<React.SetStateAction<Row[]>>,
    idx: number,
    patch: Partial<Row>
  ) {
    setter((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function adjustOptions(row: Row) {
    if (!row.open || !row.query) return [];
    const q = row.query.toLowerCase();
    return items
      .filter((it) => !usedIds.includes(it.id) || it.id === row.item?.id)
      .filter(
        (it) => it.nama.toLowerCase().includes(q) || it.kode.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }

  // Total isi varian (kg) vs bulk — indikator kasar keseimbangan
  const totalIsiKg = selectedProduct
    ? selectedProduct.variants.reduce((s, v) => {
        const pcs = parseNum(variantQty[v.id] || "");
        if (pcs <= 0 || !v.netto) return s;
        return s + (Number(v.netto) * pcs) / 1000;
      }, 0)
    : 0;

  const adaStokKurang = allRows.some((r) => r.item && parseNum(r.qty) > r.item.stok);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await createProduction({
        no_batch: noBatch,
        tanggal,
        catatan: catatan || null,
        product_id: productId,
        outputs: (selectedProduct?.variants || [])
          .filter((v) => parseNum(variantQty[v.id] || "") > 0)
          .map((v) => ({
            varian_ukuran: v.nama_varian,
            qty_hasil: parseNum(variantQty[v.id]),
            satuan: "pcs",
          })),
        components: allRows
          .filter((r) => r.item)
          .map((r) => ({ item_id: r.item!.id, qty: parseNum(r.qty) })),
      });
      router.push("/production");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan produksi");
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  function renderRow(
    row: Row,
    idx: number,
    setter: React.Dispatch<React.SetStateAction<Row[]>>,
    removable: boolean
  ) {
    const qty = parseNum(row.qty);
    const kurang = row.item && qty > row.item.stok;
    const options = row.source === "adjust" ? adjustOptions(row) : [];
    return (
      <div key={`${row.source}-${idx}`} className="flex flex-col gap-1">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_32px] gap-2 items-start">
          <div className="relative">
            {row.item ? (
              <div className="flex items-center gap-2 glass-input rounded-lg px-3 py-2.5 text-sm">
                <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                  {row.item.kode}
                </span>
                <span className="truncate flex-1">{row.item.nama}</span>
                <span
                  className={`text-[11px] flex-shrink-0 ${
                    kurang ? "text-clay-600 font-medium" : "text-muted"
                  }`}
                >
                  stok {formatId(row.item.stok)} {row.item.satuan}
                </span>
                {row.source === "adjust" && (
                  <span className="text-[10px] bg-amber-100 text-amber-500 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    adjusting
                  </span>
                )}
                {row.source === "adjust" && (
                  <button
                    type="button"
                    onClick={() => updateIn(setter, idx, { item: null, query: "" })}
                    className="text-muted hover:text-clay-600 flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ) : (
              <>
                <input
                  value={row.query}
                  onChange={(e) => updateIn(setter, idx, { query: e.target.value, open: true })}
                  onFocus={() => updateIn(setter, idx, { open: true })}
                  onBlur={() => setTimeout(() => updateIn(setter, idx, { open: false }), 150)}
                  placeholder="Ketik kode / nama bahan..."
                  className={inputCls}
                />
                {options.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 glass rounded-lg overflow-hidden z-20 max-h-52 overflow-y-auto">
                    {options.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          updateIn(setter, idx, { item: it, query: "", open: false });
                        }}
                        className="w-full text-left px-3 py-2 text-[13px] hover:bg-white/60 flex gap-2 items-baseline"
                      >
                        <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                          {it.kode}
                        </span>
                        <span className="truncate flex-1">{it.nama}</span>
                        <span className="text-[10.5px] text-muted flex-shrink-0">
                          stok {formatId(it.stok)} {it.satuan}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <input
            type="text"
            inputMode="decimal"
            value={row.qty}
            onChange={(e) => updateIn(setter, idx, { qty: e.target.value })}
            placeholder={row.item ? `Qty (${row.item.satuan})` : "Qty"}
            className={`w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${
              kurang ? "ring-2 ring-clay-500" : "focus:ring-botanical-700"
            }`}
          />

          {removable ? (
            <button
              type="button"
              onClick={() => setter((rs) => rs.filter((_, i) => i !== idx))}
              className="text-muted hover:text-clay-600 p-2"
            >
              <Trash2 size={15} />
            </button>
          ) : (
            <div />
          )}
        </div>
        {kurang && (
          <p className="text-clay-600 text-[12px]">
            Stok tidak cukup — tersedia {formatId(row.item!.stok)} {row.item!.satuan}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* ============ HEADER PRODUKSI ============ */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Produk yang Diproduksi
            </label>
            <select
              value={productId}
              onChange={(e) => handleProductChange(e.target.value)}
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12.5px] font-medium text-muted mb-1.5">
                Jumlah Batch
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={jumlahBatch}
                onChange={(e) => handleJumlahBatchChange(e.target.value)}
                placeholder="1"
                className={inputCls}
              />
              {selectedProduct?.batch_size_kg ? (
                <p className="text-[11.5px] text-muted mt-1">
                  = {formatId(bulkKg)} kg bulk (1 batch ={" "}
                  {formatId(Number(selectedProduct.batch_size_kg))} kg)
                </p>
              ) : selectedProduct ? (
                <p className="text-[11.5px] text-clay-600 mt-1">
                  Ukuran batch (kg) belum diisi di menu Produk
                </p>
              ) : null}
            </div>
            <div>
              <label className="block text-[12.5px] font-medium text-muted mb-1.5">
                Tanggal Produksi
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              Catatan <span className="font-normal text-muted/70">(opsional)</span>
            </label>
            <input
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Misal: adjusting viskositas, dsb."
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* ============ VARIAN YANG DIPRODUKSI ============ */}
      {selectedProduct && (
        <div className="glass rounded-2xl p-6 flex flex-col gap-3">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Ukuran yang Diproduksi
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Isi jumlah pcs per ukuran — kemasan otomatis dihitung dari sini.
              Kosongkan yang tidak diproduksi.
            </p>
          </div>

          {selectedProduct.variants.length === 0 ? (
            <p className="text-clay-600 text-[13px]">
              Produk ini belum punya varian/gramasi — isi dulu di menu Produk.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {selectedProduct.variants.map((v) => (
                <div key={v.id}>
                  <label className="block text-[11.5px] text-muted mb-1">
                    {v.nama_varian}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={variantQty[v.id] || ""}
                    onChange={(e) => handleVariantQtyChange(v.id, e.target.value)}
                    placeholder="0 pcs"
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
          )}

          {totalIsiKg > 0 && bulkKg > 0 && (
            <p
              className={`text-[12.5px] ${
                totalIsiKg > bulkKg ? "text-clay-600" : "text-muted"
              }`}
            >
              Total isi varian ≈ {formatId(totalIsiKg)} kg dari {formatId(bulkKg)} kg
              bulk{totalIsiKg > bulkKg ? " — melebihi bulk yang diproduksi!" : ""}
            </p>
          )}
        </div>
      )}

      {/* ============ BAHAN BAKU (dari formula) ============ */}
      {selectedProduct && (
        <div className="glass rounded-2xl p-6 flex flex-col gap-3">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Bahan Baku (dari formula %)
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Qty = persentase × {formatId(bulkKg)} kg bulk. Bisa diubah manual —
              tapi terhitung ulang kalau jumlah batch diganti.
            </p>
          </div>
          {bahanRows.length === 0 ? (
            <p className="text-clay-600 text-[13px]">
              Produk ini belum punya formulasi — isi dulu di menu Produk.
            </p>
          ) : (
            bahanRows.map((row, idx) => renderRow(row, idx, setBahanRows, false))
          )}
        </div>
      )}

      {/* ============ KEMASAN (dari varian) ============ */}
      {selectedProduct && kemasanRows.length > 0 && (
        <div className="glass rounded-2xl p-6 flex flex-col gap-3">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Kemasan (dari varian terpilih)
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Dihitung dari kemasan per pcs × jumlah pcs tiap varian.
            </p>
          </div>
          {kemasanRows.map((row, idx) => renderRow(row, idx, setKemasanRows, false))}
        </div>
      )}

      {/* ============ ADJUSTING ============ */}
      {selectedProduct && (
        <div className="glass rounded-2xl p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-[15.5px] font-semibold text-ink">
                Bahan Tambahan (Adjusting)
              </h2>
              <p className="text-muted text-[12.5px] mt-0.5">
                Untuk penambahan di luar formula saat produksi berjalan.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setAdjustRows((rs) => [
                  ...rs,
                  { item: null, query: "", open: false, qty: "", source: "adjust" },
                ])
              }
              className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline flex-shrink-0"
            >
              <Plus size={14} /> Tambah Bahan
            </button>
          </div>
          {adjustRows.length === 0 && (
            <p className="text-muted text-[12.5px]">Tidak ada — opsional.</p>
          )}
          {adjustRows.map((row, idx) => renderRow(row, idx, setAdjustRows, true))}
        </div>
      )}

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading || !productId || adaStokKurang}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60"
      >
        {loading ? "Memproses & memotong stok..." : "Simpan Produksi"}
      </button>
    </form>
  );
}
