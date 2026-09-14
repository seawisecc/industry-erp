-- ============================================================
-- Label 'Dibatalkan' di enum po_status
--
-- MASALAH YANG DISELESAIKAN
--
-- Seluruh aplikasi sudah bicara "Dibatalkan": `cancelPO` menulisnya,
-- filter Status menawarkannya, `STATUS_STYLE` punya warnanya, dan tombol
-- Batal disembunyikan untuk status itu. Enum `po_status` di database
-- TIDAK punya labelnya, dan itu baru ketahuan waktu migrasi
-- 20260828 ditolak dengan
--
--   ERROR 22P02: invalid input value for enum po_status: "Dibatalkan"
--
-- Akibatnya di lapangan dua-duanya diam:
--
--   - Tombol Batal PO gagal dengan pesan mentah dari database, jadi PO
--     yang salah ketik atau batal dipesan tidak pernah bisa ditutup.
--   - Filter "Dibatalkan" selalu kosong tanpa keterangan apa pun,
--     karena query yang error mengembalikan data null dan halamannya
--     menuliskannya sebagai "tidak ada yang cocok".
--
-- KENAPA ENUM-NYA YANG DITAMBAH, BUKAN KODENYA YANG DIGANTI
--
-- Kalau enum ini sudah punya label pembatalan dengan ejaan lain, yang
-- benar adalah menyesuaikan KODE ke label itu: nilai data di project ini
-- hidup di database dan divalidasi di SQL, dan dua label yang artinya
-- sama akan memecah PO batal jadi dua kelompok yang harus diingat setiap
-- filter dan laporan. Karena itu skrip ini MEMERIKSA dulu dan berhenti
-- kalau menemukannya.
--
-- Kalau tidak ada sama sekali, menambah label adalah pilihan yang benar:
-- seluruh aplikasi sudah memakai kata itu di enam tempat, dan mengganti
-- kata di enam tempat untuk menyesuaikan satu label yang belum ada cuma
-- memindahkan pekerjaan tanpa menghasilkan apa pun.
--
-- CATATAN: nilai enum TIDAK BISA dihapus di Postgres. Jadi ini keputusan
-- sekali jalan, dan itu alasan kedua pemeriksaan di bawah ada.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================


-- ============================================================
-- 1. Berhenti kalau sudah ada label pembatalan dengan ejaan lain
-- ============================================================
do $$
declare
  v_lain text;
begin
  select string_agg(enumlabel, ', ' order by enumsortorder)
    into v_lain
  from pg_enum
  where enumtypid = 'public.po_status'::regtype
    and enumlabel ilike '%batal%'
    and enumlabel <> 'Dibatalkan';

  if v_lain is not null then
    raise exception
      'po_status sudah punya label pembatalan: %. Jangan tambah '
      '"Dibatalkan", yang harus disesuaikan adalah kode aplikasinya.',
      v_lain;
  end if;
end $$;


-- ============================================================
-- 2. Labelnya
--
-- Ditaruh sesudah 'Selesai' supaya urutan deklarasi enum-nya ikut masuk
-- akal. Urutan daftar PO sendiri tidak bergantung pada ini: sejak
-- 20260828 yang dipakai `status_urut`, dan di situ 'Dibatalkan' sudah
-- bernilai 6 karena perbandingannya lewat text.
-- ============================================================
alter type public.po_status add value if not exists 'Dibatalkan' after 'Selesai';


-- ============================================================
-- 3. Kolom alasan pembatalan
--
-- `cancelPO` menulisnya bersama statusnya. Ditulis di sini dengan
-- `if not exists` karena definisi tabelnya tidak di-track di repo, jadi
-- tidak ada satu berkas pun yang bisa dibaca untuk memastikan kolomnya
-- sudah ada. Alasan batal wajib disimpan: PO yang ditutup tanpa
-- keterangan meninggalkan pertanyaan yang tidak bisa dijawab siapa pun
-- berbulan-bulan kemudian.
-- ============================================================
alter table public.purchase_orders
  add column if not exists catatan_batal text;

comment on column public.purchase_orders.catatan_batal is
  'Alasan PO ini dibatalkan, diisi bersama status Dibatalkan lewat '
  'cancelPO. Hanya bisa selama belum ada barang yang diterima.';


-- ============================================================
-- 4. Beritahu PostgREST
--
-- Label enum baru tidak dikenali sampai schema cache-nya dimuat ulang,
-- dan gejalanya persis sama dengan sebelum migrasi ini: tombol Batal
-- menolak dengan 22P02. Supabase biasanya memuat ulang sendiri, ini
-- cuma memastikan.
-- ============================================================
notify pgrst, 'reload schema';
