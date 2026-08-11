/* ============================================================
   Pagination + pencarian di sisi SERVER.

   Sebelumnya semua halaman list menarik seluruh baris organisasi
   sekaligus, lalu TableSearch menyaring <tr> di browser. Dua
   masalah: (1) PostgREST memotong hasil di batas baris maksimum
   tanpa memberi tahu siapa pun, jadi data lama hilang diam-diam,
   dan (2) penghitung "N baris" cuma menghitung yang ter-render,
   sehingga user yakin datanya lengkap padahal tidak.

   Sekarang: query dibatasi .range(), jumlah total diambil lewat
   count exact, dan pencarian/filter ikut dikirim ke database.
   ============================================================ */

export const PAGE_SIZE = 50;

/** searchParams dari Next.js (App Router) */
export type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export type ListQuery = {
  page: number;
  q: string;
  /** nilai filter per nama param, mis. { status: "Lunas" } */
  filter: (name: string) => string;
  from: number;
  to: number;
};

export function parseListQuery(
  sp: SearchParams,
  pageSize = PAGE_SIZE
): ListQuery {
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);
  const from = (page - 1) * pageSize;
  return {
    page,
    q: one(sp.q).trim(),
    filter: (name) => one(sp[name]).trim(),
    from,
    to: from + pageSize - 1,
  };
}

/**
 * Bangun filter `or=(...)` untuk pencarian ILIKE di beberapa kolom.
 *
 * Nilainya dibungkus kutip ganda: di PostgREST, `,` `.` `(` `)` adalah
 * sintaks filter, dan tanpa kutip kata kunci seperti "PT. Maju, Jaya"
 * akan merusak query. Yang benar-benar tidak boleh lolos cuma kutip
 * ganda dan backslash, karena itu yang bisa keluar dari kutipannya.
 */
export function ilikeOr(columns: string[], q: string): string {
  const safe = q.replace(/["\\]/g, " ").trim();
  return columns.map((c) => `${c}.ilike."%${safe}%"`).join(",");
}

/**
 * Sama seperti ilikeOr, tapi ikut menyertakan baris yang kolom
 * relasinya cocok, dipakai kalau nama client/supplier ada di tabel
 * lain. Pemanggil mencari id-nya dulu, lalu id itu digabung sebagai
 * `kolom.in.(...)`. Dengan cara ini baris tanpa relasi (mis. invoice
 * walk-in tanpa client) tetap ikut tercari, beda dengan !inner join
 * yang justru membuangnya.
 */
export function ilikeOrWithIds(
  columns: string[],
  q: string,
  idColumn: string,
  ids: string[]
): string {
  const base = ilikeOr(columns, q);
  if (ids.length === 0) return base;
  return `${base},${idColumn}.in.(${ids.join(",")})`;
}

export type PageInfo = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number; // nomor baris pertama yang tampil (1-based)
  to: number; // nomor baris terakhir yang tampil
};

export function pageInfo(
  page: number,
  total: number | null,
  shown: number,
  pageSize = PAGE_SIZE
): PageInfo {
  const t = total ?? 0;
  const from = t === 0 ? 0 : (page - 1) * pageSize + 1;
  return {
    page,
    pageSize,
    total: t,
    totalPages: Math.max(1, Math.ceil(t / pageSize)),
    from,
    to: t === 0 ? 0 : from + shown - 1,
  };
}
