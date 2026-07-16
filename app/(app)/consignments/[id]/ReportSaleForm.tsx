"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reportConsignmentSale, closeConsignment } from "../actions";
import { computeTotals } from "@/lib/invoiceMath";

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
    setLoading(true);
    setError("");
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
  }

  async function handleClose() {
    if (closing) return;
    if (
      !confirm(
        "Selesaikan konsinyasi? Sisa barang yang belum laku dianggap retur dan kembali ke stok produk jadi."
      )
    )
      return;
    setClosing(true);
    const result = await closeConsignment(consignmentId);
    if (!result.ok) alert(result.error || "Gagal");
    router.refresh();
    setClosing(false);
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
                : "Konsinyasi sudah selesai — sisa barang telah diretur ke stok."}
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

        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
                <th className="px-2 py-2 font-semibold">Produk</th>
                <th className="px-2 py-2 font-semibold text-right">Kirim</th>
                <th className="px-2 py-2 font-semibold text-right">Terjual</th>
                <th className="px-2 py-2 font-semibold text-right">Retur</th>
                <th className="px-2 py-2 font-semibold text-right">Sisa</th>
                <th className="px-2 py-2 font-semibold text-right">Harga Jual</th>
                {aktif && <th className="px-2 py-2 font-semibold w-[110px]">Laku</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const sisa = it.qty_kirim - it.qty_terjual - it.qty_retur;
                const over = parseNum(laku[it.id] || "") > sisa;
                return (
                  <tr key={it.id} className="border-b border-line last:border-0">
                    <td className="px-2 py-2.5">
                      <div className="font-medium">{it.nama}</div>
                      {it.varian && (
                        <div className="text-[11px] text-muted">{it.varian}</div>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {it.qty_kirim.toLocaleString("id-ID")}
                    </td>
                    <td className="px-2 py-2.5 text-right text-botanical-700 font-medium">
                      {it.qty_terjual.toLocaleString("id-ID")}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {it.qty_retur.toLocaleString("id-ID")}
                    </td>
                    <td className="px-2 py-2.5 text-right font-medium">
                      {sisa.toLocaleString("id-ID")}
                    </td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap">
                      {formatRupiah(it.harga_jual)}
                    </td>
                    {aktif && (
                      <td className="px-2 py-2.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={laku[it.id] || ""}
                          onChange={(e) =>
                            setLaku((s) => ({ ...s, [it.id]: e.target.value }))
                          }
                          placeholder="0"
                          className={`${inputCls} ${over ? "ring-2 ring-clay-500" : ""}`}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
              <input
                type="text"
                inputMode="decimal"
                value={diskon}
                onChange={(e) => setDiskon(e.target.value)}
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
              <input
                type="text"
                inputMode="decimal"
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
                disabled={!pakaiTax}
                className="w-12 glass-input rounded-md px-2 py-1 text-[12.5px] text-right focus:outline-none focus:ring-2 focus:ring-botanical-700 disabled:opacity-40"
              />
              %
            </label>
            <span>{pakaiTax ? formatRupiah(totals.tax) : "—"}</span>
          </div>
          <div className="flex justify-between items-center text-[13.5px]">
            <span className="text-muted flex items-center gap-1.5">
              TOP
              <input
                type="number"
                min={0}
                value={top}
                onChange={(e) => setTop(e.target.value)}
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
    </div>
  );
}
