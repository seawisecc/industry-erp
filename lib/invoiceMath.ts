/* ============================================================
   Diskon & PPN invoice: satu rumus untuk seluruh aplikasi.

   Tarif PPN Indonesia adalah 12%. Yang membuatnya terbaca seperti 11%
   adalah DPP Nilai Lain (PMK 131/2024): dasar pengenaannya bukan harga
   jual penuh, melainkan 11/12 dari harga jual. Jadi

     PPN = 12% x (11/12 x harga jual) = 11% x harga jual

   Angkanya sama dengan menghitung 11% langsung, tapi rinciannya BEDA,
   dan rincian itulah yang harus tercetak di faktur. Karena itu tarif
   dan pengali DPP disimpan terpisah, tidak dipadatkan jadi satu angka
   11%: kalau aturan Nilai Lain dicabut, yang berubah cuma pengalinya
   dan tarifnya tetap 12.

   Ada DUA model perhitungan, dipilih per perusahaan di
   Settings -> Pajak (PPN):

     Exclude  harga produk BELUM termasuk pajak. PPN ditambahkan di atas
              nilai setelah diskon, jadi tagihan client bertambah.

     Include  harga produk SUDAH final, pajaknya ada di dalam harga.
              Tagihan client tidak bertambah sepeser pun; pajaknya
              diurai keluar dari harga supaya tetap tercatat.

   Urutannya, persis seperti yang tercetak di faktur:

     subtotal   = Sigma (qty x harga)      <- harga apa adanya di layar
     diskon     = subtotal x diskon%
     netto      = subtotal - diskon        <- SUB TOTAL
     exTax      = harga jual tanpa pajak   <- SUB TOTAL EXC TAX
     dpp        = exTax x 11/12            <- DPP (Nilai Lain)
     pajak      = dpp x 12%
     total      = Include ? netto : netto + pajak

   exTax-lah yang membedakan dua model itu:
     Exclude: exTax = netto            (harga memang belum kena pajak)
     Include: exTax = netto / (1 + tarif efektif)

   Cerminan SQL-nya invoice_tax_calc() di
   supabase/migrations/20260818_tax_mode.sql. Dua-duanya wajib ikut
   berubah bersamaan: angka di layar yang berbeda dengan angka yang
   dihitung ulang di database adalah bug terburuk yang mungkin terjadi
   di sini.

   Berkas ini bersih dari import server, jadi boleh dipakai komponen
   "use client" maupun server action.
   ============================================================ */

export type TaxMode = "Exclude" | "Include";

export const TAX_MODE_DEFAULT: TaxMode = "Exclude";

/** Tarif PPN menurut regulasi, berlaku sejak 1 Januari 2025. */
export const TAX_PERCENT_DEFAULT = 12;

/** Pengali DPP Nilai Lain: 11/12 dari harga jual. */
export const DPP_NILAI_LAIN = 11 / 12;

export type TaxSettings = {
  taxMode: TaxMode;
  /** Tarif PPN menurut regulasi (12), bukan tarif efektif (11). */
  taxPercent: number;
  /** DPP dihitung 11/12 dari harga jual. Mati = DPP sama dengan harga jual. */
  dppNilaiLain: boolean;
};

export type InvoiceItemCalc = { qty: number; harga: number };

export type InvoiceTotals = {
  /** Sigma qty x harga, sesuai harga yang tertulis di baris item. */
  subtotal: number;
  /** Rupiah potongan diskon. */
  diskon: number;
  /** subtotal - diskon. Yang tercetak sebagai SUB TOTAL. */
  netto: number;
  /** Harga jual tanpa pajak. Yang tercetak sebagai SUB TOTAL EXC TAX. */
  exTax: number;
  /** Dasar Pengenaan Pajak, sudah dikali 11/12 kalau Nilai Lain menyala. */
  dpp: number;
  /** Rupiah PPN. Nol kalau tax tidak dicentang. */
  tax: number;
  /** Yang dibayar client. */
  total: number;
  pakaiTax: boolean;
  taxMode: TaxMode;
  taxPercent: number;
  dppNilaiLain: boolean;
  /** Persen PPN terhadap harga jual: 12% x 11/12 = 11%. */
  tarifEfektif: number;
};

/** Baca nilai kolom `tax_mode` apa adanya, apa pun isinya. */
export function parseTaxMode(raw: unknown): TaxMode {
  return raw === "Include" ? "Include" : "Exclude";
}

export function parseTaxSettings(
  raw:
    | { tax_mode?: unknown; tax_percent?: unknown; tax_dpp_nilai_lain?: unknown }
    | null
    | undefined
): TaxSettings {
  const persen = Number(raw?.tax_percent);
  return {
    taxMode: parseTaxMode(raw?.tax_mode),
    taxPercent: Number.isFinite(persen) ? persen : TAX_PERCENT_DEFAULT,
    // Kolomnya baru; baris lama yang belum punya nilai dianggap memakai
    // Nilai Lain, karena itu aturan yang berlaku sekarang.
    dppNilaiLain: raw?.tax_dpp_nilai_lain !== false,
  };
}

/** Persen PPN terhadap harga jual. 12% dengan Nilai Lain jadi 11%. */
export function tarifEfektif(taxPercent: number, dppNilaiLain: boolean): number {
  return taxPercent * (dppNilaiLain ? DPP_NILAI_LAIN : 1);
}

/**
 * Hitung dari nilai yang sudah tersimpan di header dokumen. Dipakai
 * halaman cetak dan laporan, yang tidak punya daftar item di tangan.
 */
export function hitungTotalDokumen(
  subtotal: number,
  diskonPercent: number,
  pakaiTax: boolean,
  taxPercent: number,
  taxMode: TaxMode = TAX_MODE_DEFAULT,
  dppNilaiLain = true
): InvoiceTotals {
  const diskon = (subtotal * diskonPercent) / 100;
  const netto = subtotal - diskon;

  const faktor = dppNilaiLain ? DPP_NILAI_LAIN : 1;
  const efektif = tarifEfektif(taxPercent, dppNilaiLain);
  const dasar = {
    subtotal,
    diskon,
    netto,
    pakaiTax,
    taxMode,
    taxPercent,
    dppNilaiLain,
    tarifEfektif: efektif,
  };

  if (!pakaiTax) {
    return { ...dasar, exTax: netto, dpp: netto, tax: 0, total: netto };
  }

  if (taxMode === "Include") {
    const pembagi = 1 + efektif / 100;
    // Tarif efektif <= -100% bikin pembaginya nol atau negatif. Angka
    // segila itu tidak mungkin benar, jadi diperlakukan sebagai tanpa
    // pengurai ketimbang menghasilkan Infinity yang menyebar ke layar.
    const exTax = pembagi > 0 ? netto / pembagi : netto;
    // Pajaknya dihitung sebagai SISA, bukan dpp x tarif, supaya
    // exTax + pajak selalu persis sama dengan netto. Nilainya identik
    // secara matematis, cuma tidak menyisakan selisih pembulatan yang
    // tidak bisa dijelaskan di dokumen pajak.
    return {
      ...dasar,
      exTax,
      dpp: exTax * faktor,
      tax: netto - exTax,
      total: netto,
    };
  }

  const tax = (netto * efektif) / 100;
  return { ...dasar, exTax: netto, dpp: netto * faktor, tax, total: netto + tax };
}

/** Hitung dari daftar item di layar. Dipakai semua form penjualan. */
export function computeTotals(
  items: InvoiceItemCalc[],
  diskonPercent: number,
  pakaiTax: boolean,
  taxPercent: number,
  taxMode: TaxMode = TAX_MODE_DEFAULT,
  dppNilaiLain = true
): InvoiceTotals {
  const subtotal = items.reduce((s, it) => s + it.qty * it.harga, 0);
  return hitungTotalDokumen(
    subtotal,
    diskonPercent,
    pakaiTax,
    taxPercent,
    taxMode,
    dppNilaiLain
  );
}

function persenStr(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

/** Kalimat penjelas modelnya, dipakai layar pengaturan & form. */
export function penjelasanTaxMode(t: TaxSettings): string {
  const efektif = persenStr(tarifEfektif(t.taxPercent, t.dppNilaiLain));
  const dasar = t.dppNilaiLain
    ? `PPN ${persenStr(t.taxPercent)}% dihitung dari DPP Nilai Lain (11/12 harga jual), jadi efektif ${efektif}% dari harga jual.`
    : `PPN ${persenStr(t.taxPercent)}% dihitung dari harga jual penuh.`;
  return t.taxMode === "Include"
    ? `Harga produk sudah termasuk pajak. Pajaknya diurai dari harga, total tagihan tidak bertambah. ${dasar}`
    : `Harga produk belum termasuk pajak. Pajaknya ditambahkan di atas nilai setelah diskon. ${dasar}`;
}
