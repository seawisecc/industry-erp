-- ============================================================
-- QR Signature pindah dari per-ORGANISASI ke per-JENIS DOKUMEN.
--
-- Versi pertama (20260813) memakai satu pengesah untuk semua
-- dokumen. Itu salah dan langsung terlihat begitu datanya nyata:
-- PO disahkan COO, Batch Record diketahui Kepala QA, lembar uji
-- oleh Kepala QC. Satu nama untuk tujuh dokumen berarti enam
-- dokumen mencantumkan pengesah yang keliru.
--
-- Bentuk barunya TIDAK menyimpan nama lagi, cuma menunjuk salah
-- satu slot tanda tangan dokumen itu sendiri:
--   {"aktif": true, "slot": "disetujui"}
--
-- Kenapa menunjuk, bukan menyalin: nama & jabatan sudah ada di
-- `slots` pada baris yang sama. Menyalinnya berarti dua tempat yang
-- harus dijaga sinkron, dan yang pertama tidak sinkron adalah orang
-- yang berganti jabatan. QR akan mencetak jabatan lama sementara
-- kolom tanda tangan mencetak yang baru, di dokumen yang sama.
-- ============================================================

alter table doc_sign_settings
  add column if not exists qr_sign jsonb;

comment on column doc_sign_settings.qr_sign is
  'QR Signature dokumen ini: {"aktif":bool,"slot":"dibuat|disetujui|mengetahui"}. Nama & jabatannya diambil dari slot yang ditunjuk di kolom slots, tidak disalin.';

-- ============================================================
-- Kolom lama SENGAJA tidak di-drop.
--
-- Isinya data yang sudah diisi orang, dan menghapusnya di rilis yang
-- sama dengan penggantinya berarti tidak ada jalan pulang kalau
-- ternyata ada yang terlewat. Aplikasi berhenti membacanya mulai
-- rilis ini; penghapusannya bisa dikerjakan terpisah setelah
-- pengaturan per dokumen terbukti jalan.
--
-- Isinya TIDAK dipindahkan otomatis: pengesah lama satu nama untuk
-- semua dokumen, dan menebak dia mengisi slot yang mana di tiap
-- dokumen justru bisa menerbitkan dokumen atas nama orang yang salah
--, kesalahan yang persis ingin dihilangkan migrasi ini.
-- ============================================================
comment on column organization_settings.qr_sign_aktif is
  'USANG sejak 20260815. QR Signature kini per jenis dokumen di doc_sign_settings.qr_sign. Tidak dibaca aplikasi lagi.';
comment on column organization_settings.qr_sign_nama is
  'USANG sejak 20260815, lihat doc_sign_settings.qr_sign.';
comment on column organization_settings.qr_sign_jabatan is
  'USANG sejak 20260815, lihat doc_sign_settings.qr_sign.';
comment on column organization_settings.qr_sign_instansi is
  'USANG sejak 20260815, lihat doc_sign_settings.qr_sign.';
