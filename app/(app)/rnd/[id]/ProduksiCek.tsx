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

   Angkanya simulasi, tidak menulis apa pun. Yang ditulis ke stok
   tetap cuma dokumen produksi.
   ============================================================ */

import { useState } from "react";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import NumberInput from "@/components/NumberInput";
import DataTable from "@/components/DataTable";
import StokKurangAlert from "@/components/StokKurangAlert";
import { hitungKekurangan, type ItemStok } from "@/lib/stokCek";
import {
  hitungBiayaFormula,
  kebutuhanProduksi,
  type BarisFormula,
  type BarisKemasan,
  type ItemRnd,
} from "@/lib/rndCost";

type Baris = {
  item_id: string;
  kode: string;
  nama: string;
  satuan: string;
  butuh: number;
  stok: number;
  kurang: number;
  supplier: string | null;
  harga: number | null;
};

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
function angka(n: number, desimal = 3) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: desimal });
}

export default function ProduksiCek({
  formula,
  kemasan,
  nettoGram,
  items,
  ppicHref,
}: {
  formula: BarisFormula[];
  kemasan: BarisKemasan[];
  nettoGram: number | null;
  items: ItemRnd[];
  ppicHref: string | null;
}) {
  const [pcsStr, setPcsStr] = useState("1000");
  const pcs = Math.max(0, Math.round(parseFloat(pcsStr.replace(",", ".")) || 0));

  const itemOf = (id: string) => items.find((i) => i.id === id);

  const biaya = hitungBiayaFormula(formula, kemasan, nettoGram, itemOf);
  const { ruahanKg, perItem } = kebutuhanProduksi(formula, kemasan, pcs, nettoGram);

  const kekurangan = hitungKekurangan(perItem, (id): ItemStok | undefined =>
    itemOf(id)
  );

  const baris: Baris[] = Array.from(perItem, ([item_id, butuh]) => {
    const it = itemOf(item_id);
    const stok = it?.stok ?? 0;
    return {
      item_id,
      kode: it?.kode || "-",
      nama: it?.nama || "Item tidak dikenal",
      satuan: it?.satuan || "",
      butuh,
      stok,
      kurang: Math.max(0, butuh - stok),
      supplier: it?.supplier ?? null,
      harga: it?.harga ?? null,
    };
  }).sort((a, b) => b.kurang - a.kurang || a.kode.localeCompare(b.kode));

  const totalProduksi =
    biaya.totalPerPcs == null ? null : biaya.totalPerPcs * pcs;

  // Kemasan yang belum ada di master sengaja tidak ikut dicek stoknya
  // (lihat kebutuhanProduksi), jadi disebut terpisah supaya tidak
  // disangka sudah tersedia.
  const kemasanBelumTerdaftar = kemasan
    .filter((k) => !k.item_id && k.nama)
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
            {kekurangan.length === 0
              ? "semua bahan tersedia"
              : `${kekurangan.length} bahan perlu diadakan`}
          </span>
        </div>

        <DataTable
          rows={baris}
          rowKey={(r) => r.item_id}
          minWidth={880}
          chrome="bare"
          maxHeight={false}
          empty="Isi gramasi produk dan jumlah pcs untuk melihat kebutuhannya."
          rowClassName={(r) => (r.kurang > 0 ? "bg-clay-100/25" : "")}
          columns={[
            {
              key: "item",
              header: "Bahan",
              role: "title",
              cell: (r) => (
                <>
                  <div className="font-medium">{r.nama}</div>
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
              cell: (r) => `${angka(r.stok)} ${r.satuan}`,
            },
            {
              key: "kurang",
              header: "Perlu Diadakan",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap font-medium",
              cell: (r) =>
                r.kurang > 0 ? (
                  <span className="text-clay-600">
                    {angka(r.kurang)} {r.satuan}
                  </span>
                ) : (
                  <span className="text-muted">-</span>
                ),
            },
            {
              key: "nilai",
              header: "Perkiraan Nilai",
              role: "secondary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) =>
                r.harga == null ? "-" : rupiah(r.butuh * r.harga),
            },
            {
              key: "supplier",
              header: "Supplier",
              role: "secondary",
              cell: (r) => r.supplier || "-",
            },
          ]}
        />

        {kemasanBelumTerdaftar.length > 0 && (
          <p className="text-muted text-[12px] mt-3">
            Belum ada di master item, jadi stoknya tidak ikut dicek:{" "}
            {kemasanBelumTerdaftar.join(", ")}.
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
