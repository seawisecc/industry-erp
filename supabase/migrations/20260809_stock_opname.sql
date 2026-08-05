-- ============================================================
-- Stock opname terjadwal.
--
-- MASALAH YANG DISELESAIKAN
--
-- Adjustment stok sudah ada, tapi bentuknya satu form berisi seluruh
-- item dengan kolom qty yang sudah terisi angka sistem. Untuk opname
-- beneran itu dua masalah:
--
--  1) Angka sistemnya kelihatan waktu menghitung. Orang yang memegang
--     lembar berisi "seharusnya 47" akan menulis 47. Hitungan fisik
--     harus dilakukan BUTA supaya ada gunanya.
--  2) Tidak ada cut-off. Adjustment membandingkan dengan stok saat
--     tombol disimpan, padahal menghitung gudang butuh berjam-jam.
--
-- CARA KERJANYA DI SINI
--
-- Opname memotret stok sistem SAAT DOKUMEN DIBUAT (qty_sistem), lalu
-- lembar hitungnya dicetak TANPA angka itu. Hasil hitung fisik diisi
-- belakangan, dan selisihnya dihitung terhadap potret tadi — bukan
-- terhadap stok yang mungkin sudah bergerak.
--
-- Penyesuaian akhirnya tetap lewat create_stock_adjustment yang sudah
-- ada, bukan logika baru. Itu satu-satunya tempat yang tahu cara
-- menambah batch dan memotong FEFO, dan menyalinnya ke sini akan jadi
-- dua kebenaran yang cepat atau lambat berbeda.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================


-- ============================================================
-- 1. Tabel
-- ============================================================

create table if not exists public.stock_opnames (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  no_opname       text not null,
  tanggal         date not null,
  -- null = seluruh item; selain itu 'Bahan Baku' / 'Kemasan'
  kategori        text,
  status          text not null default 'Berjalan',
  catatan         text,
  -- Adjustment yang dihasilkan saat opname ditutup. null berarti
  -- hitungannya cocok semua dan memang tidak ada yang perlu disesuaikan.
  adjustment_id   uuid references public.stock_adjustments(id) on delete set null,
  tanggal_selesai date,
  dibuat_oleh     uuid,
  created_at      timestamptz not null default now()
);

create unique index if not exists stock_opnames_no_uniq
  on public.stock_opnames (organization_id, no_opname);

create index if not exists stock_opnames_org_tanggal_idx
  on public.stock_opnames (organization_id, tanggal desc);

create table if not exists public.stock_opname_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opname_id       uuid not null references public.stock_opnames(id) on delete cascade,
  item_id         uuid not null references public.items(id) on delete cascade,
  -- Potret stok sistem saat opname dibuat. TIDAK pernah dihitung ulang:
  -- inilah pembanding yang sah untuk hasil hitung fisik.
  qty_sistem      numeric not null default 0,
  -- null = belum dihitung. Beda dengan 0 yang berarti "dihitung, hasilnya
  -- memang kosong" — dan itu justru selisih yang paling perlu ditindak.
  qty_fisik       numeric,
  catatan         text
);

create unique index if not exists stock_opname_items_uniq
  on public.stock_opname_items (opname_id, item_id);

create index if not exists stock_opname_items_org_idx
  on public.stock_opname_items (organization_id, item_id);


-- ============================================================
-- 2. Row Level Security
-- ============================================================

alter table public.stock_opnames      enable row level security;
alter table public.stock_opname_items enable row level security;

drop policy if exists stock_opnames_org on public.stock_opnames;
create policy stock_opnames_org on public.stock_opnames
  for all to authenticated
  using (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  )
  with check (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  );

drop policy if exists stock_opname_items_org on public.stock_opname_items;
create policy stock_opname_items_org on public.stock_opname_items
  for all to authenticated
  using (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  )
  with check (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  );


-- ============================================================
-- 3. create_stock_opname_tx
--
-- Buka opname baru + potret stok sistem seluruh item dalam cakupan.
-- ============================================================
create or replace function public.create_stock_opname_tx(
  p_organization_id uuid,
  p_tanggal         date,
  p_kategori        text,    -- null = seluruh item
  p_catatan         text,
  p_dibuat_oleh     uuid
) returns uuid
language plpgsql
as $$
declare
  v_prefix text;
  v_seq    int;
  v_no     text;
  v_opname uuid;
  v_jumlah int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_tanggal is null then
    raise exception 'Tanggal opname wajib diisi';
  end if;

  if p_kategori is not null and p_kategori not in ('Bahan Baku', 'Kemasan') then
    raise exception 'Kategori opname tidak dikenal';
  end if;

  -- Satu opname berjalan pada satu waktu. Dua opname terbuka bersamaan
  -- berarti dua potret stok yang saling menimpa saat ditutup.
  if exists (
    select 1 from stock_opnames
    where organization_id = p_organization_id and status = 'Berjalan'
  ) then
    raise exception 'Masih ada opname yang berjalan. Selesaikan atau batalkan dulu.';
  end if;

  v_prefix := 'OPN.' || to_char(p_tanggal, 'YYYYMM');
  select coalesce(max(substring(no_opname from length(v_prefix) + 1)::int), 0)
    into v_seq
  from stock_opnames
  where organization_id = p_organization_id
    and no_opname like v_prefix || '%'
    and substring(no_opname from length(v_prefix) + 1) ~ '^\d+$';

  v_no := v_prefix || lpad((v_seq + 1)::text, 3, '0');

  insert into stock_opnames (
    organization_id, no_opname, tanggal, kategori, catatan, dibuat_oleh
  ) values (
    p_organization_id, v_no, p_tanggal, p_kategori,
    nullif(trim(coalesce(p_catatan, '')), ''), p_dibuat_oleh
  ) returning id into v_opname;

  insert into stock_opname_items (organization_id, opname_id, item_id, qty_sistem)
  select
    p_organization_id,
    v_opname,
    i.id,
    coalesce((
      select sum(pb.qty_sisa)
      from purchase_batches pb
      where pb.item_id = i.id
        and pb.organization_id = p_organization_id
    ), 0)
  from items i
  where i.organization_id = p_organization_id
    and i.aktif = true
    and (p_kategori is null or i.kategori::text = p_kategori);

  get diagnostics v_jumlah = row_count;
  if v_jumlah = 0 then
    raise exception 'Tidak ada item aktif dalam cakupan opname ini';
  end if;

  return v_opname;
end;
$$;


-- ============================================================
-- 4. save_opname_count_tx
--
-- Simpan hasil hitung fisik. Boleh dipanggil berkali-kali (progres
-- disimpan sambil jalan), selama opname belum ditutup.
-- ============================================================
create or replace function public.save_opname_count_tx(
  p_organization_id uuid,
  p_opname_id       uuid,
  p_items           jsonb   -- [{item_id, qty_fisik, catatan}] ; qty_fisik null = belum dihitung
) returns void
language plpgsql
as $$
declare
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select status into v_status
  from stock_opnames
  where id = p_opname_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Dokumen opname tidak ditemukan';
  end if;
  if v_status <> 'Berjalan' then
    raise exception 'Opname ini sudah ditutup, hasilnya tidak bisa diubah lagi';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    return;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where (x->>'qty_fisik') is not null and (x->>'qty_fisik')::numeric < 0
  ) then
    raise exception 'Hasil hitung fisik tidak boleh negatif';
  end if;

  update stock_opname_items oi
     set qty_fisik = nullif(x->>'qty_fisik', '')::numeric,
         catatan   = nullif(trim(coalesce(x->>'catatan', '')), '')
  from jsonb_array_elements(p_items) x
  where oi.opname_id = p_opname_id
    and oi.organization_id = p_organization_id
    and oi.item_id = (x->>'item_id')::uuid;
end;
$$;


-- ============================================================
-- 5. finish_stock_opname_tx
--
-- Tutup opname dan ubah selisihnya jadi adjustment.
--
-- Penyesuaiannya DIKERJAKAN OLEH create_stock_adjustment, bukan ditulis
-- ulang di sini. Advisory lock-nya sama dan re-entrant dalam satu
-- transaksi, jadi memanggilnya dari dalam sini aman.
--
-- Yang dibandingkan adalah qty_fisik lawan STOK SAAT INI, bukan lawan
-- qty_sistem. Alasannya: create_stock_adjustment memperlakukan qty_aktual
-- sebagai nilai absolut yang baru, jadi item yang stoknya tidak berubah
-- sejak dipotret tidak perlu ikut disesuaikan sama sekali. Selisih
-- terhadap qty_sistem tetap tersimpan di dokumen opname sebagai temuan.
-- ============================================================
create or replace function public.finish_stock_opname_tx(
  p_organization_id uuid,
  p_opname_id       uuid,
  p_tanggal         date
) returns uuid
language plpgsql
as $$
declare
  v_op        record;
  v_items     jsonb;
  v_adj       uuid;
  v_catatan   text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select id, no_opname, status, catatan into v_op
  from stock_opnames
  where id = p_opname_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Dokumen opname tidak ditemukan';
  end if;
  if v_op.status <> 'Berjalan' then
    raise exception 'Opname ini sudah ditutup';
  end if;

  if not exists (
    select 1 from stock_opname_items
    where opname_id = p_opname_id and qty_fisik is not null
  ) then
    raise exception 'Belum ada satu pun hasil hitung fisik yang diisi';
  end if;

  -- Item yang sudah dihitung DAN hasilnya beda dari stok saat ini.
  -- harga diambil dari pembelian terakhir: dipakai create_stock_adjustment
  -- untuk menilai batch baru kalau stoknya justru bertambah.
  select jsonb_agg(
           jsonb_build_object(
             'item_id', t.item_id,
             'qty_aktual', t.qty_fisik,
             'harga', coalesce(t.harga, 0)
           )
         )
    into v_items
  from (
    select
      oi.item_id,
      oi.qty_fisik,
      coalesce((
        select sum(pb.qty_sisa) from purchase_batches pb
        where pb.item_id = oi.item_id and pb.organization_id = p_organization_id
      ), 0) as stok_kini,
      (
        select pb.harga_per_unit from purchase_batches pb
        where pb.item_id = oi.item_id
          and pb.organization_id = p_organization_id
          and pb.harga_per_unit > 0
        order by pb.created_at desc
        limit 1
      ) as harga
    from stock_opname_items oi
    where oi.opname_id = p_opname_id
      and oi.organization_id = p_organization_id
      and oi.qty_fisik is not null
  ) t
  where abs(t.qty_fisik - t.stok_kini) > 0.000001;

  if v_items is not null and jsonb_array_length(v_items) > 0 then
    v_catatan := 'Stock opname ' || v_op.no_opname
                 || coalesce(' - ' || v_op.catatan, '');

    -- perform, bukan select-into: fungsi lama ini tidak dijamin
    -- mengembalikan nilai, dan kita cuma butuh efeknya.
    perform create_stock_adjustment(
      p_organization_id,
      p_tanggal,
      v_catatan,
      v_items
    );

    -- Adjustment yang barusan dibuat, dicari lewat catatannya yang memuat
    -- nomor opname.
    --
    -- BUKAN "baris terbaru milik organisasi ini". created_at diisi now(),
    -- yang mengembalikan waktu MULAI transaksi, bukan waktu insert. Dua
    -- transaksi bisa memulai hampir bersamaan lalu bergantian memegang
    -- advisory lock dengan urutan terbalik dari urutan now()-nya, dan
    -- "baris terbaru" akan menunjuk adjustment milik transaksi lain.
    -- Nomor opname unik per organisasi, jadi pencocokan ini pasti.
    --
    -- Kalau tidak ketemu, v_adj tetap null: opname tetap ditutup tanpa
    -- tautan. Lebih baik tidak menaut daripada menaut ke dokumen yang salah.
    select id into v_adj
    from stock_adjustments
    where organization_id = p_organization_id
      and catatan = v_catatan
    order by created_at desc, id desc
    limit 1;
  end if;

  update stock_opnames
     set status = 'Selesai',
         tanggal_selesai = p_tanggal,
         adjustment_id = v_adj
   where id = p_opname_id;

  return v_adj;
end;
$$;


-- ============================================================
-- 6. cancel_stock_opname_tx
--
-- Hanya untuk opname yang BELUM ditutup. Yang sudah menghasilkan
-- adjustment tidak dihapus dari sini — adjustment-nya sudah menggerakkan
-- stok, dan membatalkannya urusan dokumen adjustment itu sendiri.
-- ============================================================
create or replace function public.cancel_stock_opname_tx(
  p_organization_id uuid,
  p_opname_id       uuid
) returns void
language plpgsql
as $$
declare
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select status into v_status
  from stock_opnames
  where id = p_opname_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Dokumen opname tidak ditemukan';
  end if;
  if v_status = 'Selesai' then
    raise exception 'Opname yang sudah menghasilkan adjustment tidak bisa dibatalkan. Batalkan adjustment-nya kalau perlu.';
  end if;

  delete from stock_opname_items
   where opname_id = p_opname_id and organization_id = p_organization_id;

  delete from stock_opnames
   where id = p_opname_id and organization_id = p_organization_id;
end;
$$;


-- ============================================================
-- 7. Audit trail
-- ============================================================
drop trigger if exists trg_log_stock_opnames on public.stock_opnames;
create trigger trg_log_stock_opnames
  after insert or update or delete on public.stock_opnames
  for each row execute function public.log_activity('stock-opname', 'no_opname', '');
