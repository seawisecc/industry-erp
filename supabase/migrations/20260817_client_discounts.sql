-- ============================================================
-- Diskon khusus per client per produk.
--
-- MASALAH YANG DISELESAIKAN
--
-- Kesepakatan dengan outlet konsinyasi hampir tidak pernah berbunyi
-- "produk ini harganya sekian untukmu". Bunyinya "kamu ambil sekian
-- persen". Sampai sekarang potongan itu diketik ulang manual di kolom
-- Discount tiap kali laku dicatat, dan angka yang diketik dari ingatan
-- adalah sumber selisih tagihan yang paling sering.
--
-- KENAPA MENUMPANG DI client_prices, BUKAN TABEL BARU
--
-- Kuncinya persis sama: (organization, client, produk, VARIAN). Tabel
-- kedua dengan kunci identik berarti dua daftar yang harus dijaga
-- sinkron, dua layar, dan dua kesempatan untuk lupa. Yang berubah cuma
-- satu: baris boleh berisi harga saja, diskon saja, atau dua-duanya.
-- Karena itu harga berhenti wajib.
--
-- ATURAN NILAI YANG BERLAKU (sama dengan sisi aplikasi)
--
--   harga dasar = harga khusus client kalau ada, kalau tidak harga
--                 jual di master produk
--   harga akhir = harga dasar - (harga dasar * diskon_persen / 100)
--
-- Diskon menumpuk DI ATAS harga khusus, bukan menggantikannya.
--
-- DI MANA DIPAKAI
--
-- Konsinyasi saja, sesuai keputusan pemakainya. Pengiriman konsinyasi
-- tetap memakai harga dasar penuh; potongannya baru muncul saat barang
-- laku dicatat dan Proforma terbit. Invoice penjualan langsung dan POS
-- TIDAK ikut berubah.
--
-- Proforma menyimpan satu diskon per dokumen, bukan per baris. Aplikasi
-- mengirim persentase tertimbang dari baris yang laku, sehingga rupiah
-- potongannya sama persis dengan menghitung per baris:
--
--   diskon_dokumen % = Σ(qty × harga × diskon_baris%) / Σ(qty × harga)
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================


-- ============================================================
-- 1. Kolom baru, dan harga yang berhenti wajib
-- ============================================================

alter table public.client_prices
  add column if not exists diskon_persen numeric;

-- Baris yang isinya cuma diskon tidak punya harga khusus. Tanpa ini
-- pemakainya dipaksa mengetik ulang harga master cuma supaya barisnya
-- bisa disimpan, dan salinan itu langsung basi begitu harga master
-- diperbarui.
alter table public.client_prices
  alter column harga drop not null;

alter table public.client_prices
  drop constraint if exists client_prices_diskon_wajar;
alter table public.client_prices
  add constraint client_prices_diskon_wajar
  check (diskon_persen is null or (diskon_persen >= 0 and diskon_persen <= 100));

-- Baris tanpa harga DAN tanpa diskon tidak berarti apa-apa; dia cuma
-- membuat produk itu terlihat "punya kesepakatan khusus" padahal isinya
-- kosong.
alter table public.client_prices
  drop constraint if exists client_prices_ada_isinya;
alter table public.client_prices
  add constraint client_prices_ada_isinya
  check (harga is not null or diskon_persen is not null);


-- ============================================================
-- 2. save_client_prices_tx, menerima diskon
--
-- Tanda tangannya tidak berubah (p_items tetap jsonb), jadi pemanggil
-- lama yang mengirim [{product_id, varian, harga}] tetap jalan: diskon
-- yang tidak disebut dibaca null.
-- ============================================================
create or replace function public.save_client_prices_tx(
  p_organization_id uuid,
  p_client_id       uuid,
  p_items           jsonb   -- [{product_id, varian, harga, diskon_persen}]
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
    insert into client_prices (
      organization_id, client_id, product_id, varian, harga, diskon_persen
    )
    select
      p_organization_id,
      p_client_id,
      (x->>'product_id')::uuid,
      nullif(trim(coalesce(x->>'varian', '')), ''),
      nullif(x->>'harga', '')::numeric,
      nullif(x->>'diskon_persen', '')::numeric
    from jsonb_array_elements(p_items) x;
  end if;
end;
$$;


-- ============================================================
-- 3. Audit trail ikut menyimpan diskon
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
               'produk', coalesce(p.nama_produk, '(produk terhapus)'),
               'kode', p.kode,
               'varian', coalesce(varian_key(b.varian), '-'),
               'harga', b.harga,
               'diskon_persen', b.diskon_persen
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
        then 'Harga & diskon khusus lama ' || coalesce(v_nama, 'client') || ' dihapus (' || v_n || ' produk)'
      else 'Harga & diskon khusus ' || coalesce(v_nama, 'client') || ' ditetapkan (' || v_n || ' produk)'
    end,
    case when TG_OP = 'DELETE' then null else jsonb_build_object('harga', v_snapshot) end
  );

  return null;
end;
$$;
