import type { InvoiceTotals } from "@/lib/invoiceMath";
import type { PurchaseTaxMode } from "@/lib/purchaseTax";

/* ============================================================
   Rekap dokumen pembelian: Subtotal, Sub Total Exc Tax, DPP, PPN, Total.
   Urutannya mengikuti faktur supplier, sama persis dengan panel rekap
   penjualan (components/InvoiceTotals.tsx).

   Satu komponen untuk enam layar: form PO, form Penerimaan, detail PO,
   detail Penerimaan, cetak PO, cetak Penerimaan. Sebelumnya markup
   tiga barisnya disalin di tiap layar, dan itu berarti tiap penambahan
   baris rekap harus diingat di enam tempat.

   Komponennya sengaja tanpa "use client": form memakainya di klien,
   halaman cetak di server, dan tidak ada satu pun state di dalamnya.

   Baris "Sub Total Exc Tax" cuma dicetak pada Include. Pada Exclude
   angkanya sama persis dengan Subtotal, jadi barisnya cuma mengulang.
   ============================================================ */

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export default function PurchaseTotals({
  totals,
  mode,
  cetak = false,
  judulTotal = "Total",
  extraRows,
}: {
  totals: InvoiceTotals;
  mode: PurchaseTaxMode;
  /** Gaya dokumen A4: hitam putih, tanpa panel kaca. */
  cetak?: boolean;
  judulTotal?: string;
  /** Baris tambahan sesudah TOTAL, mis. sisa tagihan di layar retur. */
  extraRows?: React.ReactNode;
}) {
  const labelCls = cetak ? "text-neutral-600" : "text-muted";
  const rowCls = cetak ? "flex justify-between py-1" : "flex justify-between";
  const totalCls = cetak
    ? "flex justify-between py-1.5 border-t-2 border-[#1a1a1a] font-bold text-[13.5px]"
    : "flex justify-between font-semibold text-[15px] border-t border-line pt-2 mt-1";

  return (
    <>
      <div className={rowCls}>
        <span className={labelCls}>Subtotal</span>
        <span>{formatRupiah(totals.subtotal)}</span>
      </div>

      {mode === "Include" && (
        <div className={rowCls}>
          <span className={labelCls}>Sub Total Exc Tax</span>
          <span>{formatRupiah(totals.exTax)}</span>
        </div>
      )}

      {mode !== "Non" && (
        <>
          <div className={rowCls}>
            <span className={labelCls}>DPP</span>
            <span>{formatRupiah(totals.dpp)}</span>
          </div>
          <div className={rowCls}>
            <span className={labelCls}>PPN</span>
            <span>{formatRupiah(totals.tax)}</span>
          </div>
        </>
      )}

      <div className={totalCls}>
        <span>{judulTotal}</span>
        <span>{formatRupiah(totals.total)}</span>
      </div>

      {extraRows}
    </>
  );
}
