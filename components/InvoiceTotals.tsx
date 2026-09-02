"use client";

import NumberInput from "@/components/NumberInput";
import {
  penjelasanTaxMode,
  type InvoiceTotals as Totals,
  type TaxSettings,
} from "@/lib/invoiceMath";

/* ============================================================
   Panel rekap penjualan: Sub-Total, Diskon, Sub Total Exc Tax, DPP,
   PPN, Total. Urutannya sama persis dengan yang tercetak di faktur.

   Satu komponen untuk semua form yang menerbitkan invoice (Invoice,
   POS, laku per pengiriman konsinyasi). Sebelumnya markup-nya disalin
   di tiap layar, dan itu berarti tiap penambahan baris rekap harus
   diingat di tiga tempat. Yang terlupa menghasilkan layar yang
   menampilkan angka berbeda untuk dokumen yang sama.

   Tarif pajaknya TIDAK bisa diketik di sini. PPN itu angka regulasi,
   bukan angka yang dinegosiasikan per transaksi, jadi tempatnya di
   Settings dan yang tersisa di form cuma pilihan kena pajak atau tidak.
   Konsekuensinya disengaja: mengubah tarif berarti membuka Settings,
   dan itu memang keputusan tingkat perusahaan.
   ============================================================ */

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export type InvoiceTotalsProps = {
  totals: Totals;
  taxSettings: TaxSettings;

  /** Kolom Discount. Nilai persen sebagai string (bentuk NILAI, bertitik). */
  diskon: string;
  onDiskonChange: (nilai: string) => void;

  pakaiTax: boolean;
  onPakaiTaxChange: (aktif: boolean) => void;

  /** Keterangan kecil di bawah baris Discount (mis. diskon khusus outlet). */
  diskonHint?: React.ReactNode;
  /** Baris tambahan sebelum TOTAL, mis. kolom TOP di layar konsinyasi. */
  extraRows?: React.ReactNode;
  /** Judul panel. Kosongkan untuk panel tanpa judul (Invoice & POS). */
  judul?: string;
};

export default function InvoiceTotals({
  totals,
  taxSettings,
  diskon,
  onDiskonChange,
  pakaiTax,
  onPakaiTaxChange,
  diskonHint,
  extraRows,
  judul,
}: InvoiceTotalsProps) {
  const include = taxSettings.taxMode === "Include";
  const adaDiskon = totals.diskon !== 0;

  return (
    <div className="flex flex-col gap-2 text-[13.5px]">
      {judul && (
        <h3 className="font-display text-[14.5px] font-semibold text-ink">
          {judul}
        </h3>
      )}

      {/* ===== Sub-Total ===== */}
      <div className="flex justify-between">
        <span className="text-muted">Sub-Total</span>
        <span>{formatRupiah(totals.subtotal)}</span>
      </div>

      {/* ===== Diskon ===== */}
      <div className="flex justify-between items-center">
        <span className="text-muted flex items-center gap-1.5">
          Discount
          <NumberInput
            aria-label="Diskon persen"
            value={diskon}
            onChange={onDiskonChange}
            className="w-16 glass-input rounded-md px-2 py-1 text-[12.5px] text-right focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
          %
        </span>
        <span className="text-clay-600">
          {totals.diskon > 0
            ? `− ${formatRupiah(totals.diskon)}`
            : formatRupiah(0)}
        </span>
      </div>
      {diskonHint}

      {/* Nilai setelah diskon cuma berarti kalau memang ada potongan. */}
      {adaDiskon && (
        <div className="flex justify-between border-t border-line/70 pt-2">
          <span className="text-muted">Sub Total</span>
          <span>{formatRupiah(totals.netto)}</span>
        </div>
      )}

      {/* ===== Pajak ===== */}
      <div className="flex justify-between items-center">
        <label className="text-muted flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={pakaiTax}
            onChange={(e) => onPakaiTaxChange(e.target.checked)}
            className="accent-[#2f4f3e]"
          />
          Tax
        </label>
        <span
          className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
            include
              ? "bg-botanical-100 text-botanical-700"
              : "bg-white/70 text-muted border border-line"
          }`}
        >
          {include ? "Harga sudah termasuk pajak" : "Pajak ditambahkan"}
        </span>
      </div>

      {pakaiTax && (
        <div className="flex flex-col gap-2 rounded-lg bg-white/45 px-3 py-2.5">
          {/* Pada Exclude angka ini sama dengan Sub Total, jadi cuma
              mengulang baris di atasnya. */}
          {include && (
            <div className="flex justify-between">
              <span className="text-muted">Sub Total Exc Tax</span>
              <span>{formatRupiah(totals.exTax)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted">DPP</span>
            <span>{formatRupiah(totals.dpp)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">PPN</span>
            <span>{formatRupiah(totals.tax)}</span>
          </div>
          <p className="text-[11.5px] text-muted/90 leading-snug">
            {penjelasanTaxMode(taxSettings)} Diatur di Settings, menu Pajak
            (PPN).
          </p>
        </div>
      )}

      {extraRows}

      <div className="flex justify-between font-semibold text-[15px] border-t border-line pt-2 mt-1">
        <span>TOTAL</span>
        <span>{formatRupiah(totals.total)}</span>
      </div>
    </div>
  );
}
