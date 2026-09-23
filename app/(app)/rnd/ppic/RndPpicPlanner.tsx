"use client";

/* ============================================================
   PPIC R&D: rencana dana launching dari formula R&D.

   Input: daftar (formula x jumlah pcs).
   Output, berurutan seperti orang membacanya:
   1. Ringkasan          dana pembelian, biaya bahan, jumlah bahan dibeli
   2. Per Formula        ruahan, biaya per pcs, biaya total
   3. Dana Pembelian     per supplier, dibulatkan MOQ, termasuk bahan
                         yang belum dimiliki dan kemasan ketikan
   4. Neraca Bahan       stok, Plan Berjalan, kebutuhan, karantina/PO

   Murni hitungan di layar, tidak menyimpan dan tidak menggerakkan
   apa pun (bab "Modul ini tidak menulis apa pun ke stok"). Rumusnya
   di lib/rndPpic.ts; tangga persediaannya dipinjam dari lib/ppic.ts.
   Rencananya ikut ditulis ke URL (?r=) supaya bisa dibagikan dan
   tidak hilang saat halaman dimuat ulang.
   ============================================================ */

import { useState } from "react";
import Link from "next/link";
import { Coins, FlaskConical, PackageSearch, Plus, ShoppingCart, Trash2 } from "lucide-react";
import DataTable from "@/components/DataTable";
import NumberInput from "@/components/NumberInput";
import ProductPicker, { type ProductOption } from "@/components/ProductPicker";
import type { PpicItem, PpicPlanTerbuka, PpicStatus } from "@/lib/ppic";
import type { BahanRnd } from "@/lib/rndCost";
import {
  hitungRndPpic,
  rndRencanaKeQuery,
  type RndBahanStok,
  type RndPemakaian,
  type RndPpicFormula,
  type RndRencana,
} from "@/lib/rndPpic";

type Row = { formulaId: string; pcs: string };

const BARIS_KOSONG: Row = { formulaId: "", pcs: "1000" };

const WARNA_STATUS: Record<PpicStatus | "Belum Dimiliki" | "Kemasan Ketikan", string> = {
  "Perlu Beli": "bg-clay-100 text-clay-600",
  "PO Belum Dikirim": "bg-white/80 text-muted border border-line",
  "Menunggu Kedatangan": "bg-white/80 text-ink border border-line",
  "Menunggu QC": "bg-amber-100 text-amber-500",
  Cukup: "bg-botanical-100 text-botanical-700",
  "Belum Dimiliki": "bg-amber-100 text-amber-500",
  "Kemasan Ketikan": "bg-white/80 text-muted border border-line",
};

const ANGKA = "whitespace-nowrap tabular-nums";

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function formatNum(n: number, maxDec = 3) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: maxDec });
}
function angkaAtauStrip(n: number) {
  return Math.abs(n) > 1e-9 ? formatNum(n) : "-";
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function keRencana(rows: Row[]): RndRencana[] {
  return rows.map((r) => ({ formulaId: r.formulaId, pcs: Math.round(parseNum(r.pcs)) }));
}

function Pil({ status }: { status: string }) {
  const warna =
    WARNA_STATUS[status as keyof typeof WARNA_STATUS] ??
    "bg-white/80 text-ink border border-line";
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

/** "untuk RND.202609001 · RND.202609004", cuma kalau lebih dari satu formula. */
function teksUntuk(untuk: RndPemakaian[]) {
  if (untuk.length < 2) return null;
  return "untuk " + untuk.map((u) => u.formula.noFormula).join(" · ");
}

/** Satu baris di tabel Dana Pembelian, dari tiga asal yang berbeda. */
type BarisBeli = {
  key: string;
  kode: string;
  nama: string;
  satuan: string;
  supplier: string | null;
  status: string;
  butuh: number;
  /** stok + karantina + PO yang ikut menutup, null bila tidak berlaku */
  tertutup: number | null;
  qtyBeli: number;
  moq: number | null;
  harga: number | null;
  hargaReferensi: boolean;
  dana: number | null;
  untuk: RndPemakaian[];
};

export default function RndPpicPlanner({
  formulas,
  bahan,
  items,
  planTerbuka,
  rencanaAwal,
  gagalMuat,
}: {
  formulas: RndPpicFormula[];
  bahan: BahanRnd[];
  items: PpicItem[];
  planTerbuka: PpicPlanTerbuka[];
  rencanaAwal: RndRencana[];
  gagalMuat: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    rencanaAwal.length > 0
      ? rencanaAwal.map((r) => ({ formulaId: r.formulaId, pcs: String(r.pcs) }))
      : [{ ...BARIS_KOSONG }]
  );

  /** Ubah rencana sekaligus tulis ke URL, di handler, bukan useEffect. */
  function ubahRows(baru: Row[]) {
    setRows(baru);
    const q = rndRencanaKeQuery(keRencana(baru));
    window.history.replaceState(null, "", q ? `/rnd/ppic?r=${q}` : "/rnd/ppic");
  }

  const pilihan: ProductOption[] = formulas.map((f) => ({
    key: f.id,
    label: `${f.noFormula}, ${f.nama} (${f.status})`,
    brand: f.brand,
    varian: "-",
    available: 0,
    service_id: null,
  }));

  const hasil = hitungRndPpic({
    formulas,
    bahan,
    items,
    planTerbuka,
    rencana: keRencana(rows),
  });

  const perluBeli: BarisBeli[] = [
    ...hasil.bahan
      .filter((c) => c.qtyBeli > 0)
      .map(
        (c): BarisBeli => ({
          key: `item:${c.item.id}`,
          kode: c.item.kode,
          nama: c.item.nama,
          satuan: c.item.satuan,
          supplier: c.supplier,
          status: c.status,
          butuh: c.butuh,
          tertutup: c.item.stok + c.qtyKarantina + c.qtyPoDikirim + c.qtyPoBelumDikirim - c.alokasi,
          qtyBeli: c.qtyBeli,
          moq: c.item.moq,
          harga: c.harga,
          hargaReferensi: c.hargaReferensi,
          dana: c.dana,
          untuk: c.untuk,
        })
      ),
    ...hasil.baru.map(
      (b): BarisBeli => ({
        key: b.bahan.key,
        kode: b.bahan.kode,
        nama: b.bahan.nama,
        satuan: b.bahan.satuan,
        supplier: b.bahan.supplier,
        status: "Belum Dimiliki",
        butuh: b.butuh,
        tertutup: null,
        qtyBeli: b.qtyBeli,
        moq: b.bahan.moq,
        harga: b.bahan.harga,
        hargaReferensi: b.bahan.harga != null && !b.bahan.pernahDibeli,
        dana: b.dana,
        untuk: b.untuk,
      })
    ),
    ...hasil.manual.map(
      (m): BarisBeli => ({
        key: `manual:${m.nama}`,
        kode: "-",
        nama: m.nama,
        satuan: "pcs",
        supplier: null,
        status: "Kemasan Ketikan",
        butuh: m.qty,
        tertutup: null,
        qtyBeli: m.qty,
        moq: null,
        harga: m.harga,
        hargaReferensi: false,
        dana: m.dana,
        untuk: m.untuk,
      })
    ),
  ].sort(
    (a, b) =>
      (a.supplier ?? "￿").localeCompare(b.supplier ?? "￿", "id") ||
      a.nama.localeCompare(b.nama, "id")
  );

  const jumlahSupplier = new Set(perluBeli.map((b) => b.supplier ?? "")).size;
  const adaRencana = hasil.rencana.length > 0;

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <div className="flex flex-col gap-4">
      {gagalMuat && (
        <p className="text-clay-600 text-[12.5px] bg-clay-100 rounded-lg px-3 py-2">
          Sebagian data formula, stok, plan produksi, karantina, atau PO gagal
          dimuat, jadi angka di bawah bisa keliru. Muat ulang halaman sebelum
          dipakai.
        </p>
      )}

      {/* relative + z-20: daftar saran pemilih harus tampil di atas kartu
          hasil di bawahnya, `.glass` membentuk stacking context. */}
      <div className="relative z-20 glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-ink">
              Rencana Launching
            </h3>
            <p className="text-muted text-[12px]">
              Formula yang mau diproduksi dan jumlahnya dalam pcs. Formula Arsip
              tidak ikut dipilih.
            </p>
          </div>
          <button
            type="button"
            onClick={() => ubahRows([...rows, { ...BARIS_KOSONG }])}
            className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline"
          >
            <Plus size={14} /> Tambah Formula
          </button>
        </div>

        {rows.map((row, idx) => {
          const f = formulas.find((x) => x.id === row.formulaId);
          const pcs = Math.round(parseNum(row.pcs));
          const baris = hasil.rencana.find((r) => r.formula.id === row.formulaId);
          return (
            <div
              key={idx}
              className="flex flex-col gap-1 rounded-xl border border-line/70 bg-white/40 p-3 sm:border-0 sm:bg-transparent sm:p-0"
            >
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_1fr_32px] gap-2 items-center">
                <ProductPicker
                  options={pilihan}
                  value={row.formulaId}
                  onChange={(key) =>
                    ubahRows(rows.map((r, i) => (i === idx ? { ...r, formulaId: key } : r)))
                  }
                  placeholder="Ketik no. formula / nama produk / brand..."
                  showStock={false}
                />
                <NumberInput
                  value={row.pcs}
                  onChange={(nilai) =>
                    ubahRows(rows.map((r, i) => (i === idx ? { ...r, pcs: nilai } : r)))
                  }
                  bulat
                  placeholder="Jumlah pcs"
                  className={inputCls}
                />
                <div className="text-[12.5px] text-muted">
                  {f
                    ? f.nettoGram && f.nettoGram > 0
                      ? `${formatNum(f.nettoGram)} g/pcs = ${formatNum((pcs * f.nettoGram) / 1000)} kg ruahan`
                      : "⚠ gramasi per pcs belum diisi"
                    : ""}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    ubahRows(
                      rows.length > 1 ? rows.filter((_, i) => i !== idx) : [{ ...BARIS_KOSONG }]
                    )
                  }
                  className="text-muted hover:text-clay-600 p-2 justify-self-end"
                  aria-label="Hapus baris"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {f && (
                <p className="text-[11.5px] text-muted">
                  {[
                    f.brand ? `Brand ${f.brand}` : "Tanpa brand",
                    `${f.formula.length} bahan, ${f.kemasan.length} kemasan`,
                    baris?.biayaPerPcs != null
                      ? `perkiraan ${formatRupiah(baris.biayaPerPcs)}/pcs`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  ·{" "}
                  <Link
                    href={`/rnd/${f.id}?tab=biaya`}
                    className="text-botanical-700 hover:underline"
                  >
                    buka formula
                  </Link>
                </p>
              )}
            </div>
          );
        })}

        {hasil.tanpaGramasi.length > 0 && (
          <p className="text-amber-500 text-[12px] bg-amber-100 rounded-lg px-3 py-2">
            Gramasi per pcs belum diisi di{" "}
            {hasil.tanpaGramasi.map((f) => f.noFormula).join(", ")}, jadi bahan
            bakunya belum ikut dihitung (kemasan tetap ikut). Isi lewat Ubah
            Formula.
          </p>
        )}
        {hasil.tidakDitemukan > 0 && (
          <p className="text-amber-500 text-[12px] bg-amber-100 rounded-lg px-3 py-2">
            {hasil.tidakDitemukan} formula di tautan ini tidak ditemukan lagi
            (sudah diarsipkan atau dihapus), jadi tidak ikut dihitung.
          </p>
        )}
      </div>

      {adaRencana && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Ringkasan
            label="Dana Pembelian"
            nilai={formatRupiah(hasil.totalDana)}
            keterangan={
              hasil.tanpaHarga.length > 0
                ? "tanpa PPN · belum termasuk bahan tanpa harga"
                : "tanpa PPN · yang harus dibeli sekarang"
            }
            nada="text-botanical-700"
          />
          <Ringkasan
            label="Biaya Bahan Produksi"
            nilai={formatRupiah(hasil.biayaBahan)}
            keterangan="nilai bahan & kemasan terpakai, stok sendiri ikut dihitung"
          />
          <Ringkasan
            label="Perlu Dibeli"
            nilai={`${perluBeli.length.toLocaleString("id-ID")} bahan`}
            keterangan={
              perluBeli.length > 0 ? `dari ${jumlahSupplier} supplier` : "semua sudah tertutup"
            }
            nada={perluBeli.length > 0 ? "text-clay-600" : "text-botanical-700"}
          />
          <Ringkasan
            label="Belum Dimiliki"
            nilai={`${hasil.baru.length.toLocaleString("id-ID")} bahan`}
            keterangan={
              hasil.baru.length > 0
                ? `${formatRupiah(hasil.danaBaru)}, daftarkan dulu jadi item stok`
                : "semua bahan sudah punya item stok"
            }
            nada={hasil.baru.length > 0 ? "text-amber-500" : "text-ink"}
          />
        </div>
      )}

      {/* ===== Per formula ===== */}
      {adaRencana && (
        <div className="glass rounded-2xl overflow-hidden">
          <KepalaKartu
            ikon={<FlaskConical size={16} />}
            warnaIkon="bg-botanical-100 text-botanical-700"
            judul="Biaya per Formula"
            keterangan="Perkiraan dari harga pembelian terakhir, atau harga referensi untuk bahan yang belum pernah dibeli. Bukan HPP."
          />
          <div className="px-6 pb-5">
            <DataTable
              rows={hasil.rencana}
              rowKey={(r, i) => `${r.formula.id}-${i}`}
              minWidth={760}
              chrome="bare"
              maxHeight={false}
              footer={{
                row: (
                  <tr className="font-semibold">
                    <td className="px-4 py-2.5 text-right" colSpan={4}>
                      Total
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                      {formatRupiah(hasil.biayaBahan)}
                    </td>
                  </tr>
                ),
                card: (
                  <div className="flex justify-between font-semibold">
                    <span>Total biaya bahan</span>
                    <span>{formatRupiah(hasil.biayaBahan)}</span>
                  </div>
                ),
              }}
              columns={[
                {
                  key: "formula",
                  header: "Formula",
                  role: "title",
                  cell: (r) => (
                    <>
                      <div className="font-medium">{r.formula.nama}</div>
                      <div className="text-[11px] text-muted">
                        <span className="font-mono">{r.formula.noFormula}</span>
                        {r.formula.brand ? ` · ${r.formula.brand}` : ""}
                      </div>
                    </>
                  ),
                },
                {
                  key: "pcs",
                  header: "Pcs",
                  role: "primary",
                  align: "right",
                  className: ANGKA,
                  cell: (r) => formatNum(r.pcs, 0),
                },
                {
                  key: "ruahan",
                  header: "Ruahan",
                  role: "primary",
                  align: "right",
                  className: ANGKA,
                  cell: (r) => (r.ruahanKg > 0 ? `${formatNum(r.ruahanKg)} kg` : "-"),
                },
                {
                  key: "perpcs",
                  header: "Biaya / pcs",
                  role: "primary",
                  align: "right",
                  className: ANGKA,
                  cell: (r) => (r.biayaPerPcs == null ? "-" : formatRupiah(r.biayaPerPcs)),
                },
                {
                  key: "total",
                  header: "Biaya Total",
                  role: "primary",
                  align: "right",
                  className: `${ANGKA} font-medium`,
                  cell: (r) =>
                    r.biayaTotal == null ? (
                      <span className="text-muted font-normal">gramasi kosong</span>
                    ) : (
                      formatRupiah(r.biayaTotal)
                    ),
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* ===== Dana pembelian ===== */}
      {adaRencana && (
        <div className="glass rounded-2xl overflow-hidden">
          <KepalaKartu
            ikon={<ShoppingCart size={16} />}
            warnaIkon="bg-clay-100 text-clay-600"
            judul="Dana Pembelian"
            keterangan={
              perluBeli.length > 0
                ? `${perluBeli.length} bahan dari ${jumlahSupplier} supplier · Qty Beli sudah dikurangi stok, karantina, dan PO terbuka, lalu dibulatkan MOQ`
                : "Tidak ada yang perlu dibeli: stok, karantina, dan PO terbuka sudah menutup seluruh kebutuhan."
            }
          />
          {perluBeli.length > 0 && (
            <div className="px-6 pb-5">
              <DataTable
                rows={perluBeli}
                rowKey={(b) => b.key}
                minWidth={980}
                chrome="bare"
                maxHeight={false}
                groupBy={{
                  key: (b) => b.supplier ?? "",
                  header: (g) => (
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-ink">
                        {g.key || "Supplier belum diketahui"}
                      </span>
                      <span className="text-muted text-[12px]">
                        {g.rows.length} bahan ·{" "}
                        {formatRupiah(g.rows.reduce((s, b) => s + (b.dana || 0), 0))}
                      </span>
                    </span>
                  ),
                }}
                footer={{
                  row: (
                    <tr className="font-semibold">
                      <td className="px-4 py-2.5 text-right" colSpan={6}>
                        Total dana pembelian (tanpa PPN)
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-botanical-700">
                        {formatRupiah(hasil.totalDana)}
                      </td>
                    </tr>
                  ),
                  card: (
                    <div className="flex justify-between font-semibold">
                      <span>Total dana (tanpa PPN)</span>
                      <span className="text-botanical-700">{formatRupiah(hasil.totalDana)}</span>
                    </div>
                  ),
                }}
                columns={[
                  {
                    key: "bahan",
                    header: "Bahan",
                    role: "title",
                    cell: (b) => (
                      <>
                        <div className="font-medium max-w-[260px] truncate" title={b.nama}>
                          {b.nama}
                        </div>
                        <div className="text-[11px] text-muted">
                          <span className="font-mono">{b.kode}</span> · {b.satuan}
                          {teksUntuk(b.untuk) ? ` · ${teksUntuk(b.untuk)}` : ""}
                        </div>
                      </>
                    ),
                  },
                  {
                    key: "status",
                    header: "Status",
                    role: "badge",
                    cell: (b) => <Pil status={b.status} />,
                  },
                  {
                    key: "butuh",
                    header: "Butuh Launching",
                    role: "primary",
                    align: "right",
                    className: ANGKA,
                    cell: (b) => formatNum(b.butuh),
                  },
                  {
                    key: "tertutup",
                    header: "Stok + Proses",
                    role: "secondary",
                    align: "right",
                    className: ANGKA,
                    cell: (b) =>
                      b.tertutup == null ? (
                        <span className="text-muted">belum ada</span>
                      ) : (
                        angkaAtauStrip(Math.max(0, b.tertutup))
                      ),
                  },
                  {
                    key: "beli",
                    header: "Qty Beli",
                    role: "primary",
                    align: "right",
                    className: `${ANGKA} font-semibold`,
                    cell: (b) => (
                      <>
                        <span className="text-botanical-700">{formatNum(b.qtyBeli)}</span>
                        {b.moq && b.moq > 0 ? (
                          <div className="text-[10.5px] text-muted font-normal">
                            MOQ {formatNum(b.moq)}
                          </div>
                        ) : b.status !== "Kemasan Ketikan" ? (
                          <div className="text-[10.5px] text-amber-500 font-normal">
                            MOQ belum diisi
                          </div>
                        ) : null}
                      </>
                    ),
                  },
                  {
                    key: "harga",
                    header: "Harga",
                    role: "secondary",
                    align: "right",
                    className: ANGKA,
                    cell: (b) =>
                      b.harga == null ? (
                        <span className="text-clay-600">belum ada</span>
                      ) : (
                        <>
                          {formatRupiah(b.harga)}
                          {b.hargaReferensi && (
                            <div className="text-[10.5px] text-muted">harga referensi</div>
                          )}
                          {b.status === "Kemasan Ketikan" && (
                            <div className="text-[10.5px] text-muted">harga estimasi</div>
                          )}
                        </>
                      ),
                  },
                  {
                    key: "dana",
                    header: "Dana",
                    role: "primary",
                    align: "right",
                    className: `${ANGKA} font-semibold`,
                    cell: (b) => (b.dana == null ? "-" : formatRupiah(b.dana)),
                  },
                ]}
              />

              <div className="mt-3 grid gap-1 text-[11.5px] text-muted leading-snug">
                {hasil.tanpaHarga.length > 0 && (
                  <p className="text-clay-600">
                    Belum punya acuan harga sama sekali, jadi dananya dihitung nol:{" "}
                    {hasil.tanpaHarga.join(", ")}. Isi Harga Referensi di menu
                    Materials supaya ikut terhitung.
                  </p>
                )}
                {hasil.tanpaMoq.length > 0 && (
                  <p>
                    MOQ belum diisi untuk {hasil.tanpaMoq.length} bahan, jadi Qty
                    Beli-nya sama dengan kekurangan. Isi di{" "}
                    <Link href="/items" className="text-botanical-700 hover:underline">
                      Stock Items
                    </Link>{" "}
                    atau master Material kalau suppliernya punya minimum order.
                  </p>
                )}
                {hasil.baru.length > 0 && (
                  <p>
                    Bahan <b className="text-ink">Belum Dimiliki</b> harus
                    didaftarkan dulu lewat{" "}
                    <Link
                      href="/items/from-material"
                      className="text-botanical-700 hover:underline"
                    >
                      Tambah Item dari Material
                    </Link>{" "}
                    sebelum bisa dibuatkan PO.
                  </p>
                )}
                <p>
                  Harga tanpa PPN, sama dengan HPP pembelian. Uang yang benar-benar
                  keluar ke supplier PKP lebih besar sebesar pajaknya.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Neraca bahan ===== */}
      {hasil.bahan.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <KepalaKartu
            ikon={<PackageSearch size={16} />}
            warnaIkon="bg-botanical-100 text-botanical-700"
            judul="Neraca Bahan"
            keterangan="Bahan yang sudah punya item stok. Tangga persediaannya sama persis dengan PPIC Planner."
          />
          <div className="px-6 pb-5">
            <DataTable
              rows={hasil.bahan}
              rowKey={(c) => c.item.id}
              minWidth={960}
              chrome="bare"
              maxHeight={false}
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
                  cell: (c: RndBahanStok) => (
                    <>
                      <div className="font-medium truncate max-w-[240px]" title={c.item.nama}>
                        {c.item.nama}
                      </div>
                      <div className="text-[11px] text-muted">
                        <span className="font-mono">{c.item.kode}</span> · {c.item.satuan}
                      </div>
                    </>
                  ),
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
                  key: "butuh",
                  header: "Butuh Launching",
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
                <b className="text-ink">Kekurangan</b> = Plan Berjalan + Butuh
                Launching, dikurangi Stok Sisa. <b className="text-ink">Qty Beli</b>{" "}
                = Kekurangan dikurangi Karantina / PO, dibulatkan ke atas mengikuti
                MOQ.
              </p>
              {hasil.planTerlibat.length > 0 && (
                <p>
                  Plan Produksi yang belum Input Hasil ikut menahan stok:{" "}
                  {hasil.planTerlibat
                    .map((p) => `${p.noBatch} (${p.produk})`)
                    .join(", ")}
                  . Kalau stoknya dipakai plan itu, launching harus membeli
                  sendiri.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {!adaRencana && (
        <div className="glass rounded-2xl p-8 text-center text-muted text-sm flex flex-col items-center gap-2">
          <Coins size={22} className="text-botanical-700" />
          Pilih formula dan jumlah pcs untuk melihat dana yang harus disiapkan.
        </div>
      )}
    </div>
  );
}
