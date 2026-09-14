/* ============================================================
   Pajak sisi PEMBELIAN: modelnya milik SUPPLIER, bukan milik kita.

   Di penjualan, model harga adalah keputusan perusahaan sendiri, jadi
   satu pengaturan di Settings berlaku untuk semua invoice. Di pembelian
   keputusan itu ada di seberang meja: tiap supplier menerbitkan
   fakturnya dengan gayanya sendiri, dan tiga-tiganya ada di lapangan.

     Non      supplier non-PKP, fakturnya tidak memuat PPN sama sekali
     Exclude  harga di faktur belum kena PPN, PPN ditambahkan di bawah
     Include  harga di faktur sudah final, PPN diurai dari dalamnya

   Yang TIDAK berbeda adalah tarifnya. PPN 12% dengan DPP Nilai Lain
   adalah regulasi, sama untuk semua orang, jadi angkanya tetap datang
   dari Settings dan tidak bisa diketik per dokumen. Yang dipilih di form
   cuma modelnya.

   Rumusnya tidak ditulis ulang di sini: hitungTotalPembelian cuma
   memanggil hitungTotalDokumen dengan diskon 0. Sisi pembelian tidak
   punya kolom diskon dokumen, potongan supplier sudah masuk ke harga
   per baris.

   Cerminan SQL-nya invoice_tax_calc(), dipanggil dari create_receiving_tx
   dan create_purchase_return_tx di 20260822_purchase_tax_mode.sql.

   Bersih dari import server, jadi boleh dipakai komponen "use client"
   maupun server action.
   ============================================================ */

import {
  hitungTotalDokumen,
  tarifEfektif,
  type InvoiceTotals,
  type TaxSettings,
} from "@/lib/invoiceMath";

export type PurchaseTaxMode = "Non" | "Exclude" | "Include";

/** Supplier yang belum pernah dikenali dianggap menambahkan PPN. */
export const PURCHASE_TAX_MODE_DEFAULT: PurchaseTaxMode = "Exclude";

export const PURCHASE_TAX_MODES: PurchaseTaxMode[] = [
  "Non",
  "Exclude",
  "Include",
];

/** Label pendek untuk tombol switch. */
export const PURCHASE_TAX_LABEL: Record<PurchaseTaxMode, string> = {
  Non: "Tanpa PPN",
  Exclude: "Exclude",
  Include: "Include",
};

/** Kalimat penjelas di bawah switch. Tanpa angka tarif, itu milik Settings. */
export const PURCHASE_TAX_HINT: Record<PurchaseTaxMode, string> = {
  Non: "Faktur supplier tidak memuat PPN. Total tagihan sama dengan subtotal.",
  Exclude: "Harga di faktur belum termasuk PPN. Pajaknya ditambahkan di bawah subtotal.",
  Include: "Harga di faktur sudah termasuk PPN. Total tidak bertambah, pajaknya diurai dari dalam harga.",
};

/**
 * Kalimat yang menerangkan tarif yang berlaku, untuk ditulis di bawah
 * switch. Ada di layar supaya orang tahu dari mana angkanya datang,
 * sekaligus menjawab pertanyaan yang pasti muncul begitu kolom ketik
 * "PPN (%)" dihapus dari form.
 */
export function keteranganTarif(tax: TaxSettings): string {
  const persen = (n: number) =>
    n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  return tax.dppNilaiLain
    ? `Tarif PPN ${persen(tax.taxPercent)}% atas DPP Nilai Lain (11/12 harga), efektif ${persen(tarifEfektif(tax.taxPercent, tax.dppNilaiLain))}%. Diatur di Settings, menu Pajak (PPN).`
    : `Tarif PPN ${persen(tax.taxPercent)}% atas harga penuh. Diatur di Settings, menu Pajak (PPN).`;
}

/** Baca nilai kolom `tax_mode` apa adanya, apa pun isinya. */
export function parsePurchaseTaxMode(raw: unknown): PurchaseTaxMode {
  return raw === "Non" || raw === "Include" || raw === "Exclude"
    ? raw
    : PURCHASE_TAX_MODE_DEFAULT;
}

/**
 * Sama dengan parsePurchaseTaxMode, tapi membedakan "belum pernah
 * diketahui" (null) dari "memang tanpa PPN" ('Non'). Dipakai untuk
 * bawaan supplier, yang boleh kosong.
 */
export function parseSupplierTaxMode(raw: unknown): PurchaseTaxMode | null {
  return raw === "Non" || raw === "Include" || raw === "Exclude" ? raw : null;
}

/**
 * Tarif yang DIBEKUKAN di dokumen. Nol untuk dokumen tanpa pajak, supaya
 * pembaca lama yang cuma melihat ppn_percent tetap membaca angka yang benar.
 */
export function tarifDokumen(mode: PurchaseTaxMode, tax: TaxSettings): number {
  return mode === "Non" ? 0 : tax.taxPercent;
}

/**
 * Dua baris faktur supplier yang bukan harga barang, dan yang perlakuan
 * pajaknya BERBEDA satu sama lain:
 *
 *   diskon      potongan harga (volume/packing discount). Mengurangi
 *               nilai barang SEBELUM pajak, jadi ikut mengurangi DPP.
 *               Di Faktur Pajak dia baris "Dikurangi Potongan Harga".
 *   biayaKirim  ongkos kirim. Ditambahkan SESUDAH PPN, tidak pernah
 *               masuk DPP.
 *
 * Keduanya dalam RUPIAH, seperti tertulis di kertas suppliernya. Sisi
 * penjualan memakai diskon PERSEN karena di sana angkanya dinegosiasikan
 * sebagai persentase; di sisi pembelian yang datang adalah angka jadi,
 * dan mengubahnya jadi persen lebih dulu cuma menambah satu pembulatan
 * yang tidak ada di dokumen aslinya.
 *
 * Tidak satu pun dari keduanya membebani HPP: `harga_per_unit` batch
 * tetap lahir dari harga per baris. Lihat 20260827_receiving_biaya_kirim.sql
 * untuk alasannya.
 */
export type PurchaseExtras = {
  diskon?: number;
  biayaKirim?: number;
};

export type PurchaseTotals = InvoiceTotals & {
  /** Ongkos kirim, sudah ikut di dalam `total`. */
  biayaKirim: number;
};

/** Total dokumen pembelian. Satu-satunya jalan masuk ke rumus pajaknya. */
export function hitungTotalPembelian(
  subtotal: number,
  mode: PurchaseTaxMode,
  taxPercent: number,
  dppNilaiLain: boolean,
  extra: PurchaseExtras = {}
): PurchaseTotals {
  const diskon = Math.max(0, extra.diskon ?? 0);
  const biayaKirim = Math.max(0, extra.biayaKirim ?? 0);
  const netto = subtotal - diskon;

  // Yang diserahkan ke rumus pajak adalah NETTO dengan diskon nol, bukan
  // subtotal dengan diskon persen: `netto = subtotal - diskon` di sini
  // sama persis dengan yang dihitung create_receiving_tx, tanpa
  // perjalanan bolak-balik lewat persentase yang menyisakan selisih
  // pecahan sen antara layar dan database.
  const t = hitungTotalDokumen(
    netto,
    0,
    mode !== "Non",
    taxPercent,
    mode === "Include" ? "Include" : "Exclude",
    dppNilaiLain
  );

  return {
    ...t,
    subtotal,
    diskon,
    netto,
    // Ongkir menambah yang harus dibayar, bukan yang dikenai pajak.
    total: t.total + biayaKirim,
    biayaKirim,
  };
}

/** Bentuk yang lebih enak dipanggil dari form, yang memegang TaxSettings utuh. */
export function totalPembelian(
  subtotal: number,
  mode: PurchaseTaxMode,
  tax: TaxSettings,
  extra: PurchaseExtras = {}
): PurchaseTotals {
  return hitungTotalPembelian(
    subtotal,
    mode,
    tarifDokumen(mode, tax),
    tax.dppNilaiLain,
    extra
  );
}

/**
 * Rincian pajak sebuah dokumen yang cuma menyimpan TOTAL-nya, bukan
 * subtotalnya. Dipakai retur pembelian: `purchase_returns.total_nilai`
 * adalah nilai yang dipotongkan dari tagihan, dan rincian DPP/PPN-nya
 * harus dibongkar balik supaya bisa mengurangi pajak masukan.
 *
 * Bukan rumus baru, cuma membalik arahnya: subtotalnya dihitung dulu,
 * lalu diserahkan ke hitungTotalPembelian yang sama.
 */
export function rincianDariTotal(
  total: number,
  mode: PurchaseTaxMode,
  taxPercent: number,
  dppNilaiLain: boolean
): InvoiceTotals {
  const pembagi = 1 + tarifEfektif(taxPercent, dppNilaiLain) / 100;
  // Pada Include totalnya SUDAH sama dengan subtotal: pajaknya di dalam.
  const subtotal =
    mode === "Include" || pembagi <= 0 ? total : total / pembagi;
  return hitungTotalPembelian(subtotal, mode, taxPercent, dppNilaiLain);
}

/**
 * Harga faktur -> HPP. Pada Include, PPN dikeluarkan dari harganya supaya
 * biaya barang tetap setara dengan pembelian dari supplier Exclude: uang
 * yang keluar sama, jadi HPP-nya tidak boleh berbeda cuma karena gaya
 * penulisan faktur suppliernya.
 *
 * Cerminan v_pembagi di create_receiving_tx (20260822). Dua-duanya wajib
 * ikut berubah bersamaan.
 */
export function hargaExTax(
  harga: number,
  mode: PurchaseTaxMode,
  taxPercent: number,
  dppNilaiLain: boolean
): number {
  if (mode !== "Include") return harga;
  const pembagi = 1 + tarifEfektif(taxPercent, dppNilaiLain) / 100;
  return pembagi > 0 ? harga / pembagi : harga;
}
