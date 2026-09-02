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

export type SortDir = "asc" | "desc";

export type ListQuery = {
  page: number;
  q: string;
  /** nilai filter per nama param, mis. { status: "Lunas" } */
  filter: (name: string) => string;
  from: number;
  to: number;
  /** kunci urut dari `?sort=`, "" kalau memakai urutan bawaan */
  sort: string;
  dir: SortDir;
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
    sort: one(sp.sort).trim(),
    dir: one(sp.dir) === "desc" ? "desc" : "asc",
  };
}

/* ============================================================
   Urutan tabel

   Kunci urutnya datang dari URL, jadi TIDAK PERNAH boleh langsung
   dipakai sebagai nama kolom di .order(). Peta `map` di tiap halaman
   yang menjadi daftar putihnya: kunci yang tidak ada di situ diabaikan
   dan tabelnya jatuh ke urutan bawaan.

   Peta yang sama juga yang dipasang di `sort` tiap kolom DataTable,
   jadi tombol yang muncul di layar dan urutan yang benar-benar
   dijalankan berasal dari satu sumber.
   ============================================================ */

export type OrderBy = { column: string; ascending: boolean };

/** Untuk tabel yang paginasi di server: hasilnya diteruskan ke .order(). */
export function orderFor(
  sp: ListQuery,
  map: Record<string, string>,
  fallback: OrderBy
): OrderBy {
  const column = map[sp.sort];
  if (!column) return fallback;
  return { column, ascending: sp.dir !== "desc" };
}

type NilaiUrut = string | number | null | undefined;

/**
 * Untuk tabel yang datanya sudah utuh di memori (Finished Goods,
 * laporan, lembar detail). `accessors` berperan sama dengan `map` di
 * atas: daftar putih sekaligus cara membaca nilainya.
 *
 * Mengembalikan array BARU, tidak mengurutkan di tempat: `rows` sering
 * berasal dari hasil query yang dipakai lagi untuk menghitung total.
 */
export function urutkanBaris<T>(
  rows: T[],
  sp: ListQuery,
  accessors: Record<string, (row: T) => NilaiUrut>,
  bawaan?: (a: T, b: T) => number
): T[] {
  const ambil = accessors[sp.sort];
  if (!ambil) return bawaan ? [...rows].sort(bawaan) : rows;

  const arah = sp.dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = ambil(a);
    const y = ambil(b);
    // Baris tanpa nilai selalu di bawah, arah urut apa pun. Kalau ikut
    // dibalik, menyortir turun menaruh baris kosong di paling atas dan
    // yang dicari orang justru terdorong keluar layar.
    const kosongX = x === null || x === undefined || x === "";
    const kosongY = y === null || y === undefined || y === "";
    if (kosongX || kosongY) return kosongX && kosongY ? 0 : kosongX ? 1 : -1;

    if (typeof x === "number" && typeof y === "number") return (x - y) * arah;
    return (
      String(x).localeCompare(String(y), "id", { numeric: true }) * arah
    );
  });
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
