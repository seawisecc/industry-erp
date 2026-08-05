-- ============================================================
-- Audit trail / log aktivitas.
--
-- MASALAH YANG DISELESAIKAN
--
-- Tidak ada satu pun jejak siapa mengubah apa. Kalau qty PO berubah,
-- batch diluluskan QA, atau invoice dibatalkan, yang tersisa cuma
-- keadaan akhirnya. Untuk audit CPKB itu tidak cukup: auditor menanyakan
-- siapa memutuskan, kapan, dan nilainya berubah dari berapa jadi berapa.
--
-- KENAPA TRIGGER, BUKAN DICATAT DARI SERVER ACTION
--
-- Kalau log ditulis dari TypeScript sesudah RPC berhasil, itu tulisan
-- KEDUA di luar transaksi: gagal di situ = dokumen ada tapi jejaknya
-- tidak. Lebih buruk lagi, tiap jalur kode baru harus ingat memanggil
-- helper-nya, dan yang lupa tidak ketahuan sampai auditnya jalan.
--
-- Trigger menutup dua-duanya. Log ditulis di transaksi yang SAMA dengan
-- perubahannya (batal berarti batal dua-duanya), dan berlaku untuk semua
-- jalur — server action, RPC, bahkan perubahan manual lewat SQL Editor.
--
-- KENAPA SECURITY DEFINER + TANPA POLICY TULIS
--
-- Fungsi trigger berjalan sebagai pemiliknya, jadi bisa menulis log
-- walaupun tabelnya tidak punya policy INSERT untuk user. Akibatnya
-- yang disengaja: aplikasi (dan siapa pun yang login) BISA MEMBACA
-- log organisasinya, tapi tidak bisa menyisipkan, mengubah, atau
-- menghapus satu baris pun. Log yang bisa disunting bukan audit trail.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================


-- ============================================================
-- 1. Tabel
-- ============================================================

create table if not exists public.activity_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Pelaku. Nama & email di-SNAPSHOT, bukan cuma direlasikan: log harus
  -- tetap terbaca setelah akun pelakunya dinonaktifkan atau dihapus.
  --
  -- user_id SENGAJA tanpa foreign key ke profiles. Menghapus pengguna
  -- memicu trigger log yang menulis baris dengan user_id pelakunya; kalau
  -- pelakunya menghapus dirinya sendiri (atau profil ikut terhapus lewat
  -- cascade), FK-nya gagal dan justru MEMBATALKAN penghapusan yang sedang
  -- diaudit. Constraint di tabel audit tidak boleh bisa memblokir operasi
  -- yang dicatatnya.
  user_id         uuid,
  user_nama       text,
  user_email      text,

  modul           text not null,   -- segmen URL, mis. 'purchase-orders'
  tabel           text not null,
  aksi            text not null,   -- 'Buat' | 'Ubah' | 'Hapus'

  dokumen_id      uuid,
  dokumen_no      text,            -- snapshot nomor dokumen saat kejadian
  ringkasan       text not null,
  -- {kolom: {dari, ke}} untuk aksi Ubah. Nilai jsonb/array yang besar
  -- (execution_data, qc_hasil) tidak disalin isinya, cukup ditandai.
  perubahan       jsonb,

  created_at      timestamptz not null default now()
);

create index if not exists activity_logs_org_waktu_idx
  on public.activity_logs (organization_id, created_at desc);

create index if not exists activity_logs_org_modul_idx
  on public.activity_logs (organization_id, modul, created_at desc);

-- Riwayat satu dokumen tertentu
create index if not exists activity_logs_dokumen_idx
  on public.activity_logs (dokumen_id);


-- ============================================================
-- 2. RLS: boleh dibaca satu organisasi, tidak boleh ditulis siapa pun
--
-- Tidak ada policy INSERT/UPDATE/DELETE, dan itu disengaja. Penulisan
-- hanya lewat fungsi trigger SECURITY DEFINER di bawah.
-- ============================================================

alter table public.activity_logs enable row level security;

drop policy if exists activity_logs_read on public.activity_logs;
create policy activity_logs_read on public.activity_logs
  for select to authenticated
  using (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  );


-- ============================================================
-- 3. Fungsi trigger umum
--
-- Dipasang per tabel lewat argumen:
--   TG_ARGV[0] modul           segmen URL untuk filter & link di UI
--   TG_ARGV[1] kolom_nomor     kolom nomor dokumen, '' kalau tidak ada
--   TG_ARGV[2] kolom_dipantau  daftar kolom dipisah koma; '' = semua.
--                              Dipakai supaya UPDATE rutin tidak membanjiri
--                              log — mis. purchase_batches.qty_sisa berubah
--                              tiap pemotongan FEFO, dan itu bukan keputusan
--                              siapa-siapa.
-- ============================================================
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modul     text := TG_ARGV[0];
  v_no_col    text := coalesce(TG_ARGV[1], '');
  v_pantau    text[] := case
                          when coalesce(TG_ARGV[2], '') = '' then null
                          else string_to_array(TG_ARGV[2], ',')
                        end;
  v_row       jsonb;
  v_old       jsonb;
  v_new       jsonb;
  v_aksi      text;
  v_org       uuid;
  v_doc_id    uuid;
  v_doc_no    text;
  v_label     text;
  v_diff      jsonb := '{}'::jsonb;
  v_kolom     text[] := '{}';
  v_key       text;
  v_dari      jsonb;
  v_ke        jsonb;
  v_uid       uuid := auth.uid();
  v_nama      text;
  v_email     text;
  v_ringkasan text;
  -- Kolom teknis: perubahannya tidak berarti apa-apa bagi auditor
  v_abaikan   text[] := array['created_at', 'updated_at', 'organization_id'];
begin
  if TG_OP = 'DELETE' then
    v_row  := to_jsonb(OLD);
    v_aksi := 'Hapus';
  elsif TG_OP = 'INSERT' then
    v_row  := to_jsonb(NEW);
    v_aksi := 'Buat';
  else
    v_row  := to_jsonb(NEW);
    v_aksi := 'Ubah';
  end if;

  v_org := nullif(v_row->>'organization_id', '')::uuid;
  -- Baris tanpa organisasi tidak bisa ditempatkan di log mana pun
  if v_org is null then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  v_doc_id := nullif(v_row->>'id', '')::uuid;
  if v_no_col <> '' then
    v_doc_no := nullif(v_row->>v_no_col, '');
  end if;
  v_label := coalesce(v_doc_no, left(coalesce(v_doc_id::text, '?'), 8));

  if TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    for v_key in select k from jsonb_object_keys(v_new) k loop
      continue when v_key = any(v_abaikan);
      continue when v_pantau is not null and not (v_key = any(v_pantau));
      continue when v_old->v_key is not distinct from v_new->v_key;

      -- Isi jsonb/array besar cukup ditandai berubah. Menyalinnya bulat-bulat
      -- membuat satu baris log berukuran puluhan kilobyte tanpa menambah
      -- informasi yang bisa dibaca orang.
      if jsonb_typeof(v_new->v_key) in ('object', 'array')
         or jsonb_typeof(v_old->v_key) in ('object', 'array') then
        v_dari := to_jsonb('(data)'::text);
        v_ke   := to_jsonb('(diubah)'::text);
      else
        v_dari := v_old->v_key;
        v_ke   := v_new->v_key;
      end if;

      v_diff  := v_diff || jsonb_build_object(
                   v_key, jsonb_build_object('dari', v_dari, 'ke', v_ke)
                 );
      v_kolom := v_kolom || v_key;
    end loop;

    -- Tidak ada perubahan nyata (mis. form disimpan ulang tanpa diubah,
    -- atau yang berubah cuma kolom di luar daftar pantau)
    if cardinality(v_kolom) = 0 then
      return NEW;
    end if;
  end if;

  if v_uid is not null then
    select p.nama, p.email into v_nama, v_email
    from profiles p
    where p.id = v_uid;
  end if;

  v_ringkasan := case
    when TG_OP = 'INSERT' then v_label || ' dibuat'
    when TG_OP = 'DELETE' then v_label || ' dihapus'
    else v_label || ' diubah: ' || array_to_string(v_kolom, ', ')
  end;

  insert into activity_logs (
    organization_id, user_id, user_nama, user_email,
    modul, tabel, aksi, dokumen_id, dokumen_no, ringkasan, perubahan
  ) values (
    v_org, v_uid,
    -- Perubahan lewat SQL Editor / service role tidak punya auth.uid()
    coalesce(v_nama, case when v_uid is null then 'Sistem' else 'Pengguna dihapus' end),
    v_email,
    v_modul, TG_TABLE_NAME, v_aksi, v_doc_id, v_doc_no, v_ringkasan,
    case when TG_OP = 'UPDATE' then v_diff else null end
  );

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;


-- ============================================================
-- 4. Fungsi trigger khusus formula produk
--
-- Formula TIDAK di-update per baris: menyimpan produk selalu menghapus
-- seluruh baris formula lalu menyisipkan ulang (lihat saveProduct di
-- app/(app)/products/actions.ts). Trigger per-baris akan menghasilkan 2N
-- entri untuk satu kali simpan.
--
-- Karena itu trigger ini FOR EACH STATEMENT: satu entri per pernyataan,
-- dan pada penyisipan ikut menyimpan SNAPSHOT formula utuhnya. Snapshot
-- itulah yang bernilai untuk audit CPKB, "formula produk X per tanggal
-- sekian adalah persis ini".
--
-- Satu kali edit formula tetap menghasilkan sepasang entri (Hapus lalu
-- Ubah) karena memang begitu yang terjadi di database.
-- ============================================================
create or replace function public.log_formula_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org       uuid;
  v_pid       uuid;
  v_n         int;
  v_kode      text;
  v_nama      text;
  v_uid       uuid := auth.uid();
  v_user      text;
  v_email     text;
  v_snapshot  jsonb;
begin
  -- organization_id & product_id diambil lewat LIMIT 1, bukan min():
  -- Postgres tidak punya agregat min() untuk tipe uuid. Satu pernyataan
  -- selalu menyentuh satu produk saja (lihat insertFormulasAndVariants),
  -- jadi baris mana pun mewakili seluruhnya.
  if TG_OP = 'DELETE' then
    select count(*) into v_n from lama;
    select organization_id, product_id into v_org, v_pid from lama limit 1;
  else
    select count(*) into v_n from baru;
    select organization_id, product_id into v_org, v_pid from baru limit 1;

    -- Snapshot formula sesudah perubahan, urut biar enak dibaca
    select jsonb_agg(
             jsonb_build_object(
               'item', coalesce(i.nama, '(item terhapus)'),
               'kode', i.kode,
               'fase', b.fase,
               'persen', b.percentage
             )
             order by b.fase nulls last, b.percentage desc
           )
      into v_snapshot
    from baru b
    left join items i on i.id = b.item_id;
  end if;

  if v_org is null or v_n = 0 then
    return null;
  end if;

  select p.kode, p.nama_produk into v_kode, v_nama
  from products p
  where p.id = v_pid;

  if v_uid is not null then
    select p.nama, p.email into v_user, v_email
    from profiles p
    where p.id = v_uid;
  end if;

  insert into activity_logs (
    organization_id, user_id, user_nama, user_email,
    modul, tabel, aksi, dokumen_id, dokumen_no, ringkasan, perubahan
  ) values (
    v_org, v_uid,
    coalesce(v_user, case when v_uid is null then 'Sistem' else 'Pengguna dihapus' end),
    v_email,
    'products', 'product_formulas',
    case when TG_OP = 'DELETE' then 'Hapus' else 'Ubah' end,
    v_pid, v_kode,
    case
      when TG_OP = 'DELETE'
        then 'Formula lama ' || coalesce(v_nama, 'produk') || ' dihapus (' || v_n || ' bahan)'
      else 'Formula ' || coalesce(v_nama, 'produk') || ' ditetapkan (' || v_n || ' bahan)'
    end,
    case when TG_OP = 'DELETE' then null else jsonb_build_object('formula', v_snapshot) end
  );

  return null;
end;
$$;


-- ============================================================
-- 5. Pemasangan trigger
--
-- Menambah tabel yang dipantau = satu blok seperti di bawah. Tabel
-- baris anak (po_items, sales_invoice_items, consignment_items) sengaja
-- TIDAK dipantau: setiap alur yang mengubahnya selalu ikut menyentuh
-- header-nya, jadi kejadiannya sudah tercatat sekali dengan nomor
-- dokumen yang benar, bukan berkali-kali tanpa konteks.
-- ============================================================

-- Pembelian
drop trigger if exists trg_log_purchase_orders on public.purchase_orders;
create trigger trg_log_purchase_orders
  after insert or update or delete on public.purchase_orders
  for each row execute function public.log_activity('purchase-orders', 'no_po', '');

drop trigger if exists trg_log_receivings on public.receivings;
create trigger trg_log_receivings
  after insert or update or delete on public.receivings
  for each row execute function public.log_activity('receivings', 'no_invoice', '');

-- QC barang masuk. HANYA update, dan hanya kolom keputusan QC:
-- qty_sisa berubah tiap pemotongan FEFO dan akan membanjiri log.
drop trigger if exists trg_log_purchase_batches on public.purchase_batches;
create trigger trg_log_purchase_batches
  after update on public.purchase_batches
  for each row execute function public.log_activity(
    'qc-incoming', 'no_lot_supplier',
    'qc_status,qty_karantina,exp_date,qc_note,qc_hasil,qc_oleh,retest_note'
  );

drop trigger if exists trg_log_batch_dispositions on public.batch_dispositions;
create trigger trg_log_batch_dispositions
  after insert on public.batch_dispositions
  for each row execute function public.log_activity('items', 'tipe', '');

-- Produksi & QA
drop trigger if exists trg_log_production_plans on public.production_plans;
create trigger trg_log_production_plans
  after insert or update or delete on public.production_plans
  for each row execute function public.log_activity('production', 'no_batch', '');

drop trigger if exists trg_log_production_batches on public.production_batches;
create trigger trg_log_production_batches
  after insert or update or delete on public.production_batches
  for each row execute function public.log_activity('production', 'no_batch_produksi', '');

-- Penjualan
drop trigger if exists trg_log_sales_invoices on public.sales_invoices;
create trigger trg_log_sales_invoices
  after insert or update or delete on public.sales_invoices
  for each row execute function public.log_activity('sales-invoices', 'no_invoice', '');

drop trigger if exists trg_log_sales_payments on public.sales_payments;
create trigger trg_log_sales_payments
  after insert or delete on public.sales_payments
  for each row execute function public.log_activity('sales-payments', '', '');

drop trigger if exists trg_log_consignments on public.consignments;
create trigger trg_log_consignments
  after insert or update or delete on public.consignments
  for each row execute function public.log_activity('consignments', 'no_konsinyasi', '');

-- Stok
drop trigger if exists trg_log_material_issues on public.material_issues;
create trigger trg_log_material_issues
  after insert or update or delete on public.material_issues
  for each row execute function public.log_activity('material-issues', 'no_pemakaian', '');

drop trigger if exists trg_log_stock_adjustments on public.stock_adjustments;
create trigger trg_log_stock_adjustments
  after insert or update or delete on public.stock_adjustments
  for each row execute function public.log_activity('data-migration', '', '');

-- Master data yang memengaruhi dokumen & regulasi
drop trigger if exists trg_log_products on public.products;
create trigger trg_log_products
  after insert or update or delete on public.products
  for each row execute function public.log_activity('products', 'kode', '');

drop trigger if exists trg_log_items on public.items;
create trigger trg_log_items
  after insert or update or delete on public.items
  for each row execute function public.log_activity('items', 'kode', '');

drop trigger if exists trg_log_services on public.services;
create trigger trg_log_services
  after insert or update or delete on public.services
  for each row execute function public.log_activity('services', 'kode', '');

drop trigger if exists trg_log_clients on public.clients;
create trigger trg_log_clients
  after insert or update or delete on public.clients
  for each row execute function public.log_activity('clients', 'kode', '');

drop trigger if exists trg_log_suppliers on public.suppliers;
create trigger trg_log_suppliers
  after insert or update or delete on public.suppliers
  for each row execute function public.log_activity('suppliers', 'nama', '');

-- Perubahan hak akses: siapa memberi izin apa ke siapa
drop trigger if exists trg_log_profiles on public.profiles;
create trigger trg_log_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.log_activity('users', 'email', '');

-- Formula produk, per PERNYATAAN (lihat catatan di log_formula_change)
drop trigger if exists trg_log_formula_ins on public.product_formulas;
create trigger trg_log_formula_ins
  after insert on public.product_formulas
  referencing new table as baru
  for each statement execute function public.log_formula_change();

drop trigger if exists trg_log_formula_del on public.product_formulas;
create trigger trg_log_formula_del
  after delete on public.product_formulas
  referencing old table as lama
  for each statement execute function public.log_formula_change();
