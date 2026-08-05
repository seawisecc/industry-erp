-- ============================================================
-- Harga jual khusus per client.
--
-- MASALAH YANG DISELESAIKAN
--
-- Harga di Invoice, POS, dan Konsinyasi selalu diambil dari master
-- produk. Padahal reseller, brand owner, dan pembeli eceran hampir
-- tidak pernah dapat harga yang sama. Yang terjadi sekarang: kasir
-- mengetik ulang harganya dari ingatan atau dari daftar di kertas —
-- dan itu sumber selisih tagihan yang paling sering.
--
-- KUNCINYA (client, produk, VARIAN)
--
-- Bukan (client, produk). Serum 30 g dan 100 g adalah dua harga yang
-- berbeda, dan kesepakatan harga selalu menyebut ukurannya. Varian
-- dinormalisasi lewat varian_key() supaya null, '' dan '-' dianggap
-- varian yang sama persis seperti di sisi aplikasi (lib/salesStock.ts
-- fgKey). Tanpa itu, satu produk tanpa varian bisa punya dua baris
-- harga yang berbeda dan tidak ada yang tahu mana yang dipakai.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================


-- ============================================================
-- 1. Tabel
-- ============================================================

create table if not exists public.client_prices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  product_id      uuid not null references public.products(id) on delete cascade,
  varian          text,
  harga           numeric not null,
  created_at      timestamptz not null default now()
);

-- Satu harga per kombinasi. varian_key() dipakai supaya null/''/'-'
-- tidak bisa jadi dua baris terpisah.
create unique index if not exists client_prices_uniq
  on public.client_prices (
    organization_id, client_id, product_id, public.varian_key(varian)
  );

create index if not exists client_prices_org_client_idx
  on public.client_prices (organization_id, client_id);


-- ============================================================
-- 2. Row Level Security
-- ============================================================

alter table public.client_prices enable row level security;

drop policy if exists client_prices_org on public.client_prices;
create policy client_prices_org on public.client_prices
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
-- 3. save_client_prices_tx
--
-- Ganti SELURUH daftar harga satu client sekaligus. Hapus lalu sisip
-- ulang harus utuh: gagal di tengah berarti client kehilangan seluruh
-- harga khususnya dan diam-diam kembali ke harga master. Karena itu
-- dikerjakan di satu fungsi, bukan dua panggilan dari TypeScript.
-- ============================================================
create or replace function public.save_client_prices_tx(
  p_organization_id uuid,
  p_client_id       uuid,
  p_items           jsonb   -- [{product_id, varian, harga}]
) returns void
language plpgsql
as $$
declare
  v_dobel int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if not exists (
    select 1 from clients
    where id = p_client_id and organization_id = p_organization_id
  ) then
    raise exception 'Client tidak ditemukan';
  end if;

  if p_items is not null and jsonb_array_length(p_items) > 0 then
    if exists (
      select 1 from jsonb_array_elements(p_items) x
      where (x->>'harga')::numeric is null or (x->>'harga')::numeric < 0
    ) then
      raise exception 'Harga khusus tidak boleh negatif';
    end if;

    -- Produk+varian yang sama diisi dua baris: unique index akan menolak,
    -- tapi pesannya tidak bisa dibaca orang. Dicek lebih dulu di sini.
    select count(*) into v_dobel
    from (
      select (x->>'product_id')::uuid as pid, varian_key(x->>'varian') as vk
      from jsonb_array_elements(p_items) x
      group by 1, 2
      having count(*) > 1
    ) d;

    if v_dobel > 0 then
      raise exception 'Ada produk & varian yang sama diisi lebih dari sekali';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_items) x
      where not exists (
        select 1 from products p
        where p.id = (x->>'product_id')::uuid
          and p.organization_id = p_organization_id
      )
    ) then
      raise exception 'Ada produk yang tidak terdaftar di organisasi ini';
    end if;
  end if;

  delete from client_prices
  where organization_id = p_organization_id
    and client_id = p_client_id;

  if p_items is not null and jsonb_array_length(p_items) > 0 then
    insert into client_prices (organization_id, client_id, product_id, varian, harga)
    select
      p_organization_id,
      p_client_id,
      (x->>'product_id')::uuid,
      nullif(trim(coalesce(x->>'varian', '')), ''),
      (x->>'harga')::numeric
    from jsonb_array_elements(p_items) x;
  end if;
end;
$$;


-- ============================================================
-- 4. Audit trail
--
-- Kesepakatan harga menyangkut uang dan sering jadi sumber sengketa,
-- jadi perubahannya dicatat. Polanya sama dengan product_formulas:
-- daftar diganti utuh (hapus lalu sisip), jadi trigger per-baris akan
-- menghasilkan 2N entri untuk satu kali simpan. FOR EACH STATEMENT
-- menghasilkan satu entri, dan pada penyisipan ikut menyimpan SNAPSHOT
-- daftar harga yang berlaku sesudahnya.
-- ============================================================
create or replace function public.log_client_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org      uuid;
  v_client   uuid;
  v_n        int;
  v_kode     text;
  v_nama     text;
  v_uid      uuid := auth.uid();
  v_user     text;
  v_email    text;
  v_snapshot jsonb;
begin
  -- LIMIT 1, bukan min(): Postgres tidak punya agregat min() untuk uuid.
  -- Satu pernyataan selalu menyentuh satu client saja.
  if TG_OP = 'DELETE' then
    select count(*) into v_n from lama;
    select organization_id, client_id into v_org, v_client from lama limit 1;
  else
    select count(*) into v_n from baru;
    select organization_id, client_id into v_org, v_client from baru limit 1;

    select jsonb_agg(
             jsonb_build_object(
               'produk', coalesce(p.nama_produk, '(produk terhapus)'),
               'kode', p.kode,
               'varian', coalesce(varian_key(b.varian), '-'),
               'harga', b.harga
             )
             order by p.nama_produk, b.varian
           )
      into v_snapshot
    from baru b
    left join products p on p.id = b.product_id;
  end if;

  if v_org is null or v_n = 0 then
    return null;
  end if;

  select c.kode, c.company_brand into v_kode, v_nama
  from clients c where c.id = v_client;

  if v_uid is not null then
    select p.nama, p.email into v_user, v_email
    from profiles p where p.id = v_uid;
  end if;

  insert into activity_logs (
    organization_id, user_id, user_nama, user_email,
    modul, tabel, aksi, dokumen_id, dokumen_no, ringkasan, perubahan
  ) values (
    v_org, v_uid,
    coalesce(v_user, case when v_uid is null then 'Sistem' else 'Pengguna dihapus' end),
    v_email,
    'clients', 'client_prices',
    case when TG_OP = 'DELETE' then 'Hapus' else 'Ubah' end,
    v_client, v_kode,
    case
      when TG_OP = 'DELETE'
        then 'Harga khusus lama ' || coalesce(v_nama, 'client') || ' dihapus (' || v_n || ' produk)'
      else 'Harga khusus ' || coalesce(v_nama, 'client') || ' ditetapkan (' || v_n || ' produk)'
    end,
    case when TG_OP = 'DELETE' then null else jsonb_build_object('harga', v_snapshot) end
  );

  return null;
end;
$$;

drop trigger if exists trg_log_client_prices_ins on public.client_prices;
create trigger trg_log_client_prices_ins
  after insert on public.client_prices
  referencing new table as baru
  for each statement execute function public.log_client_price_change();

drop trigger if exists trg_log_client_prices_del on public.client_prices;
create trigger trg_log_client_prices_del
  after delete on public.client_prices
  referencing old table as lama
  for each statement execute function public.log_client_price_change();
