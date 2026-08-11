-- ============================================================
-- Pemakaian penyimpanan per organisasi.
--
-- Supabase melaporkan ukuran DATABASE, bukan ukuran per tenant.
-- Untuk menagih kuota per client, angkanya harus dibagi sendiri.
--
-- Cara membaginya: untuk tiap tabel yang punya organization_id,
-- ukuran total relasi (heap + TOAST + INDEX, lewat
-- pg_total_relation_size) dibagi rata ke jumlah barisnya, lalu
-- dikalikan jumlah baris milik tiap organisasi.
--
-- Kenapa proporsional, bukan sum(pg_column_size(t.*)):
--   * pg_column_size TIDAK menghitung index, padahal index sering
--     lebih besar daripada datanya sendiri. Angka yang keluar akan
--     jauh lebih kecil dari yang benar-benar dibayar ke Supabase.
--   * pg_column_size juga tidak menghitung bloat & fillfactor.
--   * Pembagian rata dilakukan PER TABEL, jadi perbedaan besar
--     antar tabel (activity_logs yang gemuk vs items yang ramping)
--     tetap tertangkap dengan benar. Yang diratakan cuma variasi
--     antar baris DI DALAM satu tabel, dan di situ barisnya memang
--     sebanding.
--
-- Angkanya SNAPSHOT, bukan hitung-saat-dibuka. Menghitungnya perlu
-- satu agregat per tabel; menjalankan itu tiap kali halaman Companies
-- dibuka akan membuat halamannya lambat dan sia-sia — angka
-- penyimpanan tidak berubah dalam hitungan detik.
--
-- Kalau nanti databasenya sudah terlalu besar untuk dihitung dalam
-- satu request HTTP, pindahkan pemanggilannya ke pg_cron saja (blok
-- penjadwalan di bawah sudah menyiapkan itu) dan matikan tombol
-- "Hitung Ulang" di aplikasi.
-- ============================================================

-- Kuota per organisasi. Default 10 GB; super admin bisa menaikkan
-- per client tanpa mengubah kode.
alter table organizations
  add column if not exists storage_quota_gb numeric not null default 10;

create table if not exists organization_storage (
  organization_id uuid primary key references organizations(id) on delete cascade,
  bytes bigint not null default 0,
  baris bigint not null default 0,
  -- 10 tabel terbesar milik organisasi ini: [{tabel, baris, bytes}]
  per_tabel jsonb not null default '[]'::jsonb,
  dihitung_pada timestamptz not null default now()
);

alter table organization_storage enable row level security;

-- Baca saja. Penulisannya HANYA lewat refresh_org_storage()
-- yang security definer — sama seperti activity_logs, angka
-- tagihan tidak boleh bisa disunting dari client.
drop policy if exists organization_storage_select on organization_storage;
create policy organization_storage_select on organization_storage
  for select using (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  );

-- ============================================================
-- Hitung ulang seluruh organisasi sekaligus.
--
-- Sekaligus, bukan per organisasi, karena biaya terbesarnya adalah
-- memindai tabelnya — dan satu pemindaian sudah menghasilkan angka
-- untuk SEMUA organisasi. Menghitung per organisasi berarti memindai
-- tabel yang sama berulang kali.
--
-- statement_timeout dinaikkan di level fungsi: peran `authenticated`
-- di Supabase dibatasi beberapa detik saja, dan pemindaian tabel
-- besar pasti melewatinya.
-- ============================================================
create or replace function refresh_org_storage(p_paksa boolean default false)
returns timestamptz
language plpgsql
security definer
set search_path = public
set statement_timeout = '120s'
as $$
declare
  v_terakhir timestamptz;
  r record;
  v_total_baris bigint;
  v_size bigint;
  v_per_baris numeric;
begin
  if not is_authenticated_active() then
    raise exception 'Tidak punya akses';
  end if;

  -- Rem: hitungannya mahal dan angkanya tidak berubah cepat.
  select max(dihitung_pada) into v_terakhir from organization_storage;
  if not p_paksa
     and v_terakhir is not null
     and v_terakhir > now() - interval '10 minutes' then
    return v_terakhir;
  end if;

  drop table if exists _hitung_storage;
  create temp table _hitung_storage (
    organization_id uuid,
    tabel text,
    baris bigint,
    bytes numeric
  ) on commit drop;

  for r in
    select c.relname as tabel
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
     where n.nspname = 'public'
       and c.relkind = 'r'
       and a.attname = 'organization_id'
       and a.attnum > 0
       and not a.attisdropped
  loop
    v_size := pg_total_relation_size(format('public.%I', r.tabel)::regclass);
    execute format('select count(*) from public.%I', r.tabel) into v_total_baris;
    continue when v_total_baris is null or v_total_baris = 0;

    v_per_baris := v_size::numeric / v_total_baris;

    execute format(
      'insert into _hitung_storage (organization_id, tabel, baris, bytes)
         select organization_id, %L, count(*), count(*) * %s
           from public.%I
          where organization_id is not null
          group by organization_id',
      r.tabel, v_per_baris, r.tabel
    );
  end loop;

  -- Organisasi yang belum punya data apa pun tetap dapat baris 0,
  -- supaya layarnya menampilkan "0 B", bukan "belum dihitung".
  insert into organization_storage (organization_id, bytes, baris, per_tabel, dihitung_pada)
  select o.id,
         coalesce(sum(h.bytes), 0)::bigint,
         coalesce(sum(h.baris), 0),
         coalesce(
           (select jsonb_agg(t)
              from (select h2.tabel, h2.baris, h2.bytes::bigint as bytes
                      from _hitung_storage h2
                     where h2.organization_id = o.id
                     order by h2.bytes desc
                     limit 10) t),
           '[]'::jsonb
         ),
         now()
    from organizations o
    left join _hitung_storage h on h.organization_id = o.id
   group by o.id
      on conflict (organization_id) do update
     set bytes = excluded.bytes,
         baris = excluded.baris,
         per_tabel = excluded.per_tabel,
         dihitung_pada = excluded.dihitung_pada;

  return now();
end;
$$;

revoke all on function refresh_org_storage(boolean) from public;
grant execute on function refresh_org_storage(boolean) to authenticated;

-- Penyegaran malam hari, supaya angka di layar tidak pernah basi
-- walau tidak ada yang menekan tombol Hitung Ulang. Dilewati diam-diam
-- kalau pg_cron belum diaktifkan di project ini.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('refresh-org-storage')
      where exists (select 1 from cron.job where jobname = 'refresh-org-storage');
    perform cron.schedule(
      'refresh-org-storage',
      '0 18 * * *', -- 18:00 UTC = 02:00 WITA
      'select public.refresh_org_storage(true)'
    );
  end if;
end;
$$;
