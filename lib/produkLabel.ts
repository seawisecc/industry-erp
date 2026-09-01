/* ============================================================
   Nama produk jadi untuk ditampilkan.

   Berkas ini BERSIH dari import server (lihat bab "Batas
   server/klien di lib/" di CLAUDE.md), jadi boleh dipakai
   komponen "use client" mana pun.

   Kenapa brand ikut: satu pabrik maklon mengerjakan produk yang
   namanya mirip untuk brand yang berbeda, dan kode produk pun
   bisa kembar. Nama saja tidak cukup untuk memilih barang yang
   benar, dan salah pilih di konsinyasi atau opname baru
   ketahuan setelah stoknya bergerak.
   ============================================================ */

/** "Rainforest Body Wash · Rainforest". Tanpa brand, namanya saja. */
export function namaBrand(nama: string, brand?: string | null): string {
  const b = brand?.trim();
  return b ? `${nama} · ${b}` : nama;
}

/**
 * Baris lengkap satu produk-varian:
 * "FP-009, Rainforest Body Wash (5000 ml) · Rainforest"
 *
 * Urutannya sengaja begini: kode dan nama di depan supaya kolom
 * sempit tetap memperlihatkan yang paling membedakan, brand di
 * ekor karena dia penjelas, bukan identitas barangnya.
 */
export function labelProdukVarian({
  kode,
  nama,
  brand,
  varian,
}: {
  kode?: string | null;
  nama: string;
  brand?: string | null;
  varian?: string | null;
}): string {
  const v = varian && varian !== "-" ? ` (${varian})` : "";
  return namaBrand(`${kode || ""}, ${nama}${v}`, brand);
}
