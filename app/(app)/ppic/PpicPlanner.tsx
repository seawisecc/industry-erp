"use client";

/* ============================================================
   PPIC Planner, kalkulator kebutuhan produksi.
   Input: daftar (produk × jumlah batch).
   Output: kebutuhan bahan per item vs stok, lalu daftar belanja
   dengan pembulatan MOQ, supplier, dan estimasi dana.
   Murni kalkulasi di layar, tidak menyimpan apa pun.

   Rumusnya di lib/ppic.ts, dipakai bersama dokumen cetak /print/ppic.
   Rencananya ikut ditulis ke URL (?r=), jadi tombol Kembali dari
   halaman cetak mengembalikan rencana yang sama, bukan layar kosong.
   ============================================================ */

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  ShoppingCart,
  PackageSearch,
  Printer,
} from "lucide-react";
import DataTable from "@/components/DataTable";
import NumberInput from "@/components/NumberInput";
import ProductPicker, { type ProductOption } from "@/components/ProductPicker";
import {
  hitungPpic,
  rencanaKeQuery,
  type PpicItem,
  type PpicProduct,
  type PpicRencana,
} from "@/lib/ppic";

export type { PpicItem, PpicProduct } from "@/lib/ppic";

type Row = { productId: string; batches: string };

const BARIS_KOSONG: Row = { productId: "", batches: "1" };

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function formatNum(n: number, maxDec = 3) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: maxDec });
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function keRencana(rows: Row[]): PpicRencana[] {
  return rows.map((r) => ({
    productId: r.productId,
    batches: parseNum(r.batches),
  }));
}

export default function PpicPlanner({
  products,
  items,
  rencanaAwal,
  gagalMuat,
}: {
  products: PpicProduct[];
  items: PpicItem[];
  /** Rencana dari URL (?r=), kosong kalau layar dibuka biasa. */
  rencanaAwal: PpicRencana[];
  /** Sebagian data stok/harga gagal dimuat. */
  gagalMuat: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    rencanaAwal.length > 0
      ? rencanaAwal.map((r) => ({
          productId: r.productId,
          batches: String(r.batches),
        }))
      : [{ ...BARIS_KOSONG }]
  );

  /**
   * Ubah rencana sekaligus tulis ke URL. Dikerjakan di handler, bukan
   * useEffect yang mengawasi rows: alasan yang sama dengan bab State
   * klien di CLAUDE.md. replaceState, bukan pushState: tiap ketikan
   * jumlah batch tidak boleh jadi satu langkah di tombol Kembali.
   */
  function ubahRows(baru: Row[]) {
    setRows(baru);
    const q = rencanaKeQuery(keRencana(baru));
    window.history.replaceState(null, "", q ? `/ppic?r=${q}` : "/ppic");
  }

  // PPIC merencanakan per PRODUK, bukan per varian: formula dan ukuran
  // batch menempel di produk. Stok produk jadi tidak relevan di sini,
  // jadi pemilihnya dipasang tanpa info stok.
  const pilihanProduk: ProductOption[] = products.map((p) => ({
    key: p.id,
    label: `${p.kode || "-"}, ${p.nama}`,
    brand: p.brand,
    varian: "-",
    available: 0,
    service_id: null,
  }));

  const hasil = hitungPpic(products, items, keRencana(rows));
  const calcs = hasil.bahan;
  const { perluBeli, totalDana, adaTanpaHarga } = hasil;
  const batchTanpaUkuran = hasil.tanpaUkuranBatch.length > 0;
  const queryCetak = rencanaKeQuery(keRencana(rows));

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <div className="flex flex-col gap-4">
      {gagalMuat && (
        <p className="text-clay-600 text-[12.5px] bg-clay-100 rounded-lg px-3 py-2">
          Sebagian data stok atau harga gagal dimuat, jadi angka di bawah bisa
          keliru. Muat ulang halaman sebelum dipakai.
        </p>
      )}

      {/* ===== Rencana produksi =====
          relative + z-20: daftar saran pemilih produk harus tampil di atas
          kartu hasil di bawahnya, `.glass` membentuk stacking context. */}
      <div className="relative z-20 glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-display text-[15px] font-semibold text-ink">
            Rencana Produksi
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Cuma muncul kalau ada rencana yang sah: tombol yang
                mencetak kertas kosong lebih buruk daripada tidak ada. */}
            {hasil.rencana.length > 0 && (
              <Link
                href={`/print/ppic?r=${queryCetak}`}
                className="inline-flex items-center gap-1.5 h-9 bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
              >
                <Printer size={14} /> Cetak Dokumen
              </Link>
            )}
            <button
              type="button"
              onClick={() => ubahRows([...rows, { ...BARIS_KOSONG }])}
              className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline"
            >
              <Plus size={14} /> Tambah Produk
            </button>
          </div>
        </div>

        {rows.map((row, idx) => {
          const p = products.find((x) => x.id === row.productId);
          return (
            <div
              key={idx}
              className="flex flex-col gap-1 rounded-xl border border-line/70 bg-white/40 p-3 sm:border-0 sm:bg-transparent sm:p-0"
            >
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px_1fr_32px] gap-2 items-center">
                <ProductPicker
                  options={pilihanProduk}
                  value={row.productId}
                  onChange={(key) =>
                    ubahRows(
                      rows.map((r, i) => (i === idx ? { ...r, productId: key } : r))
                    )
                  }
                  placeholder="Ketik kode / nama produk / brand..."
                  showStock={false}
                />
                <NumberInput
                  value={row.batches}
                  onChange={(nilai) =>
                    ubahRows(
                      rows.map((r, i) => (i === idx ? { ...r, batches: nilai } : r))
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
                    ubahRows(
                      rows.length > 1
                        ? rows.filter((_, i) => i !== idx)
                        : [{ ...BARIS_KOSONG }]
                    )
                  }
                  className="text-muted hover:text-clay-600 p-2 justify-self-end"
                  aria-label="Hapus baris"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {p && (
                <p className="text-[11.5px] text-muted">
                  {[
                    p.brand ? `Brand ${p.brand}` : "Tanpa brand",
                    p.kategori,
                    p.batchKg > 0 ? `batch ${formatNum(p.batchKg)} kg` : null,
                    `${p.formulas.length} bahan di formula`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          );
        })}

        {batchTanpaUkuran && (
          <p className="text-amber-500 text-[12px] bg-amber-100 rounded-lg px-3 py-2">
            Ada produk tanpa ukuran batch (kg bulk), isi dulu di master produk
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
                {calcs.length} bahan terlibat · {perluBeli.length} perlu dibeli
              </p>
            </div>
          </div>
          <div className="px-6 pb-5">
            <DataTable
              rows={calcs}
              rowKey={(c) => c.item.id}
              minWidth={720}
              chrome="bare"
              empty="Belum ada kebutuhan bahan."
              columns={[
                {
                  key: "bahan",
                  header: "Bahan",
                  role: "title",
                  cell: (c) => (
                    <>
                      <div className="font-medium max-w-[220px] truncate" title={c.item.nama}>
                        {c.item.nama}
                      </div>
                      <div className="text-[11px] text-muted font-mono">
                        {c.item.kode}
                      </div>
                    </>
                  ),
                  cardCell: (c) => (
                    <>
                      <div>{c.item.nama}</div>
                      <div className="text-[11px] text-muted font-mono font-normal">
                        {c.item.kode}
                      </div>
                    </>
                  ),
                },
                {
                  key: "butuh",
                  header: "Kebutuhan",
                  role: "primary",
                  align: "right",
                  className: "whitespace-nowrap",
                  cell: (c) => `${formatNum(c.butuh)} ${c.item.satuan}`,
                },
                {
                  key: "stok",
                  header: "Stok Sisa",
                  role: "primary",
                  align: "right",
                  className: "whitespace-nowrap",
                  cell: (c) => `${formatNum(c.item.stok)} ${c.item.satuan}`,
                },
                {
                  key: "kurang",
                  header: "Kekurangan",
                  role: "primary",
                  align: "right",
                  className: "whitespace-nowrap font-medium",
                  cell: (c) =>
                    c.kurang > 0 ? (
                      <span className="text-clay-600">
                        {formatNum(c.kurang)} {c.item.satuan}
                      </span>
                    ) : (
                      "-"
                    ),
                },
                {
                  key: "status",
                  header: "Status",
                  role: "badge",
                  cell: (c) => (
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                        c.kurang > 0
                          ? "bg-clay-100 text-clay-600"
                          : "bg-botanical-100 text-botanical-700"
                      }`}
                    >
                      {c.kurang > 0 ? "Perlu Beli" : "Cukup"}
                    </span>
                  ),
                },
              ]}
            />
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
          <div className="px-6 pb-5">
            <DataTable
              rows={perluBeli}
              rowKey={(c) => c.item.id}
              minWidth={820}
              chrome="bare"
              empty="Tidak ada yang perlu dibeli."
              footer={{
                row: (
                  <tr className="border-t border-line bg-white/50">
                    <td colSpan={6} className="px-4 py-3 text-right font-semibold">
                      Total Estimasi Dana
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-display text-[15px] font-semibold text-botanical-700">
                      {formatRupiah(totalDana)}
                    </td>
                  </tr>
                ),
                card: (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12px] text-muted">
                      Total Estimasi Dana
                    </span>
                    <span className="font-display text-[15px] font-semibold text-botanical-700">
                      {formatRupiah(totalDana)}
                    </span>
                  </div>
                ),
              }}
              columns={[
                {
                  key: "bahan",
                  header: "Bahan",
                  role: "title",
                  cell: (c) => (
                    <>
                      <div className="font-medium max-w-[200px] truncate" title={c.item.nama}>
                        {c.item.nama}
                      </div>
                      <div className="text-[11px] text-muted font-mono">
                        {c.item.kode}
                      </div>
                    </>
                  ),
                  cardCell: (c) => (
                    <>
                      <div>{c.item.nama}</div>
                      <div className="text-[11px] text-muted font-mono font-normal">
                        {c.item.kode}
                      </div>
                    </>
                  ),
                },
                {
                  key: "supplier",
                  header: "Supplier",
                  role: "primary",
                  className: "whitespace-nowrap text-[12.5px]",
                  cell: (c) => (
                    <div
                      className="max-w-[160px] truncate"
                      title={c.item.supplier || undefined}
                    >
                      {c.item.supplier || <span className="text-muted">-</span>}
                    </div>
                  ),
                  cardCell: (c) => c.item.supplier || "-",
                },
                {
                  key: "kurang",
                  header: "Kekurangan",
                  role: "secondary",
                  align: "right",
                  className: "whitespace-nowrap",
                  cell: (c) => `${formatNum(c.kurang)} ${c.item.satuan}`,
                },
                {
                  key: "moq",
                  header: "MOQ",
                  role: "secondary",
                  align: "right",
                  className: "whitespace-nowrap",
                  cell: (c) =>
                    c.item.moq ? `${formatNum(c.item.moq)} ${c.item.satuan}` : "-",
                },
                {
                  key: "beli",
                  header: "Qty Beli",
                  role: "primary",
                  align: "right",
                  className: "whitespace-nowrap font-semibold text-botanical-700",
                  cell: (c) => (
                    <span className="font-semibold text-botanical-700">
                      {formatNum(c.qtyBeli)} {c.item.satuan}
                    </span>
                  ),
                },
                {
                  key: "harga",
                  header: "Harga/Unit",
                  role: "secondary",
                  align: "right",
                  className: "whitespace-nowrap",
                  cell: (c) =>
                    c.item.harga != null ? formatRupiah(c.item.harga) : "-",
                },
                {
                  key: "dana",
                  header: "Est. Dana",
                  role: "primary",
                  align: "right",
                  className: "whitespace-nowrap font-medium",
                  cell: (c) => (c.dana != null ? formatRupiah(c.dana) : "-"),
                },
              ]}
            />
          </div>
          {adaTanpaHarga && (
            <p className="text-amber-500 text-[12px] px-6 py-3 bg-amber-100/60">
              ⚠ Ada bahan tanpa riwayat harga pembelian, total dana di atas belum
              mencakup bahan tersebut.
            </p>
          )}
        </div>
      )}

      {calcs.length > 0 && perluBeli.length === 0 && (
        <div className="glass rounded-2xl p-6 text-center text-botanical-700 text-sm font-medium">
          ✓ Stok bahan cukup untuk seluruh rencana produksi, tidak perlu belanja.
        </div>
      )}
    </div>
  );
}
