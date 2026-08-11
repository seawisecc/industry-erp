-- ============================================================
-- Stock opname yang mencakup PRODUK JADI.
--
-- MASALAHNYA BUKAN "tambah satu pilihan kategori"
--
-- Stok bahan ada di purchase_batches, jadi koreksinya bisa lewat
-- create_stock_adjustment yang sudah ada. Stok produk jadi TIDAK
-- disimpan di mana pun: angkanya dihitung dari production_outputs
-- dikurangi konsinyasi dan penjualan. Tidak ada baris yang bisa
-- dinaikkan atau diturunkan.
--
-- Karena itu opname produk jadi butuh komponen keempat dalam rumus
-- itu: finished_goods_adjustments. Satu baris = satu koreksi
-- (boleh negatif), dan rumus stoknya jadi:
--
--   available = produksi - konsinyasi - terjual + koreksi
--
-- SATU RUMUS, SATU TEMPAT
--
-- Rumus itu dulu ditulis tiga kali: get_finished_stock (layar),
-- fg_available (penjaga anti-oversell), dan fallback TypeScript di
-- lib/salesStock.ts. Tiga salinan berarti tiga kesempatan untuk lupa
-- menambahkan komponen baru, dan yang terlupa menghasilkan bug
-- terburuk di fitur ini: angka di layar berbeda dengan angka yang
-- dipakai sistem saat menolak penjualan.
--
-- Skrip ini menjadikan fg_stock_calc() satu-satunya kebenaran di sisi
-- database. get_finished_stock dan fg_available cuma membungkusnya.
-- Salinan TypeScript tetap ada (dipakai kalau RPC belum terpasang) dan
-- ikut diperbarui di lib/salesStock.ts.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================


-- ============================================================
-- 1. Tabel koreksi stok produk jadi
-- ============================================================

create table if not exists public.finished_goods_adjustments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  -- null = produk tanpa varian. Perbandingan selalu lewat varian_key(),
  -- jadi null / '' / '-' diperlakukan sama seperti di tabel lain.
  varian          text,
  -- Boleh negatif. Inilah selisihnya, bukan hasil akhirnya: menyimpan
  -- nilai absolut akan salah begitu ada mutasi lain di antara dua opname.
  qty_delta       numeric not null,
  tanggal         date not null,
  alasan          text,
  -- Asal koreksi. null berarti koreksi manual di luar opname.
  opname_id       uuid references public.stock_opnames(id) on delete set null,
  dibuat_oleh     uuid,
  created_at      timestamptz not null default now()
);

create index if not exists fga_org_product_idx
  on public.finished_goods_adjustments (organization_id, product_id);

create index if not exists fga_org_tanggal_idx
  on public.finished_goods_adjustments (organization_id, tanggal desc);

create index if not exists fga_opname_idx
  on public.finished_goods_adjustments (opname_id);

alter table public.finished_goods_adjustments enable row level security;

drop policy if exists finished_goods_adjustments_org on public.finished_goods_adjustments;
create policy finished_goods_adjustments_org on public.finished_goods_adjustments
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
-- 2. fg_stock_calc, satu-satunya rumus stok produk jadi
--
-- p_product_id / p_varian null = seluruh produk. Dipakai keduanya:
-- agregat layar memanggil tanpa filter, penjaga per-baris memanggil
-- dengan filter, dan rumusnya cuma ada di sini.
-- ============================================================
create or replace function public.fg_stock_calc(
  p_org        uuid,
  p_product_id uuid default null,
  p_varian     text default null
) returns table (
  product_id uuid,
  varian     text,
  produced   numeric,
  consigned  numeric,
  sold       numeric,
  adjustment numeric,
  available  numeric
)
language sql
stable
as $$
  with sumber as (
    -- Produksi. Batch yang ditahan/ditolak QA tidak pernah masuk stok jual;
    -- qa_status null = batch lama atau QA nonaktif, tetap dihitung.
    select
      po.product_id,
      varian_key(po.varian_ukuran)         as varian,
      po.qty_hasil::numeric                as produced,
      0::numeric                           as consigned,
      0::numeric                           as sold,
      0::numeric                           as adjustment
    from production_outputs po
    join production_batches pb on pb.id = po.production_batch_id
    where po.organization_id = p_org
      and (pb.qa_status is null or pb.qa_status::text = 'Released')

    union all

    -- Konsinyasi: yang keluar adalah kirim dikurangi retur. Penjualan DARI
    -- konsinyasi tidak mengurangi lagi, barangnya sudah keluar saat dikirim.
    select
      ci.product_id,
      varian_key(ci.varian_ukuran),
      0, ci.qty_kirim::numeric - ci.qty_retur::numeric, 0, 0
    from consignment_items ci
    where ci.organization_id = p_org

    union all

    -- Penjualan langsung. Baris jasa (product_id null) tidak punya stok.
    select
      sii.product_id,
      varian_key(sii.varian_ukuran),
      0, 0, sii.qty::numeric, 0
    from sales_invoice_items sii
    join sales_invoices si on si.id = sii.invoice_id
    where sii.organization_id = p_org
      and sii.product_id is not null
      and si.sumber in ('Direct', 'POS')

    union all

    -- Koreksi opname / penyesuaian manual.
    select
      fa.product_id,
      varian_key(fa.varian),
      0, 0, 0, fa.qty_delta::numeric
    from finished_goods_adjustments fa
    where fa.organization_id = p_org
  )
  select
    s.product_id,
    s.varian,
    sum(s.produced)                                                   as produced,
    sum(s.consigned)                                                  as consigned,
    sum(s.sold)                                                       as sold,
    sum(s.adjustment)                                                 as adjustment,
    sum(s.produced) - sum(s.consigned) - sum(s.sold) + sum(s.adjustment) as available
  from sumber s
  where (p_product_id is null or s.product_id = p_product_id)
    and (p_varian is null or s.varian = varian_key(p_varian))
  group by s.product_id, s.varian;
$$;


-- ============================================================
-- 3. get_finished_stock, pembungkus untuk layar & form penjualan
--
-- Kolom `adjustment` baru, jadi fungsinya harus di-DROP dulu:
-- create or replace tidak bisa mengubah bentuk hasil. Karena di-drop,
-- atribut security definer / search_path-nya ikut hilang kalau tidak
-- disalin balik, makanya dibaca dulu sebelum dihapus.
-- ============================================================
do $$
declare
  v_secdef boolean := false;
  v_config text[];
  v_set    text := '';
  v_k      text;
begin
  -- oidvectortypes, BUKAN pg_get_function_identity_arguments: yang kedua
  -- ikut menyertakan nama parameter ('p_org uuid'), jadi tidak pernah cocok
  -- dengan daftar tipe telanjang.
  select p.prosecdef, p.proconfig
    into v_secdef, v_config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_finished_stock'
    and oidvectortypes(p.proargtypes) = 'uuid';

  if v_config is not null then
    foreach v_k in array v_config loop
      v_set := v_set || ' set ' || replace(v_k, '=', ' to ');
    end loop;
  end if;

  drop function if exists public.get_finished_stock(uuid);

  execute format(
    'create function public.get_finished_stock(p_org uuid)
       returns table (
         product_id uuid,
         varian     text,
         produced   numeric,
         consigned  numeric,
         sold       numeric,
         adjustment numeric,
         available  numeric
       )
       language sql
       stable
       %s
       %s
     as $f$
       select * from public.fg_stock_calc(p_org, null, null);
     $f$',
    case when coalesce(v_secdef, false) then 'security definer' else '' end,
    v_set
  );
end;
$$;


-- ============================================================
-- 4. fg_available, penjaga anti-oversell
--
-- Fungsi ini dipanggil dari create_sales_invoice_tx dan
-- create_consignment_tx, yang definisinya TIDAK di-track di repo ini.
-- Kalau tanda tangannya diganti, panggilan di sana gagal dan seluruh
-- alur penjualan mati. Jadi daftar parameternya diambil apa adanya dari
-- fungsi yang sudah ada; yang diganti hanya isinya.
--
-- Kalau bentuknya di luar dugaan, skripnya BERHENTI dengan pesan jelas
-- alih-alih diam-diam membuat overload kedua yang tidak pernah dipakai.
-- ============================================================
do $$
declare
  v_args   text;
  v_names  text[];
  v_ident  text;
  v_n      int;
  v_secdef boolean := false;
  v_config text[];
  v_set    text := '';
  v_k      text;
begin
  select count(*) into v_n
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fg_available';

  if v_n > 1 then
    raise exception 'Ada % versi fg_available di schema public. Hapus yang tidak dipakai dulu.', v_n;
  end if;

  -- v_args dipakai apa adanya sebagai daftar parameter fungsi baru
  -- (lengkap dengan nama dan default). v_ident cuma daftar TIPE-nya,
  -- untuk memastikan bentuknya memang (uuid, uuid, text).
  --
  -- oidvectortypes, BUKAN pg_get_function_identity_arguments: yang kedua
  -- ikut menyertakan nama parameter, jadi hasilnya tidak pernah sama
  -- dengan daftar tipe telanjang dan pemeriksaannya selalu gagal.
  select pg_get_function_arguments(p.oid),
         p.proargnames,
         oidvectortypes(p.proargtypes),
         p.prosecdef,
         p.proconfig
    into v_args, v_names, v_ident, v_secdef, v_config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fg_available';

  -- Belum ada: pakai bentuk baku.
  if v_args is null then
    v_args  := 'p_org uuid, p_product_id uuid, p_varian text';
    v_names := array['p_org', 'p_product_id', 'p_varian'];
    v_ident := 'uuid, uuid, text';
  end if;

  -- create or replace mengembalikan atribut yang TIDAK disebut ke nilai
  -- bawaan. Kalau fungsi lamanya security definer dan itu tidak ditulis
  -- ulang, penjaga anti-oversell mendadak jalan sebagai pemanggil biasa.
  if v_config is not null then
    foreach v_k in array v_config loop
      v_set := v_set || ' set ' || replace(v_k, '=', ' to ');
    end loop;
  end if;

  -- Spasi dibuang dulu: penulisan oidvectortypes bisa berbeda antar versi.
  if replace(v_ident, ' ', '') <> 'uuid,uuid,text' then
    raise exception
      'fg_available bertipe parameter (%), bukan (uuid, uuid, text). Skrip dihentikan supaya tidak membuat overload kedua.',
      v_ident;
  end if;

  if v_names is null or array_length(v_names, 1) <> 3
     or v_names[1] !~* 'org'
     or v_names[2] !~* 'prod'
     or v_names[3] !~* 'varian'
  then
    raise exception
      'Urutan parameter fg_available tidak terbaca sebagai (organisasi, produk, varian): %. Skrip dihentikan.',
      coalesce(array_to_string(v_names, ', '), '(tanpa nama)');
  end if;

  execute format(
    'create or replace function public.fg_available(%s)
       returns numeric
       language sql
       stable
       %s
       %s
     as $f$
       select coalesce(
         (select s.available from public.fg_stock_calc(%I, %I, %I) s),
         0
       );
     $f$',
    v_args,
    case when coalesce(v_secdef, false) then 'security definer' else '' end,
    v_set,
    v_names[1], v_names[2], v_names[3]
  );
end;
$$;


-- ============================================================
-- 5. stock_opname_items menampung dua jenis baris
--
-- Baris bahan  : item_id terisi, product_id/varian kosong.
-- Baris produk : product_id (+ varian) terisi, item_id kosong.
--
-- Baris lama semuanya baris bahan dan tidak tersentuh: item_id-nya
-- sudah terisi, product_id-nya null. Constraint di bawah lolos untuk
-- data lama tanpa perlu backfill.
-- ============================================================

alter table public.stock_opname_items
  alter column item_id drop not null;

alter table public.stock_opname_items
  add column if not exists product_id uuid references public.products(id) on delete cascade;

alter table public.stock_opname_items
  add column if not exists varian text;

alter table public.stock_opname_items
  drop constraint if exists stock_opname_items_target_chk;

alter table public.stock_opname_items
  add constraint stock_opname_items_target_chk
  check (
    (item_id is not null and product_id is null)
    or (item_id is null and product_id is not null)
  );

-- Index lama (opname_id, item_id) tetap berlaku untuk baris bahan: baris
-- produk jadi punya item_id null dan null dianggap berbeda satu sama lain,
-- jadi tidak saling menghalangi. Baris produk jadi butuh index sendiri,
-- dan kuncinya varian_key() supaya null / '' / '-' tidak jadi tiga baris.
create unique index if not exists stock_opname_items_fg_uniq
  on public.stock_opname_items (opname_id, product_id, varian_key(varian))
  where product_id is not null;

create index if not exists stock_opname_items_org_product_idx
  on public.stock_opname_items (organization_id, product_id);


-- ============================================================
-- 6. create_stock_opname_tx, cakupan bertambah 'Produk Jadi'
-- ============================================================
create or replace function public.create_stock_opname_tx(
  p_organization_id uuid,
  p_tanggal         date,
  p_kategori        text,    -- null = seluruh golongan
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
  v_bahan  int := 0;
  v_fg     int := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_tanggal is null then
    raise exception 'Tanggal opname wajib diisi';
  end if;

  if p_kategori is not null
     and p_kategori not in ('Bahan Baku', 'Kemasan', 'Produk Jadi') then
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

  -- ---- Baris bahan (Bahan Baku / Kemasan) ----
  if p_kategori is null or p_kategori in ('Bahan Baku', 'Kemasan') then
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

    get diagnostics v_bahan = row_count;
  end if;

  -- ---- Baris produk jadi ----
  --
  -- Cakupannya master produk+varian yang aktif, DITAMBAH kombinasi yang
  -- pernah bergerak walau varian-nya sudah dihapus dari master: barangnya
  -- masih ada di gudang dan harus tetap dihitung.
  if p_kategori is null or p_kategori = 'Produk Jadi' then
    insert into stock_opname_items
      (organization_id, opname_id, product_id, varian, qty_sistem)
    with stok as (
      select * from fg_stock_calc(p_organization_id, null, null)
    ),
    master as (
      select pv.product_id, varian_key(pv.nama_varian) as varian
      from product_variants pv
      join products p on p.id = pv.product_id
      where pv.organization_id = p_organization_id
        and p.aktif = true

      union

      select p.id, '-'
      from products p
      where p.organization_id = p_organization_id
        and p.aktif = true
        and not exists (
          select 1 from product_variants pv2 where pv2.product_id = p.id
        )

      union

      select s.product_id, s.varian
      from stok s
      join products p on p.id = s.product_id
      where p.organization_id = p_organization_id
        and p.aktif = true
    )
    select
      p_organization_id,
      v_opname,
      m.product_id,
      m.varian,
      coalesce(s.available, 0)
    from master m
    left join stok s
      on s.product_id = m.product_id
     and s.varian = m.varian;

    get diagnostics v_fg = row_count;
  end if;

  if v_bahan + v_fg = 0 then
    raise exception 'Tidak ada item aktif dalam cakupan opname ini';
  end if;

  return v_opname;
end;
$$;


-- ============================================================
-- 7. save_opname_count_tx, dicocokkan lewat id baris opname
--
-- Dulu dicocokkan lewat item_id. Baris produk jadi tidak punya item_id,
-- jadi kuncinya pindah ke id baris opname itu sendiri. Bentuk lama
-- (item_id) tetap diterima supaya tab yang belum di-refresh saat deploy
-- tidak kehilangan isian yang sudah diketik.
-- ============================================================
create or replace function public.save_opname_count_tx(
  p_organization_id uuid,
  p_opname_id       uuid,
  p_items           jsonb   -- [{id, qty_fisik, catatan}] ; qty_fisik null = belum dihitung
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
    and (
      case
        when nullif(x->>'id', '') is not null
          then oi.id = (x->>'id')::uuid
        when nullif(x->>'item_id', '') is not null
          then oi.item_id = (x->>'item_id')::uuid
        else false
      end
    );
end;
$$;


-- ============================================================
-- 8. finish_stock_opname_tx, dua jenis penyesuaian sekaligus
--
-- Baris bahan       -> create_stock_adjustment (batch & FEFO)
-- Baris produk jadi -> finished_goods_adjustments (selisih, boleh negatif)
--
-- Keduanya dibandingkan dengan STOK SAAT INI, bukan dengan qty_sistem.
-- Alasannya sama seperti sebelumnya: hasil hitung fisik adalah keadaan
-- sebenarnya, jadi item yang stoknya tidak bergerak sejak dipotret tidak
-- perlu disesuaikan sama sekali. Selisih terhadap potret tetap tersimpan
-- di dokumen opname sebagai temuan.
-- ============================================================
create or replace function public.finish_stock_opname_tx(
  p_organization_id uuid,
  p_opname_id       uuid,
  p_tanggal         date
) returns uuid
language plpgsql
as $$
declare
  v_op      record;
  v_items   jsonb;
  v_adj     uuid;
  v_catatan text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select id, no_opname, status, catatan, dibuat_oleh into v_op
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

  v_catatan := 'Stock opname ' || v_op.no_opname
               || coalesce(' - ' || v_op.catatan, '');

  -- ---- 8a. Bahan: lewat create_stock_adjustment ----
  --
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
      and oi.item_id is not null
      and oi.qty_fisik is not null
  ) t
  where abs(t.qty_fisik - t.stok_kini) > 0.000001;

  if v_items is not null and jsonb_array_length(v_items) > 0 then
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

  -- ---- 8b. Produk jadi: selisih ditulis sebagai koreksi ----
  --
  -- qty_delta = hitungan fisik - stok saat ini, jadi sesudah baris ini
  -- masuk, fg_stock_calc mengembalikan persis angka hasil hitung fisik.
  with stok as (
    select * from fg_stock_calc(p_organization_id, null, null)
  ),
  selisih as (
    select
      oi.product_id,
      varian_key(oi.varian)                        as varian,
      oi.qty_fisik - coalesce(s.available, 0)      as delta
    from stock_opname_items oi
    left join stok s
      on s.product_id = oi.product_id
     and s.varian = varian_key(oi.varian)
    where oi.opname_id = p_opname_id
      and oi.organization_id = p_organization_id
      and oi.product_id is not null
      and oi.qty_fisik is not null
  )
  insert into finished_goods_adjustments (
    organization_id, product_id, varian, qty_delta,
    tanggal, alasan, opname_id, dibuat_oleh
  )
  select
    p_organization_id,
    sl.product_id,
    nullif(sl.varian, '-'),
    sl.delta,
    p_tanggal,
    v_catatan,
    p_opname_id,
    v_op.dibuat_oleh
  from selisih sl
  where abs(sl.delta) > 0.000001;

  update stock_opnames
     set status = 'Selesai',
         tanggal_selesai = p_tanggal,
         adjustment_id = v_adj
   where id = p_opname_id;

  return v_adj;
end;
$$;


-- ============================================================
-- 9. cancel_stock_opname_tx
--
-- Tidak berubah isinya, ditulis ulang supaya skrip ini utuh sendiri.
-- Opname yang sudah ditutup tidak bisa dibatalkan, jadi tidak ada
-- finished_goods_adjustments yang perlu ditarik balik di sini.
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
-- 10. Audit trail
--
-- Koreksi stok produk jadi adalah perubahan angka stok tanpa dokumen
-- sumber apa pun, jadi justru yang paling perlu punya jejak.
-- ============================================================
drop trigger if exists trg_log_fg_adjustments on public.finished_goods_adjustments;
create trigger trg_log_fg_adjustments
  after insert or update or delete on public.finished_goods_adjustments
  for each row execute function public.log_activity('finished-goods', 'alasan', '');
