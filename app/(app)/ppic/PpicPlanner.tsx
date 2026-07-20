"use client";

/* ============================================================
   PPIC Planner — kalkulator kebutuhan produksi.
   Input: daftar (produk × jumlah batch).
   Output: kebutuhan bahan per item vs stok, lalu daftar belanja
   dengan pembulatan MOQ, supplier, dan estimasi dana.
   Murni kalkulasi di layar — tidak menyimpan apa pun.
   ============================================================ */

import { useState } from "react";
import { Plus, Trash2, ShoppingCart, PackageSearch } from "lucide-react";

export type PpicProduct = {
  id: string;
  kode: string | null;
  nama: string;
  batchKg: number;
  formulas: { item_id: string; percentage: number }[];
};

export type PpicItem = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  moq: number | null;
  stok: number;
  harga: number | null; // harga pembelian terakhir
  supplier: string | null;
};

type Row = { productId: string; batches: string };

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function formatNum(n: number, maxDec = 3) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: maxDec });
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export default function PpicPlanner({
  products,
  items,
}: {
  products: PpicProduct[];
  items: PpicItem[];
}) {
  const [rows, setRows] = useState<Row[]>([{ productId: "", batches: "1" }]);

  const itemMap = new Map(items.map((it) => [it.id, it]));

  // ===== Hitung kebutuhan per item dari semua baris rencana =====
  const kebutuhan = new Map<string, number>(); // item_id -> qty butuh
  for (const r of rows) {
    const p = products.find((x) => x.id === r.productId);
    const nBatch = parseNum(r.batches);
    if (!p || nBatch <= 0 || p.batchKg <= 0) continue;
    for (const f of p.formulas) {
      const qty = (f.percentage / 100) * p.batchKg * nBatch;
      kebutuhan.set(f.item_id, (kebutuhan.get(f.item_id) || 0) + qty);
    }
  }

  type Calc = {
    item: PpicItem;
    butuh: number;
    kurang: number;
    qtyBeli: number;
    dana: number | null;
  };
  const calcs: Calc[] = [];
  for (const [itemId, butuh] of kebutuhan) {
    const item = itemMap.get(itemId);
    if (!item) continue;
    const kurang = Math.max(0, butuh - item.stok);
    let qtyBeli = kurang;
    if (kurang > 0 && item.moq && item.moq > 0) {
      qtyBeli = Math.ceil(kurang / item.moq - 1e-9) * item.moq;
    }
    calcs.push({
      item,
      butuh,
      kurang,
      qtyBeli,
      dana: item.harga != null ? qtyBeli * item.harga : null,
    });
  }
  calcs.sort((a, b) => b.kurang - a.kurang || a.item.kode.localeCompare(b.item.kode));

  const perluBeli = calcs.filter((c) => c.kurang > 0);
  const totalDana = perluBeli.reduce((s, c) => s + (c.dana || 0), 0);
  const adaTanpaHarga = perluBeli.some((c) => c.dana == null);
  const batchTanpaUkuran = rows.some((r) => {
    const p = products.find((x) => x.id === r.productId);
    return p && p.batchKg <= 0;
  });

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <div className="flex flex-col gap-4">
      {/* ===== Rencana produksi ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[15px] font-semibold text-ink">
            Rencana Produksi
          </h3>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, { productId: "", batches: "1" }])}
            className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline"
          >
            <Plus size={14} /> Tambah Produk
          </button>
        </div>

        {rows.map((row, idx) => {
          const p = products.find((x) => x.id === row.productId);
          return (
            <div
              key={idx}
              className="grid grid-cols-1 sm:grid-cols-[1fr_130px_1fr_32px] gap-2 items-center"
            >
              <select
                value={row.productId}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, i) =>
                      i === idx ? { ...r, productId: e.target.value } : r
                    )
                  )
                }
                className={inputCls}
              >
                <option value="">— Pilih produk —</option>
                {products.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.kode} — {pr.nama}
                  </option>
                ))}
              </select>
              <input
                type="text"
                inputMode="decimal"
                value={row.batches}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, i) =>
                      i === idx ? { ...r, batches: e.target.value } : r
                    )
                  )
                }
                placeholder="Jml batch"
                className={inputCls}
              />
              <div className="text-[12.5px] text-muted">
                {p
                  ? p.batchKg > 0
                    ? `= ${formatNum(p.batchKg * parseNum(row.batches))} kg bulk`
                    : "⚠ produk belum punya ukuran batch (kg)"
                  : ""}
              </div>
              <button
                type="button"
                onClick={() =>
                  setRows((rs) =>
                    rs.length > 1
                      ? rs.filter((_, i) => i !== idx)
                      : [{ productId: "", batches: "1" }]
                  )
                }
                className="text-muted hover:text-clay-600 p-2"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}

        {batchTanpaUkuran && (
          <p className="text-amber-500 text-[12px] bg-amber-100 rounded-lg px-3 py-2">
            Ada produk tanpa ukuran batch (kg bulk) — isi dulu di master produk
            supaya kebutuhannya bisa dihitung.
          </p>
        )}
      </div>

      {/* ===== Kebutuhan vs stok ===== */}
      {calcs.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-6 pt-5 pb-3 flex items-center gap-2.5">
            <div className="bg-botanical-100 text-botanical-700 rounded-lg p-2">
              <PackageSearch size={16} />
            </div>
            <div>
              <h3 className="font-display text-[15px] font-semibold text-ink">
                Kebutuhan Bahan vs Stok
              </h3>
              <p className="text-muted text-[12px]">
                {calcs.length} bahan terlibat — {perluBeli.length} perlu dibeli
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="text-left text-muted text-[11px] uppercase tracking-wide border-y border-line bg-white/40">
                  <th className="px-4 py-2 font-semibold">Bahan</th>
                  <th className="px-4 py-2 font-semibold text-right whitespace-nowrap">Kebutuhan</th>
                  <th className="px-4 py-2 font-semibold text-right whitespace-nowrap">Stok Sisa</th>
                  <th className="px-4 py-2 font-semibold text-right whitespace-nowrap">Kekurangan</th>
                  <th className="px-4 py-2 font-semibold whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {calcs.map((c) => (
                  <tr key={c.item.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium max-w-[220px] truncate" title={c.item.nama}>
                        {c.item.nama}
                      </div>
                      <div className="text-[11px] text-muted font-mono">{c.item.kode}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {formatNum(c.butuh)} {c.item.satuan}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {formatNum(c.item.stok)} {c.item.satuan}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap font-medium">
                      {c.kurang > 0 ? (
                        <span className="text-clay-600">
                          {formatNum(c.kurang)} {c.item.satuan}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                          c.kurang > 0
                            ? "bg-clay-100 text-clay-600"
                            : "bg-botanical-100 text-botanical-700"
                        }`}
                      >
                        {c.kurang > 0 ? "Perlu Beli" : "Cukup"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== Rekomendasi pembelian ===== */}
      {perluBeli.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-6 pt-5 pb-3 flex items-center gap-2.5">
            <div className="bg-clay-100 text-clay-600 rounded-lg p-2">
              <ShoppingCart size={16} />
            </div>
            <div>
              <h3 className="font-display text-[15px] font-semibold text-ink">
                Rekomendasi Pembelian
              </h3>
              <p className="text-muted text-[12px]">
                Qty dibulatkan ke atas mengikuti MOQ · harga = pembelian terakhir
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead>
                <tr className="text-left text-muted text-[11px] uppercase tracking-wide border-y border-line bg-white/40">
                  <th className="px-4 py-2 font-semibold">Bahan</th>
                  <th className="px-4 py-2 font-semibold whitespace-nowrap">Supplier</th>
                  <th className="px-4 py-2 font-semibold text-right whitespace-nowrap">Kekurangan</th>
                  <th className="px-4 py-2 font-semibold text-right whitespace-nowrap">MOQ</th>
                  <th className="px-4 py-2 font-semibold text-right whitespace-nowrap">Qty Beli</th>
                  <th className="px-4 py-2 font-semibold text-right whitespace-nowrap">Harga/Unit</th>
                  <th className="px-4 py-2 font-semibold text-right whitespace-nowrap">Est. Dana</th>
                </tr>
              </thead>
              <tbody>
                {perluBeli.map((c) => (
                  <tr key={c.item.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium max-w-[200px] truncate" title={c.item.nama}>
                        {c.item.nama}
                      </div>
                      <div className="text-[11px] text-muted font-mono">{c.item.kode}</div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-[12.5px]">
                      <div className="max-w-[160px] truncate" title={c.item.supplier || undefined}>
                        {c.item.supplier || <span className="text-muted">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {formatNum(c.kurang)} {c.item.satuan}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {c.item.moq ? `${formatNum(c.item.moq)} ${c.item.satuan}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap font-semibold text-botanical-700">
                      {formatNum(c.qtyBeli)} {c.item.satuan}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {c.item.harga != null ? formatRupiah(c.item.harga) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap font-medium">
                      {c.dana != null ? formatRupiah(c.dana) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-white/50">
                  <td colSpan={6} className="px-4 py-3 text-right font-semibold">
                    Total Estimasi Dana
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-display text-[15px] font-semibold text-botanical-700">
                    {formatRupiah(totalDana)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {adaTanpaHarga && (
            <p className="text-amber-500 text-[12px] px-6 py-3 bg-amber-100/60">
              ⚠ Ada bahan tanpa riwayat harga pembelian — total dana di atas belum
              mencakup bahan tersebut.
            </p>
          )}
        </div>
      )}

      {calcs.length > 0 && perluBeli.length === 0 && (
        <div className="glass rounded-2xl p-6 text-center text-botanical-700 text-sm font-medium">
          ✓ Stok bahan cukup untuk seluruh rencana produksi — tidak perlu belanja.
        </div>
      )}
    </div>
  );
}
