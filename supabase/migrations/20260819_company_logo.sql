-- ============================================================
-- Logo perusahaan untuk kop dokumen cetak
--
-- Disimpan sebagai data URI di kolom teks, BUKAN sebagai berkas di
-- Supabase Storage. Tiga alasan, dan semuanya soal dokumen cetak:
--
--   1. Dokumen cetak harus utuh sekali render. Logo yang diambil lewat
--      URL bisa gagal atau baru datang sesudah dialog Print terbuka,
--      dan yang tercetak adalah kop tanpa logo tanpa error apa pun.
--   2. Service worker aplikasi ini sengaja tidak menyimpan apa pun
--      (lihat bab PWA di CLAUDE.md), jadi tidak ada jaring pengaman
--      untuk berkas yang gagal diambil.
--   3. Bucket Storage beserta policy-nya tidak bisa di-track di repo,
--      persis masalah yang sama dengan RPC lama yang definisinya cuma
--      ada di project Supabase.
--
-- Harganya: satu baris pengaturan jadi lebih besar. Itu dibatasi di
-- dua sisi, layar mengecilkan gambarnya sebelum dikirim dan server
-- menolak yang kelewat besar (lihat LOGO_MAX_BYTES di lib/logo.ts),
-- jadi sekitar 200 KB per perusahaan. Tidak berarti apa-apa terhadap
-- kuota yang dihitung organization_storage.
-- ============================================================
alter table public.organization_settings
  add column if not exists logo text;

comment on column public.organization_settings.logo is
  'Logo perusahaan sebagai data URI (data:image/png;base64,...). '
  'Dikecilkan di sisi klien sebelum disimpan, dibatasi ~200 KB. '
  'Tampil di kop dokumen cetak A4.';
