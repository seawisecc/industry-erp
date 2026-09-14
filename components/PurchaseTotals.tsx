import type { InvoiceTotals } from "@/lib/invoiceMath";
import type { PurchaseTaxMode } from "@/lib/purchaseTax";

/* ============================================================
   Rekap dokumen pembelian: Subtotal, Diskon, Sub Total Exc Tax, DPP,
   PPN, Biaya Kirim, Total.
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

   Diskon dan Biaya Kirim cuma muncul kalau fakturnya memang memuatnya,
   dan URUTANNYA yang menerangkan perlakuan pajaknya: diskon di ATAS
   DPP karena dia mengurangi dasar pengenaan pajak, biaya kirim di BAWAH
   PPN karena dia tidak pernah ikut dikenai pajak. Keduanya cuma terisi
   pada penerimaan barang; PO dan retur belum punya kolomnya.
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
  totals: InvoiceTotals & {
    /** Ongkos kirim, sudah ikut di dalam `total`. Lihat lib/purchaseTax.ts. */
    biayaKirim?: number;
  };
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

      {/* Dua baris ini cuma muncul kalau fakturnya memang memuatnya.
          Baris bernilai nol di dokumen cetak terbaca sebagai potongan
          yang lupa diisi, dan itu pertanyaan yang tidak perlu ada. */}
      {totals.diskon > 0 && (
        <>
          <div className={rowCls}>
            <span className={labelCls}>Diskon</span>
            <span>- {formatRupiah(totals.diskon)}</span>
          </div>
          <div className={rowCls}>
            <span className={labelCls}>Setelah Diskon</span>
            <span>{formatRupiah(totals.netto)}</span>
          </div>
        </>
      )}

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

      {/* Sesudah PPN, karena memang di situ tempatnya: ongkir menambah
          tagihan tapi tidak pernah masuk DPP. Menaruhnya di atas DPP
          akan membuat orang mengira ongkirnya ikut dikenai pajak. */}
      {(totals.biayaKirim ?? 0) > 0 && (
        <div className={rowCls}>
          <span className={labelCls}>Biaya Kirim</span>
          <span>{formatRupiah(totals.biayaKirim ?? 0)}</span>
        </div>
      )}

      <div className={totalCls}>
        <span>{judulTotal}</span>
        <span>{formatRupiah(totals.total)}</span>
      </div>

      {extraRows}
    </>
  );
}
