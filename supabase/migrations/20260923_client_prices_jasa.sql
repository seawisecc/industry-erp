-- ============================================================
-- Harga & diskon khusus client, diperluas ke Jasa.
--
-- MASALAH YANG DISELESAIKAN
--
-- client_prices.product_id NOT NULL + FK ke products membuat baris
-- kesepakatan cuma bisa menunjuk produk. Jasa hidup di tabel terpisah
-- (services), jadi kesepakatan harga/diskon untuk jasa (mis. reseller
-- yang jasa maklonnya juga didiskon) tidak bisa disimpan sama sekali,
-- baik lewat layar Harga Client maupun lewat RPC ini. Sebelumnya Invoice
-- & POS memang sengaja mengunci jasa ke harga master, tapi itu keputusan
-- yang sekarang diubah: jasa boleh punya kesepakatan sendiri persis
-- seperti produk.
--
-- POLANYA SAMA DENGAN material_id/item_id DI FORMULA R&D
--
-- Satu baris menunjuk product_id ATAU service_id, dijaga
-- num_nonnulls(...) = 1. Unique index-nya PARSIAL, dua buah: satu index
-- gabungan atas (product_id, service_id) akan meloloskan baris dobel
-- begitu salah satu kolomnya NULL, karena di Postgres dua NULL tidak
-- pernah dianggap sama (lihat bab Jebakan Postgres di CLAUDE.md).
--
-- Jasa tidak punya varian (satu tarif per jasa), jadi index parsialnya
-- tidak perlu ikut menyertakan varian_key().
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================


-- ============================================================
-- 1. Kolom baru & product_id berhenti wajib
-- ============================================================

alter table public.client_prices
  add column if not exists service_id uuid references public.services(id) on delete cascade;

alter table public.client_prices
  alter column product_id drop not null;

alter table public.client_prices
  drop constraint if exists client_prices_satu_kunci;
alter table public.client_prices
  add constraint client_prices_satu_kunci
  check (num_nonnulls(product_id, service_id) = 1);


-- ============================================================
-- 2. Unique index: dipecah PARSIAL, bukan digabung
-- ============================================================

drop index if exists public.client_prices_uniq;

create unique index if not exists client_prices_uniq_produk
  on public.client_prices (
    organization_id, client_id, product_id, public.varian_key(varian)
  )
  where product_id is not null;

create unique index if not exists client_prices_uniq_jasa
  on public.client_prices (organization_id, client_id, service_id)
  where service_id is not null;


-- ============================================================
-- 3. save_client_prices_tx, menerima service_id
--
-- Tanda tangannya tidak berubah (p_items tetap jsonb), jadi pemanggil
-- lama yang mengirim [{product_id, varian, harga, diskon_persen}] tanpa
-- service_id tetap jalan: dibaca null, sama seperti diskon_persen dulu.
-- ============================================================
create or replace function public.save_client_prices_tx(
  p_organization_id uuid,
  p_client_id       uuid,
  p_items           jsonb   -- [{product_id, service_id, varian, harga, diskon_persen}]
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
      where nullif(x->>'harga', '')::numeric < 0
    ) then
      raise exception 'Harga khusus tidak boleh negatif';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_items) x
      where nullif(x->>'diskon_persen', '')::numeric < 0
         or nullif(x->>'diskon_persen', '')::numeric > 100
    ) then
      raise exception 'Diskon harus antara 0 dan 100 persen';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_items) x
      where nullif(x->>'harga', '') is null
        and nullif(x->>'diskon_persen', '') is null
    ) then
      raise exception 'Tiap baris harus punya harga khusus, diskon, atau dua-duanya';
    end if;

    -- Tiap baris menunjuk SATU hal saja, pola sama dengan baris formula
    -- R&D (material_id ATAU item_id).
    if exists (
      select 1 from jsonb_array_elements(p_items) x
      where num_nonnulls(
        nullif(x->>'product_id', '')::uuid,
        nullif(x->>'service_id', '')::uuid
      ) <> 1
    ) then
      raise exception 'Tiap baris harus menunjuk satu produk ATAU satu jasa';
    end if;

    -- Produk+varian atau jasa yang sama diisi dua baris: unique index
    -- akan menolak, tapi pesannya tidak bisa dibaca orang. Dicek lebih
    -- dulu di sini lewat kunci gabungan (jasa tidak punya varian, jadi
    -- kuncinya cukup id-nya sendiri).
    select count(*) into v_dobel
    from (
      select
        coalesce(
          'p:' || (x->>'product_id') || '|' || varian_key(x->>'varian'),
          's:' || (x->>'service_id')
        ) as kunci
      from jsonb_array_elements(p_items) x
      group by 1
      having count(*) > 1
    ) d;

    if v_dobel > 0 then
      raise exception 'Ada produk/varian atau jasa yang sama diisi lebih dari sekali';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_items) x
      where x->>'product_id' is not null
        and not exists (
          select 1 from products p
          where p.id = (x->>'product_id')::uuid
            and p.organization_id = p_organization_id
        )
    ) then
      raise exception 'Ada produk yang tidak terdaftar di organisasi ini';
    end if;

    if exists (
      select 1 from jsonb_array_elements(p_items) x
      where x->>'service_id' is not null
        and not exists (
          select 1 from services s
          where s.id = (x->>'service_id')::uuid
            and s.organization_id = p_organization_id
        )
    ) then
      raise exception 'Ada jasa yang tidak terdaftar di organisasi ini';
    end if;
  end if;

  delete from client_prices
  where organization_id = p_organization_id
    and client_id = p_client_id;

  if p_items is not null and jsonb_array_length(p_items) > 0 then
    insert into client_prices (
      organization_id, client_id, product_id, service_id, varian, harga, diskon_persen
    )
    select
      p_organization_id,
      p_client_id,
      nullif(x->>'product_id', '')::uuid,
      nullif(x->>'service_id', '')::uuid,
      case
        when x->>'service_id' is not null then null
        else nullif(trim(coalesce(x->>'varian', '')), '')
      end,
      nullif(x->>'harga', '')::numeric,
      nullif(x->>'diskon_persen', '')::numeric
    from jsonb_array_elements(p_items) x;
  end if;
end;
$$;


-- ============================================================
-- 4. Audit trail ikut menyimpan jasa
--
-- Fungsinya ditulis ulang UTUH, bukan ditambal: `create or replace
-- function` mengembalikan atribut yang tidak disebut ke nilai bawaan,
-- jadi `security definer` dan `set search_path` harus ikut ditulis
-- lagi kalau tidak fungsinya diam-diam berubah jadi invoker.
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
               'produk', coalesce(p.nama_produk, s.nama_jasa, '(produk terhapus)'),
               'kode', coalesce(p.kode, s.kode),
               'varian', case when b.service_id is not null then null
                              else coalesce(varian_key(b.varian), '-') end,
               'harga', b.harga,
               'diskon_persen', b.diskon_persen
             )
             order by coalesce(p.nama_produk, s.nama_jasa)
           )
      into v_snapshot
    from baru b
    left join products p on p.id = b.product_id
    left join services s on s.id = b.service_id;
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
        then 'Harga & diskon khusus lama ' || coalesce(v_nama, 'client') || ' dihapus (' || v_n || ' baris)'
      else 'Harga & diskon khusus ' || coalesce(v_nama, 'client') || ' ditetapkan (' || v_n || ' baris)'
    end,
    case when TG_OP = 'DELETE' then null else jsonb_build_object('harga', v_snapshot) end
  );

  return null;
end;
$$;
