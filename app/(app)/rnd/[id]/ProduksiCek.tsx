"use client";

/* ============================================================
   "Kalau formula ini diproduksi sekian pcs, apa yang kurang?"

   Pertanyaan itu muncul jauh sebelum ada plan produksi, biasanya
   sambil menyusun penawaran ke client. Jawabannya butuh tiga angka
   yang selama ini terpisah: formula, stok gudang, dan harga bahan.

   Peringatan kekurangannya memakai komponen yang SAMA dengan alur
   produksi (`StokKurangAlert`), dan pembandingnya juga sama,
   `purchase_batches.qty_sisa`. Dua layar yang menjawab pertanyaan
   yang sama dengan angka berbeda adalah cara tercepat membuat orang
   berhenti percaya pada dua-duanya.

   BAHAN YANG BELUM PUNYA ITEM STOK DIPISAH, BUKAN DIBILANG KURANG

   Formula R&D boleh memuat bahan yang belum pernah diadakan. Bahan
   seperti itu tidak punya stok untuk dibandingkan, dan menyebutnya
   "kurang 12 kg" salah alamat: yang harus dikerjakan bukan membeli
   lagi, melainkan mendaftarkannya dulu jadi item stok. Dua tindakan
   berbeda, jadi dua daftar berbeda.

   Angkanya simulasi, tidak menulis apa pun. Yang ditulis ke stok
   tetap cuma dokumen produksi.
   ============================================================ */

import { useState } from "react";
import Link from "next/link";
import { PackagePlus, ShoppingCart } from "lucide-react";
import NumberInput from "@/components/NumberInput";
import DataTable from "@/components/DataTable";
import StokKurangAlert from "@/components/StokKurangAlert";
import { hitungKekurangan, type ItemStok } from "@/lib/stokCek";
import {
  hitungBiayaFormula,
  kebutuhanProduksi,
  keItemStok,
  LABEL_KETERSEDIAAN,
  type BahanRnd,
  type BarisFormula,
  type BarisKemasan,
} from "@/lib/rndCost";
import BahanStatus from "../BahanStatus";

type Baris = {
  rowKey: string;
  kode: string;
  nama: string;
  satuan: string;
  butuh: number;
  stok: number;
  kurang: number;
  supplier: string | null;
  harga: number | null;
  /** false = harganya cuma referensi dari master material */
  pernahDibeli: boolean;
  /** MOQ yang berlaku, untuk membaca "kurangnya sedikit tapi belinya sekarung" */
  moq: number | null;
  /** null = belum dimiliki, jadi belum bisa dibeli sama sekali */
  item_id: string | null;
};

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
function angka(n: number, desimal = 3) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: desimal });
}

/**
 * Qty yang benar-benar harus dibeli setelah dibulatkan ke kelipatan MOQ.
 *
 * Rumusnya sama persis dengan PPIC Planner dan Guide Order, termasuk
 * toleransi 1e-9 untuk galat float. Angka yang berbeda antara layar R&D
 * dan layar yang benar-benar menerbitkan PO akan membuat perkiraan biaya
 * di sini selalu meleset di bawah.
 */
function bulatkanMoq(kurang: number, moq: number | null): number {
  if (!moq || moq <= 0) return kurang;
  return Math.ceil(kurang / moq - 1e-9) * moq;
}

export default function ProduksiCek({
  formula,
  kemasan,
  nettoGram,
  bahan,
  ppicHref,
}: {
  formula: BarisFormula[];
  kemasan: BarisKemasan[];
  nettoGram: number | null;
  bahan: BahanRnd[];
  ppicHref: string | null;
}) {
  const [pcsStr, setPcsStr] = useState("1000");
  const pcs = Math.max(0, Math.round(parseFloat(pcsStr.replace(",", ".")) || 0));

  const bahanOf = (key: string) => bahan.find((b) => b.key === key);
  // Dua materials bisa saja menunjuk item yang sama; yang pertama
  // dipakai untuk nama & suppliernya, angkanya toh dari item itu juga.
  const bahanByItem = new Map<string, BahanRnd>();
  for (const b of bahan) {
    if (b.item_id && !bahanByItem.has(b.item_id)) bahanByItem.set(b.item_id, b);
  }

  const biaya = hitungBiayaFormula(formula, kemasan, nettoGram, bahanOf);
  const { ruahanKg, perItem, belumAdaStok } = kebutuhanProduksi(
    formula,
    kemasan,
    pcs,
    nettoGram,
    bahanOf
  );

  const kekurangan = hitungKekurangan(perItem, (itemId): ItemStok | undefined => {
    const b = bahanByItem.get(itemId);
    return b ? keItemStok(b) : undefined;
  });

  const barisStok: Baris[] = Array.from(perItem, ([itemId, butuh]) => {
    const b = bahanByItem.get(itemId);
    const stok = b?.stok ?? 0;
    return {
      rowKey: `item:${itemId}`,
      kode: b?.kode || "-",
      nama: b?.nama || "Bahan tidak dikenal",
      satuan: b?.satuan || "",
      butuh,
      stok,
      kurang: Math.max(0, butuh - stok),
      supplier: b?.supplier ?? null,
      harga: b?.harga ?? null,
      pernahDibeli: !!b?.pernahDibeli,
      moq: b?.moq ?? null,
      item_id: itemId,
    };
  });

  const barisBaru: Baris[] = Array.from(belumAdaStok, ([key, butuh]) => {
    const b = bahanOf(key);
    return {
      rowKey: key,
      kode: b?.kode || "-",
      nama: b?.nama || "Bahan tidak dikenal",
      satuan: b?.satuan || "",
      butuh,
      stok: 0,
      kurang: butuh,
      supplier: b?.supplier ?? null,
      harga: b?.harga ?? null,
      pernahDibeli: !!b?.pernahDibeli,
      moq: b?.moq ?? null,
      item_id: null,
    };
  });

  const baris = [...barisStok, ...barisBaru].sort(
    (a, b) =>
      Number(!!a.item_id) - Number(!!b.item_id) ||
      b.kurang - a.kurang ||
      a.kode.localeCompare(b.kode)
  );

  const totalProduksi =
    biaya.totalPerPcs == null ? null : biaya.totalPerPcs * pcs;

  // Kemasan yang tidak menunjuk master apa pun (cuma nama ketikan)
  // sengaja tidak ikut dicek, jadi disebut terpisah supaya tidak
  // disangka sudah tersedia.
  const kemasanTanpaMaster = kemasan
    .filter((k) => !k.key && k.nama)
    .map((k) => k.nama as string);

  return (
    <div className="flex flex-col gap-4">
      <div className="glass rounded-2xl p-6">
        <h2 className="font-display text-[15.5px] font-semibold text-ink">
          Simulasi Produksi
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Perkiraan, bukan dokumen. Tidak ada stok yang bergerak dari layar ini.
        </p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-4 items-start">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Rencana produksi (pcs)
            </label>
            <NumberInput
              value={pcsStr}
              onChange={setPcsStr}
              bulat
              placeholder="1000"
              className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Ruahan dibuat",
                nilai:
                  nettoGram && nettoGram > 0
                    ? `${angka(ruahanKg)} kg`
                    : "gramasi kosong",
              },
              { label: "Bahan", nilai: rupiah(biaya.bahanPerKg * ruahanKg) },
              { label: "Kemasan", nilai: rupiah(biaya.kemasanPerPcs * pcs) },
              {
                label: "Total",
                nilai: totalProduksi == null ? "-" : rupiah(totalProduksi),
              },
            ].map((k) => (
              <div
                key={k.label}
                className="rounded-xl bg-botanical-100/40 px-3 py-2.5"
              >
                <div className="text-muted text-[11.5px]">{k.label}</div>
                <div className="font-display text-[15px] font-semibold text-ink mt-0.5">
                  {k.nilai}
                </div>
              </div>
            ))}
          </div>
        </div>

        {(!nettoGram || nettoGram <= 0) && (
          <p className="text-clay-600 text-[12px] mt-3">
            Gramasi produk per pcs belum diisi, jadi kebutuhan bahannya belum
            bisa dihitung. Isi lewat Ubah Formula.
          </p>
        )}
      </div>

      {barisBaru.length > 0 && (
        <div className="glass rounded-2xl border-amber-100 p-4 sm:p-5 flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <span className="bg-amber-100 text-amber-500 rounded-lg p-1.5 flex-shrink-0">
              <PackagePlus size={16} />
            </span>
            <div className="min-w-0">
              <div className="font-display text-[14.5px] font-semibold text-ink">
                {barisBaru.length} bahan belum dimiliki
              </div>
              <p className="text-muted text-[12.5px] mt-0.5 leading-snug">
                {LABEL_KETERSEDIAAN["belum-dimiliki"].judul} Selama itu belum
                dikerjakan, bahan ini tidak bisa ikut dihitung sebagai kurang
                stok, karena stoknya memang belum ada untuk dibandingkan.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {barisBaru.map((b) => (
              <div
                key={b.rowKey}
                className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-3 rounded-lg bg-amber-100/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="font-mono text-[11.5px] text-muted">
                    {b.kode}
                  </span>{" "}
                  <span className="text-[13px] font-medium text-ink">
                    {b.nama}
                  </span>
                </div>
                <div className="text-[12px] whitespace-nowrap flex-shrink-0 text-muted">
                  butuh {angka(b.butuh)} {b.satuan}
                  {b.supplier ? ` · ${b.supplier}` : ""}
                </div>
              </div>
            ))}
          </div>

          <Link
            href="/items/from-material"
            className="inline-flex items-center gap-1.5 text-botanical-700 text-[12.5px] font-medium hover:underline"
          >
            <PackagePlus size={14} /> Tambah Item dari Material
          </Link>
        </div>
      )}

      <StokKurangAlert
        kekurangan={kekurangan}
        keterangan={`untuk ${pcs.toLocaleString("id-ID")} pcs`}
        ppicHref={ppicHref}
      />

      <div className="glass rounded-2xl p-6">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Kebutuhan Bahan
          </h2>
          <span className="text-muted text-[12.5px]">
            {kekurangan.length + barisBaru.length === 0
              ? "semua bahan tersedia"
              : `${kekurangan.length + barisBaru.length} bahan perlu diadakan`}
          </span>
        </div>

        <DataTable
          rows={baris}
          rowKey={(r) => r.rowKey}
          minWidth={900}
          chrome="bare"
          maxHeight={false}
          empty="Isi gramasi produk dan jumlah pcs untuk melihat kebutuhannya."
          rowClassName={(r) =>
            !r.item_id
              ? "bg-amber-100/25"
              : r.kurang > 0
                ? "bg-clay-100/25"
                : ""
          }
          columns={[
            {
              key: "item",
              header: "Bahan",
              role: "title",
              cell: (r) => (
                <>
                  <div className="font-medium flex items-center gap-1.5">
                    <span>{r.nama}</span>
                    <BahanStatus bahan={r} ukuran="kecil" />
                  </div>
                  <div className="text-[11px] text-muted font-mono">{r.kode}</div>
                </>
              ),
            },
            {
              key: "butuh",
              header: "Butuh",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) => `${angka(r.butuh)} ${r.satuan}`,
            },
            {
              key: "stok",
              header: "Stok Siap Pakai",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) =>
                r.item_id ? (
                  `${angka(r.stok)} ${r.satuan}`
                ) : (
                  <span className="text-muted">belum ada</span>
                ),
            },
            {
              key: "kurang",
              header: "Perlu Diadakan",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap font-medium",
              cell: (r) => {
                if (r.kurang <= 0) return <span className="text-muted">-</span>;
                const beli = bulatkanMoq(r.kurang, r.moq);
                return (
                  <>
                    <span
                      className={r.item_id ? "text-clay-600" : "text-amber-500"}
                    >
                      {angka(r.kurang)} {r.satuan}
                    </span>
                    {/* MOQ sering jauh di atas kebutuhan trial. Butuh 2 kg
                        tapi minimum belinya 25 kg adalah keputusan biaya,
                        bukan detail pembelian, jadi disebut di sini. */}
                    {beli > r.kurang && (
                      <div className="text-[10.5px] text-muted font-normal">
                        beli {angka(beli)} (MOQ {angka(r.moq ?? 0)})
                      </div>
                    )}
                  </>
                );
              },
            },
            {
              key: "moq",
              header: "MOQ",
              role: "secondary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) =>
                r.moq && r.moq > 0 ? `${angka(r.moq)} ${r.satuan}` : "-",
            },
            {
              key: "nilai",
              header: "Perkiraan Nilai",
              role: "secondary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) =>
                r.harga == null ? (
                  "-"
                ) : (
                  <>
                    {rupiah(r.butuh * r.harga)}
                    {!r.pernahDibeli && (
                      <div className="text-[10.5px] text-muted">
                        harga referensi
                      </div>
                    )}
                  </>
                ),
            },
            {
              key: "supplier",
              header: "Supplier",
              role: "secondary",
              cell: (r) => r.supplier || "-",
            },
          ]}
        />

        {kemasanTanpaMaster.length > 0 && (
          <p className="text-muted text-[12px] mt-3">
            Belum terdaftar di master mana pun, jadi tidak ikut dicek:{" "}
            {kemasanTanpaMaster.join(", ")}.
          </p>
        )}

        {ppicHref && kekurangan.length > 0 && (
          <Link
            href={ppicHref}
            className="inline-flex items-center gap-1.5 text-botanical-700 text-[12.5px] font-medium hover:underline mt-3"
          >
            <ShoppingCart size={14} /> Susun rencana pembelian di PPIC Planner
          </Link>
        )}
      </div>
    </div>
  );
}
