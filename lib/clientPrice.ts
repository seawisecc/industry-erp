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

export function clientPriceKey(
  clientId: string,
  productId: string,
  varian: string | null
): string {
  return `${clientId}|${productId}|${varianKey(varian)}`;
}
