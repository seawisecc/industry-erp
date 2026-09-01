/* ============================================================
   Kunci harga khusus per client.

   File ini sengaja TIDAK meng-import apa pun dari supabase/server:
   isinya dipakai juga oleh komponen "use client" (InvoiceForm,
   ConsignmentForm). Menaruhnya di lib/salesOptions.ts akan menyeret
   klien Supabase sisi server ikut ke bundle browser.
   ============================================================ */

/**
 * Normalisasi varian: null, string kosong, dan "-" dianggap sama.
 *
 * Harus konsisten dengan `fgKey` (lib/salesStock.ts) dan fungsi
 * `varian_key()` di Postgres. Kalau ketiganya berbeda, satu produk
 * tanpa varian bisa punya dua baris harga dan tidak ada yang tahu
 * mana yang dipakai.
 */
export function varianKey(varian: string | null | undefined): string {
  return (varian ?? "").trim() || "-";
}

/** Harga khusus, dikunci `${client_id}|${product_id}|${varian}`. */
export type ClientPriceMap = Record<string, number>;

/**
 * Diskon khusus dalam persen, kuncinya sama persis dengan ClientPriceMap.
 *
 * Dipisah dari harga karena satu baris kesepakatan boleh berisi harga
 * saja, diskon saja, atau dua-duanya. Urutan hitungnya:
 *
 *   harga dasar = harga khusus kalau ada, kalau tidak harga master
 *   harga akhir = harga dasar - (harga dasar * diskon / 100)
 *
 * Dipakai di konsinyasi saja: pengiriman memakai harga dasar penuh,
 * potongannya muncul waktu laku dicatat dan Proforma terbit.
 */
export type ClientDiscountMap = Record<string, number>;

/**
 * Persentase diskon satu dokumen dari sekumpulan baris yang punya diskon
 * sendiri-sendiri.
 *
 * Proforma menyimpan SATU diskon per dokumen, bukan per baris. Rata-rata
 * tertimbang ini menghasilkan rupiah potongan yang sama persis dengan
 * menghitung per baris, jadi tidak ada selisih pembulatan antara yang
 * dilihat user dan yang dihitung ulang di SQL.
 */
export function diskonTertimbang(
  baris: { qty: number; harga: number; diskonPersen: number }[]
): number {
  let dasar = 0;
  let potongan = 0;
  for (const b of baris) {
    const nilai = b.qty * b.harga;
    dasar += nilai;
    potongan += (nilai * b.diskonPersen) / 100;
  }
  if (dasar <= 0) return 0;
  return (potongan / dasar) * 100;
}

export function clientPriceKey(
  clientId: string,
  productId: string,
  varian: string | null
): string {
  return `${clientId}|${productId}|${varianKey(varian)}`;
}
