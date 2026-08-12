/* ============================================================
   Peringatan kekurangan stok bahan, dipasang di AWAL alur produksi.

   Stok baru benar-benar terpotong di Input Hasil (create_production).
   Artinya, sebelum ada peringatan ini, kekurangan bahan baru ketahuan
   di ujung alur: ruahan sudah dibuat, penimbangan sudah dicatat, lalu
   RPC menolak. Yang batal bukan satu klik, tapi setengah hari kerja
   satu tim.

   Angka pembandingnya WAJIB sama dengan yang dipakai RPC saat
   memotong: jumlah `purchase_batches.qty_sisa`. Lot yang masih di
   karantina (`qty_karantina`) sengaja tidak dihitung, karena memang
   belum boleh dipakai produksi. Menghitungnya di sini akan membuat
   layar bilang "cukup" untuk barang yang tetap ditolak RPC, dan
   peringatan yang salah lebih buruk daripada tidak ada peringatan.

   Ini peringatan, BUKAN penghalang. Plan boleh disimpan dan
   penimbangan boleh dicatat walau stoknya kurang: bahannya bisa saja
   baru datang menjelang tanggal produksi. Yang tidak boleh terjadi
   cuma satu, orang mulai bekerja tanpa tahu.
   ============================================================ */

/** Bentuk minimum satu bahan yang stoknya bisa dicek. */
export type ItemStok = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  /** jumlah qty_sisa seluruh lot, stok yang sudah boleh dipakai */
  stok: number;
};

export type Kekurangan = {
  item_id: string;
  kode: string;
  nama: string;
  satuan: string;
  butuh: number;
  stok: number;
  /** butuh - stok, selalu lebih dari nol */
  kurang: number;
};

/**
 * Toleransi galat pembulatan float, bukan kelonggaran stok.
 * Menjumlahkan ratusan angka desimal menyisakan sisa sekitar 1e-12,
 * dan tanpa toleransi itu muncul sebagai "kurang 0,0000000001 kg".
 */
const TOLERANSI = 1e-6;

/** Gabungkan qty per item, satu bahan bisa dipakai beberapa baris. */
export function gabungKebutuhan(
  baris: Iterable<{ item_id: string; qty: number }>
): Map<string, number> {
  const total = new Map<string, number>();
  for (const b of baris) {
    if (!b.item_id || !(b.qty > 0)) continue;
    total.set(b.item_id, (total.get(b.item_id) || 0) + b.qty);
  }
  return total;
}

/**
 * Bahan yang kebutuhannya melebihi stok, terbanyak kurangnya dulu.
 * Bahan yang tidak ditemukan di daftar item dianggap stoknya nol:
 * yang keliru justru mendiamkannya.
 */
export function hitungKekurangan(
  kebutuhan: Map<string, number>,
  itemOf: (id: string) => ItemStok | undefined
): Kekurangan[] {
  const hasil: Kekurangan[] = [];
  for (const [item_id, butuh] of kebutuhan) {
    if (!(butuh > 0)) continue;
    const item = itemOf(item_id);
    const stok = item?.stok ?? 0;
    if (butuh - stok <= TOLERANSI) continue;
    hasil.push({
      item_id,
      kode: item?.kode || "-",
      nama: item?.nama || "Bahan tidak dikenal",
      satuan: item?.satuan || "",
      butuh,
      stok,
      kurang: butuh - stok,
    });
  }
  return hasil.sort((a, b) => b.kurang - a.kurang || a.kode.localeCompare(b.kode));
}
