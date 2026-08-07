/* ============================================================
   Golongan baris opname.

   Satu opname bisa memuat tiga golongan sekaligus, dan urutannya harus
   sama di layar hitung, halaman detail, dan lembar cetak. Definisinya
   ditaruh di file sendiri supaya ketiganya memakai sumber yang sama:
   file ini bersih dari import server MAUPUN "use client", jadi boleh
   dipakai komponen server dan komponen klien.
   ============================================================ */

export type Golongan = "Bahan Baku" | "Kemasan" | "Produk Jadi";

/** Urutan tampil. Bahan dulu karena itu yang dihitung di gudang bahan. */
export const URUT_GOLONGAN: Record<Golongan, number> = {
  "Bahan Baku": 0,
  Kemasan: 1,
  "Produk Jadi": 2,
};

/** Judul kelompok, mis. "Produk Jadi · 24 baris · 18 sudah dihitung". */
export function judulGolongan(
  golongan: string,
  jumlah: number,
  terhitung: number
): string {
  return `${golongan} · ${jumlah} baris · ${terhitung} sudah dihitung`;
}
