/* ============================================================
   QR Signature, sisi server: ringkasan dokumen, sidik, gambar QR.

   DUA aturan yang menentukan seluruh desain file ini.

   1. Sidik dokumen DIHITUNG ULANG, tidak pernah disimpan.
      Kalau disimpan, ia jadi salinan kedua yang bisa berbeda dari
      dokumennya, dokumen diedit, sidik lama tertinggal, dan halaman
      verifikasi tetap bilang "sah" untuk isi yang sudah berubah.
      Dihitung ulang dari kolom dokumennya sendiri, nomor atau tanggal
      yang berubah OTOMATIS menghasilkan sidik berbeda dan kertas lama
      langsung tidak cocok lagi.

   2. Halaman CETAK dan halaman VERIFIKASI mengambil nomor & tanggal
      dari SATU tempat, yaitu SUMBER_DOKUMEN di bawah.
      Kalau halaman cetak menyusun sendiri nomornya lalu halaman
      verifikasi membacanya dari kolom lain, sidik keduanya berbeda
      dan SETIAP dokumen akan tampak palsu. Itu jenis kesalahan yang
      tidak ketahuan sampai orang pertama memindai QR-nya.
   ============================================================ */

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatSidik, type VerifyKey } from "@/lib/qrSign";

/**
 * Dari mana nomor & tanggal tiap jenis dokumen dibaca.
 *
 * `qc` menunjuk purchase_batches dan `qa` menunjuk production_batches
 * karena lembar uji & CoA memang dicetak dari baris itu, keduanya
 * tidak punya nomor dokumen sendiri, jadi identitasnya memakai nomor
 * lot / nomor batch yang tercetak di kepala dokumennya.
 */
export const SUMBER_DOKUMEN: Record<
  VerifyKey,
  { tabel: string; nomor: string; tanggal: string }
> = {
  po: { tabel: "purchase_orders", nomor: "no_po", tanggal: "tanggal_po" },
  receiving: {
    tabel: "receivings",
    nomor: "no_invoice",
    tanggal: "tanggal_terima",
  },
  "purchase-return": {
    tabel: "purchase_returns",
    nomor: "no_retur",
    tanggal: "tanggal",
  },
  production: {
    tabel: "production_batches",
    nomor: "no_batch_produksi",
    tanggal: "tanggal_produksi",
  },
  invoice: { tabel: "sales_invoices", nomor: "no_invoice", tanggal: "tanggal" },
  qc: {
    tabel: "purchase_batches",
    nomor: "no_lot_supplier",
    tanggal: "tanggal_terima",
  },
  qa: {
    tabel: "production_batches",
    nomor: "no_batch_produksi",
    tanggal: "tanggal_produksi",
  },
  "qc-produk": {
    tabel: "production_batches",
    nomor: "no_batch_produksi",
    tanggal: "tanggal_produksi",
  },
};

export type RingkasanDokumen = {
  jenis: VerifyKey;
  id: string;
  organizationId: string;
  nomor: string;
  tanggal: string;
};

export function isDocType(v: string): v is VerifyKey {
  return Object.prototype.hasOwnProperty.call(SUMBER_DOKUMEN, v);
}

/**
 * Ambil identitas dokumen apa adanya dari tabel asalnya.
 *
 * Client-nya dikirim dari luar karena dua pemanggilnya berbeda hak:
 * halaman cetak memakai client user (RLS membatasi ke organisasinya
 * sendiri), halaman verifikasi publik memakai service role karena
 * pemindainya memang tidak punya sesi.
 */
export async function ambilRingkasan(
  client: SupabaseClient,
  jenis: VerifyKey,
  id: string
): Promise<RingkasanDokumen | null> {
  const src = SUMBER_DOKUMEN[jenis];
  const { data } = await client
    .from(src.tabel)
    .select(`id, organization_id, ${src.nomor}, ${src.tanggal}`)
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as Record<string, string | null>;
  return {
    jenis,
    id,
    organizationId: String(row.organization_id || ""),
    nomor: String(row[src.nomor] || "-"),
    tanggal: String(row[src.tanggal] || "").slice(0, 10),
  };
}

/**
 * Kunci HMAC.
 *
 * DOC_SIGN_SECRET kalau ada; kalau tidak, service role key yang sudah
 * pasti tersedia di server. HMAC tidak membocorkan kuncinya, jadi
 * pemakaian ulang ini aman, tapi mengganti kunci berarti SEMUA sidik
 * yang sudah tercetak tidak akan cocok lagi. Jangan diganti tanpa
 * niat mencabut seluruh dokumen yang sudah beredar.
 */
function kunci(): string {
  return (
    process.env.DOC_SIGN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-only-secret"
  );
}

/**
 * Sidik dokumen.
 *
 * Yang masuk hitungan hanya identitas yang TERCETAK di kertas dan
 * ikut ditampilkan di halaman verifikasi. Isi dokumen (baris item,
 * hasil uji) sengaja tidak ikut: halaman verifikasi tidak menampilkan
 * isi, jadi memasukkannya cuma membuat sidik berubah karena hal yang
 * tidak bisa dicocokkan siapa pun.
 */
export function sidikDokumen(d: RingkasanDokumen): string {
  const kanonik = [d.jenis, d.id, d.organizationId, d.nomor, d.tanggal].join("|");
  return formatSidik(createHmac("sha256", kunci()).update(kanonik).digest("hex"));
}

/**
 * Alamat dasar diambil dari header request, bukan dari env.
 *
 * Aplikasinya dilayani lewat beberapa domain sekaligus (ims.seawise.id
 * plus alias *.vercel.app). QR yang dicetak harus menunjuk ke domain
 * yang SEDANG dipakai orang yang mencetaknya, kalau di-hardcode ke
 * satu domain, QR yang dicetak dari preview deployment akan mengarah
 * ke produksi dan menampilkan dokumen yang salah.
 */
export async function alamatDasar(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Gambar QR sebagai SVG inline.
 *
 * SVG, bukan PNG data-URI: dokumennya dicetak, dan QR yang di-raster
 * pada 96 dpi lalu diperbesar printer akan berbayang di tepi modulnya
 *, pemindai jadi rewel persis di kondisi paling tidak enak, yaitu
 * hasil fotokopi. SVG tetap tajam berapa pun dpi printernya.
 *
 * Level koreksi M: cukup tahan noda & lipatan tanpa membuat modulnya
 * terlalu rapat untuk dicetak sebesar 24 mm.
 */
export async function qrSvg(isi: string): Promise<string> {
  return QRCode.toString(isi, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/** Semua yang dibutuhkan blok QR di satu halaman cetak. */
export async function siapkanQrSign(d: RingkasanDokumen) {
  const sidik = sidikDokumen(d);
  // Sidiknya ikut di URL supaya halaman verifikasi bisa MENYIMPULKAN
  // ("cocok" / "tidak cocok"), bukan cuma memajang angka lalu menyuruh
  // orang mencocokkan sendiri. Yang menentukan tetap sidik yang
  // dihitung ulang di server; nilai di URL cuma dibandingkan.
  const url = `${await alamatDasar()}/verify/${d.jenis}/${d.id}?s=${encodeURIComponent(sidik)}`;
  return { url, svg: await qrSvg(url), sidik };
}
