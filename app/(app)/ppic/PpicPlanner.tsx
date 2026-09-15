"use client";

/* ============================================================
   PPIC Planner, kalkulator kebutuhan produksi.

   Input: daftar (produk × jumlah batch).
   Output, berurutan seperti orang membacanya:
   1. Ringkasan      berapa bahan, berapa yang harus dibeli, berapa dana
   2. Neraca Bahan   Stok Sisa, Plan Berjalan, Kebutuhan PPIC, Kekurangan
   3. Rekomendasi    per supplier, dibulatkan MOQ
   4. Dalam Proses   lot karantina & PO terbuka yang harus dikejar
   5. Plan Berjalan  Plan Produksi yang ikut menahan bahan
   Murni kalkulasi di layar, tidak menyimpan apa pun.

   Rumusnya di lib/ppic.ts, dipakai bersama dokumen cetak /print/ppic.
   Rencananya ikut ditulis ke URL (?r=), jadi tombol Kembali dari
   halaman cetak mengembalikan rencana yang sama, bukan layar kosong.
   ============================================================ */

import { useState } from "react";
import Link from "next/link";
import {
  Factory,
  PackageSearch,
  Plus,
  Printer,
  ShoppingCart,
  Trash2,
  Truck,
} from "lucide-react";
import DataTable from "@/components/DataTable";
import NumberInput from "@/components/NumberInput";
import ProductPicker, { type ProductOption } from "@/components/ProductPicker";
import {
  dokumenProses,
  hitungPpic,
  rencanaKeQuery,
  type PpicBahan,
  type PpicDokumenProses,
  type PpicItem,
  type PpicPlanTerbuka,
  type PpicProduct,
  type PpicRencana,
  type PpicStatus,
} from "@/lib/ppic";

export type { PpicItem, PpicProduct } from "@/lib/ppic";

type Row = { productId: string; batches: string };

const BARIS_KOSONG: Row = { productId: "", batches: "1" };

const WARNA_STATUS: Record<PpicStatus, string> = {
  "Perlu Beli": "bg-clay-100 text-clay-600",
  "PO Belum Dikirim": "bg-white/80 text-muted border border-line",
  "Menunggu Kedatangan": "bg-white/80 text-ink border border-line",
  "Menunggu QC": "bg-amber-100 text-amber-500",
  Cukup: "bg-botanical-100 text-botanical-700",
};

/** Kelas sel angka: rata kanan lewat `align`, digit selebar sama. */
const ANGKA = "whitespace-nowrap tabular-nums";

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function formatNum(n: number, maxDec = 3) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: maxDec });
}
/** Angka neraca: nol ditulis "-" supaya kolom yang kosong tidak terbaca sebagai data. */
function angkaAtauStrip(n: number) {
  return Math.abs(n) > 1e-9 ? formatNum(n) : "-";
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
function formatTanggal(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function keRencana(rows: Row[]): PpicRencana[] {
  return rows.map((r) => ({
    productId: r.productId,
    batches: parseNum(r.batches),
  }));
}

function Pil({ status }: { status: string }) {
  const warna =
    WARNA_STATUS[status as PpicStatus] ?? "bg-white/80 text-ink border border-line";
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${warna}`}
    >
      {status}
    </span>
  );
}

function KepalaKartu({
  ikon,
  warnaIkon,
  judul,
  keterangan,
}: {
  ikon: React.ReactNode;
  warnaIkon: string;
  judul: string;
  keterangan: React.ReactNode;
}) {
  return (
    <div className="px-6 pt-5 pb-3 flex items-start gap-2.5">
      <div className={`rounded-lg p-2 flex-shrink-0 ${warnaIkon}`}>{ikon}</div>
      <div className="min-w-0">
        <h3 className="font-display text-[15px] font-semibold text-ink">{judul}</h3>
        <p className="text-muted text-[12px] leading-snug">{keterangan}</p>
      </div>
    </div>
  );
}

function Ringkasan({
  label,
  nilai,
  keterangan,
  nada = "text-ink",
}: {
  label: string;
  nilai: string;
  keterangan?: string;
  nada?: string;
}) {
  return (
    <div className="glass rounded-2xl px-4 py-3.5 min-w-0">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className={`font-display text-[20px] font-semibold leading-tight mt-0.5 ${nada}`}>
        {nilai}
      </div>
      {keterangan && (
        <div className="text-[11px] text-muted mt-0.5 leading-snug">{keterangan}</div>
      )}
    </div>
  );
}

/** Nama bahan + kode & satuan. Satuan cukup ditulis sekali di sini. */
function SelBahan({ c, lebar = "max-w-[240px]" }: { c: PpicBahan; lebar?: string }) {
  return (
    <>
      <div className={`font-medium truncate ${lebar}`} title={c.item.nama}>
        {c.item.nama}
      </div>
      <div className="text-[11px] text-muted">
        <span className="font-mono">{c.item.kode}</span> · {c.item.satuan}
      </div>
    </>
  );
}
function KartuBahan({ c }: { c: PpicBahan }) {
  return (
    <>
      <div>{c.item.nama}</div>
      <div className="text-[11px] text-muted font-normal">
        <span className="font-mono">{c.item.kode}</span> · {c.item.satuan}
      </div>
    </>
  );
}

type BarisProses = { c: PpicBahan; d: PpicDokumenProses; urut: number };

export default function PpicPlanner({
  products,
  items,
  planTerbuka,
  rencanaAwal,
  gagalMuat,
}: {
  products: PpicProduct[];
  items: PpicItem[];
  /** Plan Produksi yang belum Input Hasil, ikut menahan stok. */
  planTerbuka: PpicPlanTerbuka[];
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

  const hasil = hitungPpic(products, items, keRencana(rows), planTerbuka);
  const { bahan, perluBeli, dalamProses, planTerlibat, totalDana, adaTanpaHarga, tanpaMoq } =
    hasil;
  const batchTanpaUkuran = hasil.tanpaUkuranBatch.length > 0;
  const queryCetak = rencanaKeQuery(keRencana(rows));

  // Rekomendasi dikelompokkan per supplier, karena PO dibuat per supplier.
  const belanja = [...perluBeli].sort(
    (a, b) =>
      (a.item.supplier ?? "￿").localeCompare(b.item.supplier ?? "￿", "id") ||
      a.item.nama.localeCompare(b.item.nama, "id")
  );

  const barisProses: BarisProses[] = dalamProses.flatMap((c) =>
    dokumenProses(c.item).map((d, urut) => ({ c, d, urut }))
  );

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <div className="flex flex-col gap-4">
      {gagalMuat && (
        <p className="text-clay-600 text-[12.5px] bg-clay-100 rounded-lg px-3 py-2">
          Sebagian data stok, plan produksi, karantina, atau PO gagal dimuat, jadi
          angka di bawah bisa keliru. Muat ulang halaman sebelum dipakai.
        </p>
      )}

      {/* ===== Rencana produksi =====
          relative + z-20: daftar saran pemilih produk harus tampil di atas
          kartu hasil di bawahnya, `.glass` membentuk stacking context. */}
      <div className="relative z-20 glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-ink">
              Rencana Produksi
            </h3>
            <p className="text-muted text-[12px]">
              Produk yang mau diproduksi, di luar Plan Produksi yang sudah berjalan
            </p>
          </div>
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

      {/* ===== Ringkasan ===== */}
      {bahan.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Ringkasan
            label="Bahan di Neraca"
            nilai={bahan.length.toLocaleString("id-ID")}
            keterangan={`${planTerlibat.length} plan berjalan ikut dihitung`}
          />
          <Ringkasan
            label="Perlu Dibeli"
            nilai={perluBeli.length.toLocaleString("id-ID")}
            keterangan={perluBeli.length > 0 ? "bahan, sesudah dikurangi karantina & PO" : "tidak ada"}
            nada={perluBeli.length > 0 ? "text-clay-600" : "text-botanical-700"}
          />
          <Ringkasan
            label="Sedang Diproses"
            nilai={dalamProses.length.toLocaleString("id-ID")}
            keterangan="bahan di karantina QC atau PO terbuka"
          />
          <Ringkasan
            label="Estimasi Dana"
            nilai={formatRupiah(totalDana)}
            keterangan={
              adaTanpaHarga ? "belum termasuk bahan tanpa harga" : "harga pembelian terakhir"
            }
            nada="text-botanical-700"
          />
        </div>
      )}

      {/* ===== Neraca bahan ===== */}
      {bahan.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <KepalaKartu
            ikon={<PackageSearch size={16} />}
            warnaIkon="bg-botanical-100 text-botanical-700"
            judul="Neraca Bahan"
            keterangan="Angka dalam satuan masing-masing bahan (tertulis di bawah namanya)"
          />
          <div className="px-6 pb-5">
            <DataTable
              rows={bahan}
              rowKey={(c) => c.item.id}
              minWidth={960}
              chrome="bare"
              empty="Belum ada kebutuhan bahan."
              groupBy={{
                key: (c) => c.status,
                header: (g) => (
                  <span className="flex items-center gap-2">
                    <Pil status={g.key} />
                    <span className="text-muted text-[12px]">{g.rows.length} bahan</span>
                  </span>
                ),
              }}
              columns={[
                {
                  key: "bahan",
                  header: "Bahan",
                  role: "title",
                  cell: (c) => <SelBahan c={c} />,
                  cardCell: (c) => <KartuBahan c={c} />,
                },
                {
                  key: "stok",
                  header: "Stok Sisa",
                  role: "primary",
                  align: "right",
                  className: ANGKA,
                  cell: (c) => angkaAtauStrip(c.item.stok),
                },
                {
                  key: "plan",
                  header: "Plan Berjalan",
                  role: "primary",
                  align: "right",
                  className: ANGKA,
                  cell: (c) => angkaAtauStrip(c.alokasi),
                },
                {
                  key: "ppic",
                  header: "Kebutuhan PPIC",
                  role: "primary",
                  align: "right",
                  className: ANGKA,
                  cell: (c) => angkaAtauStrip(c.butuh),
                },
                {
                  key: "kurang",
                  header: "Kekurangan",
                  role: "primary",
                  align: "right",
                  className: `${ANGKA} font-semibold`,
                  cell: (c) =>
                    c.kurang > 0 ? (
                      <span className="text-clay-600">{formatNum(c.kurang)}</span>
                    ) : (
                      <span className="text-muted font-normal">-</span>
                    ),
                },
                {
                  key: "proses",
                  header: "Karantina / PO",
                  role: "secondary",
                  align: "right",
                  className: ANGKA,
                  // Cuma untuk bahan yang kurang: PO terbuka milik bahan yang
                  // stoknya sudah cukup tidak mengubah keputusan apa pun.
                  cell: (c) =>
                    c.kurang > 0
                      ? angkaAtauStrip(c.qtyKarantina + c.qtyPoDikirim + c.qtyPoBelumDikirim)
                      : "-",
                },
                {
                  key: "beli",
                  header: "Qty Beli",
                  role: "primary",
                  align: "right",
                  className: `${ANGKA} font-semibold`,
                  cell: (c) =>
                    c.qtyBeli > 0 ? (
                      <span className="text-botanical-700">{formatNum(c.qtyBeli)}</span>
                    ) : (
                      <span className="text-muted font-normal">-</span>
                    ),
                },
              ]}
            />
            <div className="mt-3 grid gap-1 text-[11.5px] text-muted leading-snug">
              <p>
                <b className="text-ink">Kekurangan</b> = Plan Berjalan + Kebutuhan PPIC,
                dikurangi Stok Sisa. <b className="text-ink">Qty Beli</b> = Kekurangan
                dikurangi Karantina / PO, dibulatkan ke atas mengikuti MOQ.
              </p>
              <p>
                Plan Berjalan adalah jatah Plan Produksi yang belum Input Hasil: dari
                hasil timbangan kalau sudah ditimbang, dari formula kalau belum.
                Bahan yang cuma dipakai Plan Berjalan ikut tampil hanya kalau stoknya
                sudah kurang.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== Rekomendasi pembelian ===== */}
      {perluBeli.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <KepalaKartu
            ikon={<ShoppingCart size={16} />}
            warnaIkon="bg-clay-100 text-clay-600"
            judul="Rekomendasi Pembelian"
            keterangan={`${perluBeli.length} bahan dari ${
              new Set(perluBeli.map((c) => c.item.supplier ?? "")).size
            } supplier · dikelompokkan per supplier supaya bisa langsung dijadikan PO`}
          />
          <div className="px-6 pb-5">
            <DataTable
              rows={belanja}
              rowKey={(c) => c.item.id}
              minWidth={900}
              chrome="bare"
              empty="Tidak ada yang perlu dibeli."
              groupBy={{
                key: (c) => c.item.supplier ?? "",
                header: (g) => (
                  <span className="flex items-center justify-between gap-3 w-full">
                    <span>
                      <span className="font-semibold text-ink">
                        {g.key || "Supplier belum diketahui"}
                      </span>
                      <span className="text-muted text-[12px]">
                        {" · "}
                        {g.rows.length} bahan
                      </span>
                    </span>
                    <span className="text-ink font-semibold tabular-nums whitespace-nowrap">
                      {formatRupiah(g.rows.reduce((s, c) => s + (c.dana || 0), 0))}
                    </span>
                  </span>
                ),
              }}
              footer={{
                row: (
                  <tr className="border-t border-line bg-white/50">
                    <td colSpan={7} className="px-4 py-3 text-right font-semibold">
                      Total Estimasi Dana
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums font-display text-[15px] font-semibold text-botanical-700">
                      {formatRupiah(totalDana)}
                    </td>
                  </tr>
                ),
                card: (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12px] text-muted">Total Estimasi Dana</span>
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
                  cell: (c) => <SelBahan c={c} lebar="max-w-[220px]" />,
                  cardCell: (c) => <KartuBahan c={c} />,
                },
                {
                  key: "kurang",
                  header: "Kekurangan",
                  role: "secondary",
                  align: "right",
                  className: ANGKA,
                  cell: (c) => formatNum(c.kurang),
                },
                {
                  key: "proses",
                  header: "Karantina / PO",
                  role: "secondary",
                  align: "right",
                  className: ANGKA,
                  cell: (c) =>
                    angkaAtauStrip(c.qtyKarantina + c.qtyPoDikirim + c.qtyPoBelumDikirim),
                },
                {
                  key: "belum",
                  header: "Belum Dipesan",
                  role: "primary",
                  align: "right",
                  className: ANGKA,
                  cell: (c) => formatNum(c.belumDipesan),
                },
                {
                  key: "moq",
                  header: "MOQ",
                  role: "secondary",
                  align: "right",
                  className: ANGKA,
                  cell: (c) =>
                    c.tanpaMoq ? (
                      <span className="text-amber-500 text-[12px]">belum diisi</span>
                    ) : (
                      angkaAtauStrip(c.item.moq || 0)
                    ),
                },
                {
                  key: "beli",
                  header: "Qty Beli",
                  role: "primary",
                  align: "right",
                  className: `${ANGKA} font-semibold text-botanical-700`,
                  cell: (c) => formatNum(c.qtyBeli),
                },
                {
                  key: "harga",
                  header: "Harga/Unit",
                  role: "secondary",
                  align: "right",
                  className: ANGKA,
                  cell: (c) => (c.item.harga != null ? formatRupiah(c.item.harga) : "-"),
                },
                {
                  key: "dana",
                  header: "Est. Dana",
                  role: "primary",
                  align: "right",
                  className: `${ANGKA} font-medium`,
                  cell: (c) => (c.dana != null ? formatRupiah(c.dana) : "-"),
                },
              ]}
            />
          </div>
          {tanpaMoq.length > 0 && (
            <p className="text-amber-500 text-[12px] px-6 py-3 bg-amber-100/60 leading-snug">
              ⚠ {tanpaMoq.length} bahan belum punya MOQ, jadi Qty Beli-nya sama dengan
              yang belum dipesan, tanpa pembulatan:{" "}
              {tanpaMoq
                .slice(0, 5)
                .map((c) => c.item.nama)
                .join(", ")}
              {tanpaMoq.length > 5 ? `, dan ${tanpaMoq.length - 5} lainnya` : ""}. Isi
              MOQ di menu{" "}
              <Link href="/items" className="font-medium underline">
                Stock Items
              </Link>{" "}
              supaya dibulatkan otomatis.
            </p>
          )}
          {adaTanpaHarga && (
            <p className="text-amber-500 text-[12px] px-6 py-3 bg-amber-100/60">
              ⚠ Ada bahan tanpa riwayat harga pembelian, total dana di atas belum
              mencakup bahan tersebut.
            </p>
          )}
        </div>
      )}

      {bahan.length > 0 && perluBeli.length === 0 && (
        <div className="glass rounded-2xl p-6 text-center text-botanical-700 text-sm font-medium">
          {dalamProses.length > 0
            ? `✓ Tidak ada yang perlu dipesan lagi. ${dalamProses.length} bahan masih menunggu QC atau kedatangan PO, lihat tabel di bawah.`
            : "✓ Stok bahan cukup untuk Plan berjalan dan seluruh rencana produksi, tidak perlu belanja."}
        </div>
      )}

      {/* ===== Karantina & PO terbuka ===== */}
      {barisProses.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <KepalaKartu
            ikon={<Truck size={16} />}
            warnaIkon="bg-amber-100 text-amber-500"
            judul="Karantina QC & PO Terbuka"
            keterangan="Barang yang sudah di jalan untuk bahan yang kurang. Tindak lanjutnya dikejar, bukan dibeli lagi."
          />
          <div className="px-6 pb-5">
            <DataTable
              rows={barisProses}
              rowKey={(r) => `${r.c.item.id}-${r.urut}`}
              minWidth={760}
              chrome="bare"
              groupBy={{
                key: (r) => r.c.item.id,
                header: (g) => {
                  const c = g.rows[0].c;
                  return (
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink">{c.item.nama}</span>
                      <span className="text-muted text-[12px]">
                        kekurangan {formatNum(c.kurang)} {c.item.satuan}
                      </span>
                      <Pil status={c.status} />
                    </span>
                  );
                },
              }}
              columns={[
                {
                  key: "dokumen",
                  header: "Dokumen",
                  role: "title",
                  cell: (r) => <span className="font-mono text-[12.5px]">{r.d.nomor}</span>,
                },
                {
                  key: "tahap",
                  header: "Tahap",
                  role: "badge",
                  cell: (r) => <Pil status={r.d.tahap} />,
                },
                {
                  key: "supplier",
                  header: "Supplier",
                  role: "primary",
                  cell: (r) => r.d.supplier || "-",
                },
                {
                  key: "tanggal",
                  header: "Tanggal",
                  role: "secondary",
                  className: "whitespace-nowrap",
                  cell: (r) => formatTanggal(r.d.tanggal),
                },
                {
                  key: "qty",
                  header: "Sisa Qty",
                  role: "primary",
                  align: "right",
                  className: `${ANGKA} font-medium`,
                  cell: (r) => `${formatNum(r.d.qty)} ${r.c.item.satuan}`,
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* ===== Plan produksi berjalan ===== */}
      {planTerlibat.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <KepalaKartu
            ikon={<Factory size={16} />}
            warnaIkon="bg-white/80 text-ink border border-line"
            judul="Plan Produksi Berjalan"
            keterangan="Plan yang belum Input Hasil. Bahannya belum terpotong dari stok, tapi sudah dijatah di neraca di atas."
          />
          <div className="px-6 pb-5">
            <DataTable
              rows={planTerlibat}
              rowKey={(p) => p.id}
              minWidth={760}
              chrome="bare"
              columns={[
                {
                  key: "batch",
                  header: "No. Batch",
                  role: "subtitle",
                  className: "whitespace-nowrap",
                  cell: (p) => <span className="font-mono text-[12.5px]">{p.noBatch}</span>,
                },
                {
                  key: "produk",
                  header: "Produk",
                  role: "title",
                  cell: (p) => (
                    <>
                      <div className="font-medium">{p.produk}</div>
                      {p.brand && <div className="text-[11px] text-muted">{p.brand}</div>}
                    </>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  role: "badge",
                  cell: (p) => <Pil status={p.status} />,
                },
                {
                  key: "tanggal",
                  header: "Rencana",
                  role: "primary",
                  className: "whitespace-nowrap",
                  cell: (p) => formatTanggal(p.tanggal),
                },
                {
                  key: "jml",
                  header: "Batch",
                  role: "secondary",
                  align: "right",
                  className: ANGKA,
                  cell: (p) => formatNum(p.jumlahBatch),
                },
                {
                  key: "dasar",
                  header: "Dasar Jatah",
                  role: "primary",
                  cell: (p) => (p.dariTimbangan ? "Hasil timbangan" : "Formula"),
                },
                {
                  key: "bahan",
                  header: "Bahan",
                  role: "secondary",
                  align: "right",
                  className: ANGKA,
                  cell: (p) => p.jatah.length,
                },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
