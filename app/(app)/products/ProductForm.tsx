"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Trash2 } from "lucide-react";
import { createProduct, updateProduct } from "./actions";

export type ItemOption = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  kategori: "Bahan Baku" | "Kemasan";
};

type FormulaRow = {
  item: ItemOption | null;
  query: string;
  open: boolean;
  pct: string;
  fase: string;
};
type StepRow = { instruksi: string; suhu: string; rpm: string; durasi: string };
type PackRow = { item: ItemOption | null; query: string; open: boolean; qty: string };
type VariantDraft = { netto: string; satuan: string; harga: string; packaging: PackRow[] };

type Props = {
  items: ItemOption[];
  product?: {
    id: string;
    kode: string | null;
    nama_produk: string;
    brand: string | null;
    kategori: string | null;
    batch_size_kg: number | null;
    aktif: boolean;
    formulas: { item_id: string; percentage: number; fase: string | null }[];
    steps: {
      instruksi: string;
      suhu: string | null;
      rpm: string | null;
      durasi: string | null;
    }[];
    variants: {
      nama_varian: string;
      netto: number | null;
      satuan_netto: string | null;
      harga_jual: number | null;
      packaging: { item_id: string; qty_per_pcs: number }[];
    }[];
  };
};

const KATEGORI_SARAN = ["Skincare", "Bodycare", "Haircare", "Lipcare", "Parfum"];

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}

function toStr(n: number | null | undefined) {
  return n == null ? "" : String(n).replace(".", ",");
}

function emptyPackRow(): PackRow {
  return { item: null, query: "", open: false, qty: "1" };
}

function emptyVariant(): VariantDraft {
  return { netto: "", satuan: "g", harga: "", packaging: [emptyPackRow()] };
}

export default function ProductForm({ items, product }: Props) {
  const router = useRouter();
  const isEdit = !!product;

  const bahanBaku = items.filter((it) => it.kategori === "Bahan Baku");
  const kemasan = items.filter((it) => it.kategori === "Kemasan");

  const [kode, setKode] = useState(product?.kode || "");
  const [nama, setNama] = useState(product?.nama_produk || "");
  const [brand, setBrand] = useState(product?.brand || "");
  const [kategori, setKategori] = useState(product?.kategori || "");
  const [batchKg, setBatchKg] = useState(toStr(product?.batch_size_kg));
  const [aktif, setAktif] = useState(product?.aktif ?? true);

  const [fRows, setFRows] = useState<FormulaRow[]>(() => {
    if (!product || product.formulas.length === 0)
      return [{ item: null, query: "", open: false, pct: "", fase: "" }];
    return product.formulas.map((f) => ({
      item: items.find((it) => it.id === f.item_id) || null,
      query: "",
      open: false,
      pct: toStr(f.percentage),
      fase: f.fase || "",
    }));
  });

  const [steps, setSteps] = useState<StepRow[]>(() => {
    if (!product || product.steps.length === 0) return [];
    return product.steps.map((s) => ({
      instruksi: s.instruksi,
      suhu: s.suhu || "",
      rpm: s.rpm || "",
      durasi: s.durasi || "",
    }));
  });

  const [variants, setVariants] = useState<VariantDraft[]>(() => {
    if (!product || product.variants.length === 0) return [];
    return product.variants.map((v) => ({
      netto: toStr(v.netto),
      satuan: v.satuan_netto || "g",
      harga: v.harga_jual == null ? "" : String(v.harga_jual),
      packaging:
        v.packaging.length > 0
          ? v.packaging.map((p) => ({
              item: items.find((it) => it.id === p.item_id) || null,
              query: "",
              open: false,
              qty: toStr(p.qty_per_pcs),
            }))
          : [emptyPackRow()],
    }));
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ---------- Formulasi ----------
  const usedFormulaIds = fRows.map((r) => r.item?.id).filter(Boolean);
  const totalPct = fRows.reduce((s, r) => s + (r.item ? parseNum(r.pct) : 0), 0);

  function updateFRow(idx: number, patch: Partial<FormulaRow>) {
    setFRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function formulaOptions(row: FormulaRow) {
    if (!row.open) return [];
    const q = row.query.toLowerCase();
    return bahanBaku
      .filter((it) => !usedFormulaIds.includes(it.id) || it.id === row.item?.id)
      .filter(
        (it) =>
          !q ||
          it.nama.toLowerCase().includes(q) ||
          it.kode.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }

  // ---------- Varian ----------
  function updateVariant(vIdx: number, patch: Partial<VariantDraft>) {
    setVariants((vs) => vs.map((v, i) => (i === vIdx ? { ...v, ...patch } : v)));
  }

  function updatePackRow(vIdx: number, pIdx: number, patch: Partial<PackRow>) {
    setVariants((vs) =>
      vs.map((v, i) =>
        i === vIdx
          ? {
              ...v,
              packaging: v.packaging.map((p, j) =>
                j === pIdx ? { ...p, ...patch } : p
              ),
            }
          : v
      )
    );
  }

  function packOptions(v: VariantDraft, row: PackRow) {
    if (!row.open) return [];
    const q = row.query.toLowerCase();
    const used = v.packaging.map((p) => p.item?.id).filter(Boolean);
    return kemasan
      .filter((it) => !used.includes(it.id) || it.id === row.item?.id)
      .filter(
        (it) =>
          !q ||
          it.nama.toLowerCase().includes(q) ||
          it.kode.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const payload = {
        kode: kode.trim() || null,
        nama_produk: nama,
        brand: brand || null,
        kategori: kategori || null,
        batch_size_kg: batchKg ? parseNum(batchKg) : null,
        aktif,
        formulas: fRows
          .filter((r) => r.item)
          .map((r) => ({
            item_id: r.item!.id,
            percentage: parseNum(r.pct),
            fase: r.fase.trim() || null,
          })),
        steps: steps
          .filter((s) => s.instruksi.trim())
          .map((s) => ({
            instruksi: s.instruksi.trim(),
            suhu: s.suhu.trim() || null,
            rpm: s.rpm.trim() || null,
            durasi: s.durasi.trim() || null,
          })),
        variants: variants.map((v) => ({
          nama_varian: `${v.netto.replace(".", ",")} ${v.satuan}`.trim(),
          netto: parseNum(v.netto),
          satuan_netto: v.satuan,
          harga_jual: v.harga ? parseNum(v.harga) : null,
          packaging: v.packaging
            .filter((p) => p.item)
            .map((p) => ({ item_id: p.item!.id, qty_per_pcs: parseNum(p.qty) })),
        })),
      };
      if (isEdit && product) {
        await updateProduct(product.id, payload);
      } else {
        await createProduct(payload);
      }
      router.push("/products");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan produk");
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* ============ INFO PRODUK ============ */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-[190px_1fr_1fr] gap-4">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Kode Produk{" "}
              {!isEdit && (
                <span className="font-normal text-muted/70">(opsional)</span>
              )}
            </label>
            <input
              value={kode}
              onChange={(e) => setKode(e.target.value)}
              required={isEdit}
              placeholder="PRD-0001 / format sendiri"
              className={`${inputCls} font-mono text-[13px]`}
            />
            {!isEdit && (
              <p className="text-[11px] text-muted mt-1">
                Kosongkan = otomatis PRD-XXXX
              </p>
            )}
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Nama Produk
            </label>
            <input
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              required
              placeholder="Misal: Brightening Serum"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Brand <span className="font-normal text-muted/70">(opsional)</span>
            </label>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Brand milik klien / sendiri"
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Kategori <span className="font-normal text-muted/70">(opsional)</span>
            </label>
            <input
              value={kategori}
              onChange={(e) => setKategori(e.target.value)}
              list="kategori-saran"
              placeholder="Skincare / Bodycare / ..."
              className={inputCls}
            />
            <datalist id="kategori-saran">
              {KATEGORI_SARAN.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Ukuran 1 Batch (kg bulk)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={batchKg}
              onChange={(e) => setBatchKg(e.target.value)}
              placeholder="Misal: 100"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Status
            </label>
            <select
              value={aktif ? "1" : "0"}
              onChange={(e) => setAktif(e.target.value === "1")}
              className={inputCls}
            >
              <option value="1">Aktif</option>
              <option value="0">Nonaktif</option>
            </select>
          </div>
        </div>
      </div>

      {/* ============ FORMULASI (%) ============ */}
      <div className="relative z-30 glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Formulasi Bahan Baku (%)
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Persentase terhadap total bulk. Saat produksi: qty = % × kg bulk.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span
              className={`text-[12.5px] font-medium px-2 py-0.5 rounded-full ${
                Math.abs(totalPct - 100) < 0.01
                  ? "bg-botanical-100 text-botanical-700"
                  : "bg-amber-100 text-amber-500"
              }`}
            >
              Total {totalPct.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%
            </span>
            <button
              type="button"
              onClick={() =>
                setFRows((rs) => [...rs, { item: null, query: "", open: false, pct: "", fase: "" }])
              }
              className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline"
            >
              <Plus size={14} /> Tambah
            </button>
          </div>
        </div>

        {fRows.map((row, idx) => {
          const options = formulaOptions(row);
          return (
            <div
              key={idx}
              className="grid grid-cols-1 sm:grid-cols-[1fr_70px_110px_32px] gap-2 items-start"
            >
              <div className="relative">
                {row.item ? (
                  <div className="flex items-center gap-2 glass-input rounded-lg px-3 py-2.5 text-sm">
                    <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                      {row.item.kode}
                    </span>
                    <span className="truncate flex-1">{row.item.nama}</span>
                    <button
                      type="button"
                      onClick={() => updateFRow(idx, { item: null, query: "" })}
                      className="text-muted hover:text-clay-600 flex-shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={row.query}
                      onChange={(e) => updateFRow(idx, { query: e.target.value, open: true })}
                      onFocus={() => updateFRow(idx, { open: true })}
                      onBlur={() => setTimeout(() => updateFRow(idx, { open: false }), 150)}
                      placeholder="Ketik kode / nama bahan baku..."
                      className={inputCls}
                    />
                    {options.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg overflow-hidden z-20 max-h-52 overflow-y-auto">
                        {options.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              updateFRow(idx, { item: it, query: "", open: false });
                            }}
                            className="w-full text-left px-3 py-2 text-[13px] hover:bg-white/60 flex gap-2"
                          >
                            <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                              {it.kode}
                            </span>
                            <span className="truncate">{it.nama}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <input
                type="text"
                value={row.fase}
                onChange={(e) => updateFRow(idx, { fase: e.target.value })}
                placeholder="Fase"
                title="Fase (A/B/C — opsional)"
                className={`${inputCls} text-center`}
              />

              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.pct}
                  onChange={(e) => updateFRow(idx, { pct: e.target.value })}
                  placeholder="0"
                  className={`${inputCls} pr-7`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[12.5px]">
                  %
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setFRows((rs) =>
                    rs.length > 1
                      ? rs.filter((_, i) => i !== idx)
                      : [{ item: null, query: "", open: false, pct: "", fase: "" }]
                  )
                }
                className="text-muted hover:text-clay-600 p-2"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {/* ============ CARA PEMBUATAN ============ */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Cara Pembuatan
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Langkah proses berurutan — tampil di Batch Record. Parameter suhu,
              kecepatan, dan waktu opsional.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setSteps((ss) => [...ss, { instruksi: "", suhu: "", rpm: "", durasi: "" }])
            }
            className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline flex-shrink-0"
          >
            <Plus size={14} /> Tambah Langkah
          </button>
        </div>

        {steps.length === 0 && (
          <p className="text-muted text-[13px]">
            Belum ada langkah. Contoh: &quot;Panaskan Fase A hingga 70–75°C&quot;,
            &quot;Homogenkan 3000 rpm selama 15 menit&quot;.
          </p>
        )}

        {steps.map((s, idx) => (
          <div
            key={idx}
            className="grid grid-cols-1 sm:grid-cols-[28px_1fr_90px_90px_90px_60px] gap-2 items-center"
          >
            <div className="text-[13px] font-semibold text-botanical-700 text-center">
              {idx + 1}.
            </div>
            <input
              value={s.instruksi}
              onChange={(e) =>
                setSteps((ss) =>
                  ss.map((x, i) => (i === idx ? { ...x, instruksi: e.target.value } : x))
                )
              }
              placeholder="Instruksi — misal: Campurkan Fase B ke Fase A perlahan"
              className={inputCls}
            />
            <input
              value={s.suhu}
              onChange={(e) =>
                setSteps((ss) =>
                  ss.map((x, i) => (i === idx ? { ...x, suhu: e.target.value } : x))
                )
              }
              placeholder="Suhu"
              title="Suhu (mis. 70-75°C)"
              className={inputCls}
            />
            <input
              value={s.rpm}
              onChange={(e) =>
                setSteps((ss) =>
                  ss.map((x, i) => (i === idx ? { ...x, rpm: e.target.value } : x))
                )
              }
              placeholder="RPM"
              title="Kecepatan mixing"
              className={inputCls}
            />
            <input
              value={s.durasi}
              onChange={(e) =>
                setSteps((ss) =>
                  ss.map((x, i) => (i === idx ? { ...x, durasi: e.target.value } : x))
                )
              }
              placeholder="Waktu"
              title="Durasi (mis. 15 menit)"
              className={inputCls}
            />
            <div className="flex items-center justify-end gap-0.5">
              <button
                type="button"
                onClick={() =>
                  idx > 0 &&
                  setSteps((ss) => {
                    const n = [...ss];
                    [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
                    return n;
                  })
                }
                disabled={idx === 0}
                title="Naik"
                className="text-muted hover:text-ink p-1 disabled:opacity-25"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() =>
                  idx < steps.length - 1 &&
                  setSteps((ss) => {
                    const n = [...ss];
                    [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]];
                    return n;
                  })
                }
                disabled={idx === steps.length - 1}
                title="Turun"
                className="text-muted hover:text-ink p-1 disabled:opacity-25"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => setSteps((ss) => ss.filter((_, i) => i !== idx))}
                className="text-muted hover:text-clay-600 p-1"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ============ VARIAN / GRAMASI + KEMASAN ============ */}
      <div className="relative z-20 glass rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Varian / Gramasi &amp; Kemasannya
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Satu produk bisa dikemas dalam beberapa ukuran — tiap ukuran punya
              daftar kemasan sendiri (per 1 pcs).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVariants((vs) => [...vs, emptyVariant()])}
            className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline flex-shrink-0"
          >
            <Plus size={14} /> Tambah Varian
          </button>
        </div>

        {variants.length === 0 && (
          <p className="text-muted text-[13px]">
            Belum ada varian. Tambahkan minimal satu supaya produk bisa dipilih di
            Produksi.
          </p>
        )}

        {variants.map((v, vIdx) => (
          <div key={vIdx} className="border border-line rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="block text-[11.5px] text-muted mb-1">Netto</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={v.netto}
                  onChange={(e) => updateVariant(vIdx, { netto: e.target.value })}
                  placeholder="30"
                  className={`${inputCls} w-24`}
                />
              </div>
              <div>
                <label className="block text-[11.5px] text-muted mb-1">Satuan</label>
                <select
                  value={v.satuan}
                  onChange={(e) => updateVariant(vIdx, { satuan: e.target.value })}
                  className={`${inputCls} w-24`}
                >
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                </select>
              </div>
              <div>
                <label className="block text-[11.5px] text-muted mb-1">
                  Harga Jual/pcs (Rp)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={v.harga}
                  onChange={(e) => updateVariant(vIdx, { harga: e.target.value })}
                  placeholder="Misal: 45000"
                  className={`${inputCls} w-36`}
                />
              </div>
              <div className="flex-1 text-[12.5px] text-muted pb-2.5">
                {v.netto ? `Varian: ${v.netto} ${v.satuan}` : ""}
              </div>
              <button
                type="button"
                onClick={() => setVariants((vs) => vs.filter((_, i) => i !== vIdx))}
                className="text-muted hover:text-clay-600 p-2"
                title="Hapus varian"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted uppercase tracking-wide">
                Kemasan per 1 pcs
              </span>
              <button
                type="button"
                onClick={() =>
                  updateVariant(vIdx, { packaging: [...v.packaging, emptyPackRow()] })
                }
                className="flex items-center gap-1 text-botanical-700 text-[12px] font-medium hover:underline"
              >
                <Plus size={13} /> Tambah Kemasan
              </button>
            </div>

            {v.packaging.map((p, pIdx) => {
              const options = packOptions(v, p);
              return (
                <div
                  key={pIdx}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_110px_32px] gap-2 items-start"
                >
                  <div className="relative">
                    {p.item ? (
                      <div className="flex items-center gap-2 glass-input rounded-lg px-3 py-2.5 text-sm">
                        <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                          {p.item.kode}
                        </span>
                        <span className="truncate flex-1">{p.item.nama}</span>
                        <button
                          type="button"
                          onClick={() => updatePackRow(vIdx, pIdx, { item: null, query: "" })}
                          className="text-muted hover:text-clay-600 flex-shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          value={p.query}
                          onChange={(e) =>
                            updatePackRow(vIdx, pIdx, { query: e.target.value, open: true })
                          }
                          onFocus={() => updatePackRow(vIdx, pIdx, { open: true })}
                          onBlur={() =>
                            setTimeout(() => updatePackRow(vIdx, pIdx, { open: false }), 150)
                          }
                          placeholder="Pilih dari item stok kategori Kemasan..."
                          className={inputCls}
                        />
                        {p.open && kemasan.length === 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg z-20 px-3 py-2.5 text-[12.5px] text-muted">
                            Belum ada item berkategori <b>Kemasan</b> di stok.
                            Tambahkan dulu lewat Materials &amp; Stock → Stock
                            Items (kategori: Kemasan).
                          </div>
                        )}
                        {options.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg overflow-hidden z-20 max-h-52 overflow-y-auto">
                            {options.map((it) => (
                              <button
                                key={it.id}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  updatePackRow(vIdx, pIdx, {
                                    item: it,
                                    query: "",
                                    open: false,
                                  });
                                }}
                                className="w-full text-left px-3 py-2 text-[13px] hover:bg-white/60 flex gap-2"
                              >
                                <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                                  {it.kode}
                                </span>
                                <span className="truncate">{it.nama}</span>
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
                    value={p.qty}
                    onChange={(e) => updatePackRow(vIdx, pIdx, { qty: e.target.value })}
                    placeholder="Qty/pcs"
                    className={inputCls}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      updateVariant(vIdx, {
                        packaging:
                          v.packaging.length > 1
                            ? v.packaging.filter((_, j) => j !== pIdx)
                            : [emptyPackRow()],
                      })
                    }
                    className="text-muted hover:text-clay-600 p-2"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60"
      >
        {loading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan"}
      </button>
    </form>
  );
}
