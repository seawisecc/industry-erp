"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reportConsignmentSale, closeConsignment } from "../actions";
import { computeTotals } from "@/lib/invoiceMath";
import DataTable from "@/components/DataTable";
import { useConfirmSave } from "@/components/ConfirmSave";
import NumberInput from "@/components/NumberInput";

export type ConsItem = {
  id: string;
  nama: string;
  varian: string | null;
  qty_kirim: number;
  qty_terjual: number;
  qty_retur: number;
  harga_jual: number;
};

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}
/** Yang masih ada di outlet: dikirim dikurangi yang sudah laku & diretur. */
function sisaOf(it: ConsItem) {
  return it.qty_kirim - it.qty_terjual - it.qty_retur;
}

export default function ReportSaleForm({
  consignmentId,
  items,
  aktif,
}: {
  consignmentId: string;
  items: ConsItem[];
  aktif: boolean;
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const [laku, setLaku] = useState<Record<string, string>>({});
  const [diskon, setDiskon] = useState("0");
  const [pakaiTax, setPakaiTax] = useState(false);
  const [taxPercent, setTaxPercent] = useState("11");
  const [top, setTop] = useState("14");
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");

  const calcItems = items
    .map((it) => ({ qty: parseNum(laku[it.id] || ""), harga: it.harga_jual }))
    .filter((c) => c.qty > 0);
  const totals = computeTotals(calcItems, parseNum(diskon), pakaiTax, parseNum(taxPercent));
  const adaLaku = calcItems.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !adaLaku) return;

    const lanjut = await konfirmasi.minta({
      judul: "Catat penjualan di outlet ini?",
      pesan: "Barang yang laku keluar dari stok konsinyasi dan Proforma langsung terbit.",
      ringkasan: [
        { label: "Produk Laku", nilai: calcItems.length + " baris" },
        { label: "Total Tagihan", nilai: formatRupiah(totals.total) },
      ],
      tombol: "Ya, Terbitkan Proforma",
    });
    if (!lanjut) return;

    setLoading(true);
    setError("");
    try {
      const result = await reportConsignmentSale(consignmentId, {
        items: items
          .filter((it) => parseNum(laku[it.id] || "") > 0)
          .map((it) => ({
            consignment_item_id: it.id,
            qty_laku: parseNum(laku[it.id]),
          })),
        diskon_percent: parseNum(diskon),
        pakai_tax: pakaiTax,
        tax_percent: parseNum(taxPercent),
        top_days: top === "" ? null : Math.max(0, Math.round(parseNum(top))),
      });
      if (result.ok && result.invoiceId) {
        router.push(`/print/invoice/${result.invoiceId}`);
        router.refresh();
      } else {
        setError(result.error || "Gagal");
        setLoading(false);
      }
    } catch {
      setError(
        "Gagal menyimpan. Koneksi bermasalah atau aplikasi baru diperbarui, muat ulang halaman lalu coba lagi."
      );
      setLoading(false);
    }
  }

  async function handleClose() {
    if (closing) return;

    const lanjut = await konfirmasi.minta({
      judul: "Selesaikan konsinyasi ini?",
      pesan: "Sisa barang yang belum laku dianggap retur dan kembali ke stok produk jadi.",
      tombol: "Ya, Tutup Konsinyasi",
      nada: "bahaya",
    });
    if (!lanjut) return;

    setClosing(true);
    try {
      const result = await closeConsignment(consignmentId);
      if (!result.ok) alert(result.error || "Gagal");
      router.refresh();
    } catch {
      alert("Gagal. Koneksi bermasalah atau aplikasi baru diperbarui, muat ulang halaman lalu coba lagi.");
    } finally {
      setClosing(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <div className="flex flex-col gap-5">
      {/* ===== Stok di lokasi ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Stok di Lokasi Konsinyasi
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              {aktif
                ? "Isi kolom Laku untuk melaporkan penjualan → generate proforma invoice."
                : "Konsinyasi sudah selesai, sisa barang telah diretur ke stok."}
            </p>
          </div>
          {aktif && (
            <button
              type="button"
              onClick={handleClose}
              disabled={closing}
              className="text-clay-600 text-[12.5px] font-medium border border-clay-500/40 rounded-lg px-3 py-1.5 hover:bg-clay-100 transition-colors disabled:opacity-60"
            >
              {closing ? "..." : "Selesaikan & Retur Sisa"}
            </button>
          )}
        </div>

          <DataTable
            rows={items}
            rowKey={(it) => it.id}
            minWidth={640}
            expandable={false}
            empty="Belum ada produk pada pengiriman ini."
            columns={[
              {
                key: "produk",
                header: "Produk",
                role: "title",
                cell: (it) => (
                  <>
                    <div className="font-medium">{it.nama}</div>
                    {it.varian && (
                      <div className="text-[11px] text-muted">{it.varian}</div>
                    )}
                  </>
                ),
                cardCell: (it) => (
                  <>
                    <div>{it.nama}</div>
                    {it.varian && (
                      <div className="text-[11px] text-muted font-normal">
                        {it.varian}
                      </div>
                    )}
                  </>
                ),
              },
              {
                key: "kirim",
                header: "Kirim",
                role: "primary",
                align: "right",
                cell: (it) => it.qty_kirim.toLocaleString("id-ID"),
              },
              {
                key: "terjual",
                header: "Terjual",
                role: "primary",
                align: "right",
                cell: (it) => (
                  <span className="text-botanical-700 font-medium">
                    {it.qty_terjual.toLocaleString("id-ID")}
                  </span>
                ),
              },
              {
                key: "retur",
                header: "Retur",
                role: "primary",
                align: "right",
                cell: (it) => it.qty_retur.toLocaleString("id-ID"),
              },
              {
                key: "sisa",
                header: "Sisa",
                role: "primary",
                align: "right",
                className: "font-medium",
                cell: (it) => sisaOf(it).toLocaleString("id-ID"),
              },
              {
                key: "harga",
                header: "Harga Jual",
                role: "primary",
                align: "right",
                className: "whitespace-nowrap",
                cell: (it) => formatRupiah(it.harga_jual),
              },
              ...(aktif
                ? [
                    {
                      key: "laku",
                      header: "Laku",
                      role: "primary" as const,
                      headClassName: "w-[110px]",
                      cell: (it: ConsItem) => (
                        <NumberInput
                          aria-label={`Jumlah laku ${it.nama}`}
                          value={laku[it.id] || ""}
                          onChange={(nilai) =>
                            setLaku((s) => ({ ...s, [it.id]: nilai }))
                          }
                          placeholder="0"
                          className={`${inputCls} ${
                            parseNum(laku[it.id] || "") > sisaOf(it)
                              ? "ring-2 ring-clay-500"
                              : ""
                          }`}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
      </div>

      {/* ===== Generate proforma ===== */}
      {aktif && (
        <form
          onSubmit={handleSubmit}
          className="glass rounded-2xl p-6 flex flex-col gap-3 sm:max-w-md sm:ml-auto sm:w-full"
        >
          <h3 className="font-display text-[14.5px] font-semibold text-ink">
            Generate Proforma Invoice
          </h3>
          <div className="flex justify-between text-[13.5px]">
            <span className="text-muted">Sub-Total</span>
            <span>{formatRupiah(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between items-center text-[13.5px]">
            <span className="text-muted flex items-center gap-1.5">
              Discount
              <NumberInput
                value={diskon}
                onChange={(nilai) => setDiskon(nilai)}
                className="w-14 glass-input rounded-md px-2 py-1 text-[12.5px] text-right focus:outline-none focus:ring-2 focus:ring-botanical-700"
              />
              %
            </span>
            <span className="text-clay-600">
              {totals.diskon > 0 ? `− ${formatRupiah(totals.diskon)}` : formatRupiah(0)}
            </span>
          </div>
          <div className="flex justify-between items-center text-[13.5px]">
            <label className="text-muted flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={pakaiTax}
                onChange={(e) => setPakaiTax(e.target.checked)}
                className="accent-[#2f4f3e]"
              />
              Tax
              <NumberInput
                value={taxPercent}
                onChange={(nilai) => setTaxPercent(nilai)}
                disabled={!pakaiTax}
                className="w-12 glass-input rounded-md px-2 py-1 text-[12.5px] text-right focus:outline-none focus:ring-2 focus:ring-botanical-700 disabled:opacity-40"
              />
              %
            </label>
            <span>{pakaiTax ? formatRupiah(totals.tax) : "-"}</span>
          </div>
          <div className="flex justify-between items-center text-[13.5px]">
            <span className="text-muted flex items-center gap-1.5">
              TOP
              <NumberInput
                bulat
                value={top}
                onChange={(nilai) => setTop(nilai)}
                className="w-14 glass-input rounded-md px-2 py-1 text-[12.5px] text-right focus:outline-none focus:ring-2 focus:ring-botanical-700"
              />
              hari
            </span>
          </div>
          <div className="flex justify-between font-semibold text-[15px] border-t border-line pt-2">
            <span>TOTAL</span>
            <span>{formatRupiah(totals.total)}</span>
          </div>

          {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

          <button
            type="submit"
            disabled={loading || !adaLaku}
            className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && (
              <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {loading
              ? "Membuat proforma..."
              : adaLaku
                ? "Generate Proforma & Cetak"
                : "Isi qty laku dulu"}
          </button>
        </form>
      )}
      {konfirmasi.dialog}
    </div>
  );
}
