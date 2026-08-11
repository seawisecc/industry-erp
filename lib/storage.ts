/* ============================================================
   Pemakaian penyimpanan per organisasi — sisi baca.

   File ini SENGAJA bersih dari import server (lihat bab "Batas
   server/klien di lib/" pada CLAUDE.md): kartu penyimpanan di
   Settings punya tombol Hitung Ulang, jadi komponennya "use client"
   dan tetap butuh tipe + pemformatan yang sama dengan sisi server.

   Angkanya dibaca dari snapshot `organization_storage` yang diisi
   fungsi Postgres `refresh_org_storage()`. Cara pembagiannya per
   tenant dijelaskan di migrasi 20260812_org_storage.sql — yang perlu
   diingat di sisi aplikasi cuma satu: ini ESTIMASI proporsional,
   bukan hasil pengukuran byte per baris, dan wajib disebut begitu
   di layar karena angkanya dipakai untuk menagih.
   ============================================================ */

export const BYTES_PER_GB = 1024 ** 3;

/** Kuota bawaan kalau organisasi belum punya nilai sendiri. */
export const KUOTA_DEFAULT_GB = 10;

export type TabelPemakaian = {
  tabel: string;
  baris: number;
  bytes: number;
};

export type PemakaianStorage = {
  bytes: number;
  baris: number;
  perTabel: TabelPemakaian[];
  dihitungPada: string | null;
  quotaGb: number;
  /** Persentase kuota terpakai. Bisa melebihi 100. */
  persen: number;
  lewatKuota: boolean;
  /** ≥ 80% kuota — layar mulai memberi peringatan halus. */
  mendekatiBatas: boolean;
};

/** Baris mentah dari tabel organization_storage. */
export type StorageRow = {
  organization_id: string;
  bytes: number | string;
  baris: number | string;
  per_tabel: TabelPemakaian[] | null;
  dihitung_pada: string;
};

export function bacaPemakaian(
  row: StorageRow | null | undefined,
  quotaGb: number | null | undefined
): PemakaianStorage {
  const bytes = Number(row?.bytes || 0);
  const quota = Number(quotaGb ?? KUOTA_DEFAULT_GB) || KUOTA_DEFAULT_GB;
  const persen = (bytes / (quota * BYTES_PER_GB)) * 100;
  return {
    bytes,
    baris: Number(row?.baris || 0),
    perTabel: Array.isArray(row?.per_tabel) ? row.per_tabel : [],
    dihitungPada: row?.dihitung_pada || null,
    quotaGb: quota,
    persen,
    lewatKuota: persen > 100,
    mendekatiBatas: persen >= 80,
  };
}

/**
 * Ukuran yang enak dibaca orang.
 *
 * Basis 1024 (KiB/MiB/GiB) tapi ditulis KB/MB/GB, sama seperti yang
 * dipakai Supabase di dashboard-nya — kalau di sini pakai basis 1000
 * sementara tagihan Supabase pakai 1024, dua angka yang seharusnya
 * sama akan terlihat berbeda ~7% dan tidak ada yang tahu mana benar.
 */
export function formatBytes(n: number): string {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  const satuan = ["KB", "MB", "GB", "TB"];
  let nilai = b / 1024;
  let i = 0;
  while (nilai >= 1024 && i < satuan.length - 1) {
    nilai /= 1024;
    i++;
  }
  return `${nilai.toLocaleString("id-ID", {
    maximumFractionDigits: nilai < 10 ? 2 : 1,
  })} ${satuan[i]}`;
}

/** Warna bar & badge mengikuti tingkat pemakaian. */
export function toneStorage(p: PemakaianStorage) {
  if (p.lewatKuota) return { bar: "bg-clay-600", teks: "text-clay-600" };
  if (p.mendekatiBatas) return { bar: "bg-amber-500", teks: "text-amber-500" };
  return { bar: "bg-botanical-700", teks: "text-ink" };
}

/** "24%" dengan pembulatan yang tidak menyesatkan di ujung-ujungnya. */
export function persenStr(p: number): string {
  if (p > 0 && p < 1) return "<1%";
  return `${p.toLocaleString("id-ID", { maximumFractionDigits: 0 })}%`;
}

/** "dihitung 14/08/2026 09:32" — snapshot wajib menyebut kapan diambil. */
export function waktuHitung(iso: string | null): string {
  if (!iso) return "belum pernah dihitung";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}
