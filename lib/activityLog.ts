/* ============================================================
   Penerjemah isi tabel activity_logs ke bahasa manusia.

   Log-nya ditulis oleh trigger di Postgres (lihat
   supabase/migrations/20260806_activity_logs.sql), jadi isinya nama
   kolom apa adanya: `status_bayar`, `qa_status`, `can_cancel`. Yang
   membaca log adalah auditor dan pemilik pabrik, bukan yang menulis
   skemanya — penerjemahannya di sini.

   File ini murni pemetaan, tidak menyentuh database. Tidak ada helper
   "catat aktivitas" untuk dipanggil dari server action, dan itu
   disengaja: penulisan log HANYA lewat trigger, supaya tidak ada jalur
   kode yang bisa lupa mencatat.
   ============================================================ */

import { MODULES } from "./modules";

export type AktivitasAksi = "Buat" | "Ubah" | "Hapus";

/** {kolom: {dari, ke}} — bentuk kolom `perubahan` di activity_logs. */
export type Perubahan = Record<string, { dari: unknown; ke: unknown }>;

const MODUL_LABEL = new Map<string, string>(MODULES.map((m) => [m.key, m.label]));

/** Modul yang tidak ada di registry MODULES (halaman khusus Admin). */
const MODUL_TAMBAHAN: Record<string, string> = {
  users: "Users",
  suppliers: "Suppliers",
};

export function labelModul(key: string): string {
  return MODUL_LABEL.get(key) ?? MODUL_TAMBAHAN[key] ?? key;
}

/** Modul yang bisa muncul di log, untuk mengisi dropdown filter. */
export const MODUL_TERPANTAU = [
  "purchase-orders",
  "receivings",
  "qc-incoming",
  "production",
  "sales-invoices",
  "sales-payments",
  "consignments",
  "material-issues",
  "data-migration",
  "products",
  "items",
  "services",
  "clients",
  "suppliers",
  "users",
] as const;

export const AKSI_TONE: Record<AktivitasAksi, string> = {
  Buat: "bg-botanical-100 text-botanical-700",
  Ubah: "bg-amber-100 text-amber-500",
  Hapus: "bg-clay-100 text-clay-600",
};

/**
 * Nama kolom yang penulisannya tidak cukup jelas kalau cuma
 * garis-bawahnya dibuang. Sisanya lewat aturan umum di bawah.
 */
const KOLOM_LABEL: Record<string, string> = {
  qc_status: "Status QC",
  qa_status: "Status QA",
  qa_note: "Catatan QA",
  qc_note: "Catatan QC",
  qc_hasil: "Hasil Uji QC",
  qa_hasil: "Hasil Uji QA",
  qc_produk_hasil: "Hasil Uji Produk Jadi",
  status_bayar: "Status Bayar",
  tanggal_bayar: "Tanggal Bayar",
  jatuh_tempo: "Jatuh Tempo",
  top_days: "TOP (hari)",
  tipe: "Tipe Dokumen",
  aktif: "Status Aktif",
  role: "Peran",
  allowed_modules: "Modul yang Diizinkan",
  can_cancel: "Izin Batalkan Transaksi",
  can_approve_po: "Izin Setujui PO",
  can_plan_production: "Izin Buat Instruksi Produksi",
  can_qc: "Izin QC",
  can_qa: "Izin QA",
  execution_data: "Data Eksekusi Produksi",
  steps_snapshot: "Snapshot Cara Pembuatan",
  qty_karantina: "Qty Karantina",
  exp_date: "Tanggal Expired",
  batch_size_kg: "Ukuran Batch (kg)",
  total_invoice: "Total Invoice",
  catatan_batal: "Alasan Pembatalan",
};

export function labelKolom(kolom: string): string {
  if (KOLOM_LABEL[kolom]) return KOLOM_LABEL[kolom];
  const kata = kolom.replace(/_/g, " ");
  return kata.charAt(0).toUpperCase() + kata.slice(1);
}

/** Nilai kolom apa adanya jadi teks yang enak dibaca di log. */
export function formatNilai(v: unknown): string {
  if (v === null || v === undefined || v === "") return "kosong";
  if (typeof v === "boolean") return v ? "Ya" : "Tidak";
  if (Array.isArray(v)) return v.length === 0 ? "kosong" : v.join(", ");
  if (typeof v === "object") return "(data)";
  return String(v);
}
