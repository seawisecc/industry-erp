-- ============================================================
-- QR Signature (non-certified, validasi internal).
--
-- Ini BUKAN tanda tangan elektronik tersertifikasi: tidak ada
-- otoritas sertifikat, tidak ada kunci privat milik perorangan,
-- dan tidak punya kekuatan hukum setara e-Meterai/PSrE. Yang
-- diberikannya cuma satu hal, dan itu memang yang dibutuhkan di
-- lantai pabrik: cara cepat memastikan selembar kertas benar-benar
-- terbit dari sistem ini, oleh orang yang tercatat, pada tanggal
-- yang tercatat.
--
-- Karena itu TIDAK ADA tabel baru di sini. Sidik dokumennya dihitung
-- ulang dari data dokumen aslinya setiap kali diperlukan (HMAC di
-- sisi aplikasi), bukan disimpan. Kalau disimpan, ia akan jadi
-- salinan kedua yang bisa berbeda dari dokumennya, dan sidik yang
-- bisa berbeda dari yang disidik tidak memvalidasi apa pun.
-- ============================================================

alter table organization_settings
  add column if not exists qr_sign_aktif boolean not null default false,
  add column if not exists qr_sign_nama text,
  add column if not exists qr_sign_jabatan text,
  add column if not exists qr_sign_instansi text;

comment on column organization_settings.qr_sign_aktif is
  'Cetak blok QR Signature di dokumen. Wajib punya nama & jabatan pengesah.';
