-- ============================================================
-- profiles: tidak bisa ditulis lewat sesi user, cuma dibaca.
--
-- MASALAH YANG DISELESAIKAN
--
-- Policy `profiles_write` (FOR ALL) mengizinkan Admin sebuah company
-- menulis baris profiles di organisasinya, dan with_check-nya NULL,
-- jadi syarat yang sama dipakai untuk baris BARU. Tidak ada satu pun
-- yang membatasi KOLOM mana yang boleh diubah. Akibatnya, dengan
-- sesi login-nya sendiri dan anon key yang memang publik, seorang
-- Admin company bisa menjalankan dari konsol browser:
--
--   update profiles set is_super_admin = true where id = auth.uid();
--
-- dan sejak itu melihat serta mengubah data SEMUA company di aplikasi
-- ini. Hal yang sama berlaku untuk memberi dirinya atau orang lain izin
-- apa pun tanpa lewat form Pengguna.
--
-- KENAPA POLICY-NYA DIHAPUS, BUKAN DIPERSEMPIT
--
-- Aplikasi tidak pernah menulis profiles lewat sesi user. Seluruh
-- penulisannya (users/actions.ts, settings/actions.ts,
-- login/actions.ts, companies/actions.ts) memakai createAdminClient,
-- yaitu service role yang memang melewati RLS, dan tiap jalur itu
-- sudah memeriksa perannya sendiri di server. Profil baru dibuat
-- trigger auth. Jadi policy tulis ini tidak dipakai siapa pun kecuali
-- orang yang sengaja memanggil PostgREST langsung.
--
-- Polanya sama dengan activity_logs: tabel yang penulisannya cuma
-- lewat jalur tepercaya dapat `select` saja untuk authenticated.
--
-- URUTAN DEPLOY: tidak ada kode aplikasi yang bergantung pada skrip
-- ini, jadi bisa dijalankan kapan saja. Aman dijalankan berulang.
--
-- MEMBATALKAN: kalau ternyata ada jalur yang menulis profiles lewat
-- sesi user dan jadi gagal ("permission denied" / "row-level
-- security"), jalur itu yang harus pindah ke createAdminClient
-- dengan pemeriksaan peran di server, bukan policy ini yang
-- dikembalikan.
-- ============================================================

drop policy if exists profiles_write on public.profiles;

-- Lapis kedua: tanpa grant, penulisan ditolak bahkan kalau suatu hari
-- ada policy tulis yang ditambahkan tanpa sengaja.
revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.profiles from anon;

-- Baca tetap jalan lewat policy profiles_select yang sudah ada.
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

-- Periksa sesudah dijalankan: yang tersisa cuma profiles_select.
--   select policyname, cmd from pg_policies where tablename = 'profiles';
