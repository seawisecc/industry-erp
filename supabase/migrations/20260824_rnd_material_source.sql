-- ============================================================
-- Baris formula R&D menunjuk MATERIAL, bukan item stok.
--
-- MASALAH YANG DISELESAIKAN
--
-- Versi pertama modul R&D mengambil daftar bahannya dari `items`,
-- yaitu barang yang sudah punya tempat di gudang. Itu keliru untuk
-- pekerjaan yang justru dimulai sebelum barangnya ada: formulator
-- menjajaki bahan dari katalog supplier, memasukkannya ke formula,
-- baru memutuskan mau diadakan atau tidak.
--
-- Akibatnya bukan sekadar merepotkan. Bahan yang belum pernah dibeli
-- TIDAK ADA di `items`, jadi satu-satunya jalan memasukkannya ke
-- formula adalah membuat item stok palsu lebih dulu. Item palsu itu
-- lalu ikut muncul di lembar Stock Opname, di PPIC, dan di laporan
-- nilai stok, sebagai barang bersaldo nol yang tidak pernah ada.
--
-- Master bahan yang benar adalah `materials`: di situ ada kode,
-- tradename, supplier, dan komposisi INCI-nya, dan barisnya boleh
-- ada tanpa `item_id`, yang artinya persis "belum diadakan".
--
-- SATU BARIS MENUNJUK SATU HAL SAJA
--
-- `material_id` ATAU `item_id`, tidak pernah dua-duanya (dijaga
-- constraint). Bahan yang berasal dari master material disimpan
-- sebagai `material_id`, dan kaitannya ke stok DIBACA saat diperlukan
-- lewat `materials.item_id`.
--
-- Itu disengaja: kalau `item_id` ikut disalin waktu formula disimpan,
-- material yang BARU diadakan bulan depan tidak akan pernah nyambung
-- ke formulanya, dan layar biaya akan terus bilang "belum pernah
-- dibeli" untuk barang yang sudah ada di gudang. Satu sumber
-- kebenaran, dibaca saat dipakai. Pelajarannya sama dengan
-- `fg_stock_calc`.
--
-- `item_id` tetap ada karena tidak semua item stok punya baris di
-- `materials` (item yang dibuat langsung lewat menu Stock Items).
-- Tanpa itu, bahan yang hari ini bisa dipilih akan hilang dari daftar.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang. Wajib sesudah 20260823_rnd_formulas.sql.
-- ============================================================


-- ============================================================
-- 1. Kolom baru
-- ============================================================

alter table public.rnd_formula_items
  add column if not exists material_id uuid
  references public.materials(id) on delete restrict;

alter table public.rnd_formula_items
  alter column item_id drop not null;

alter table public.rnd_formula_packaging
  add column if not exists material_id uuid
  references public.materials(id) on delete restrict;

create index if not exists rnd_formula_items_material_idx
  on public.rnd_formula_items (material_id);

create index if not exists rnd_formula_packaging_material_idx
  on public.rnd_formula_packaging (material_id);


-- ============================================================
-- 2. Backfill baris yang sudah terlanjur menunjuk item
--
-- Cuma yang pasangannya TIDAK AMBIGU, yaitu tepat satu material yang
-- menunjuk item itu. Kalau ada dua, barisnya dibiarkan menunjuk item
-- seperti semula: menebak salah satu berarti formula diam-diam
-- berganti bahan, dan itu tidak menimbulkan error apa pun saat
-- terjadi. Pola yang sama dipakai backfill consignment_sale_lines.
-- ============================================================

update public.rnd_formula_items ri
set material_id = m.id,
    item_id     = null
from public.materials m
where ri.material_id is null
  and ri.item_id is not null
  and m.item_id = ri.item_id
  and m.organization_id = ri.organization_id
  and (
    select count(*) from public.materials m2
    where m2.item_id = ri.item_id
      and m2.organization_id = ri.organization_id
  ) = 1;

update public.rnd_formula_packaging rp
set material_id = m.id,
    item_id     = null
from public.materials m
where rp.material_id is null
  and rp.item_id is not null
  and m.item_id = rp.item_id
  and m.organization_id = rp.organization_id
  and (
    select count(*) from public.materials m2
    where m2.item_id = rp.item_id
      and m2.organization_id = rp.organization_id
  ) = 1;


-- ============================================================
-- 3. Kunci keunikan & constraint
--
-- Unique index-nya PARSIAL, dua buah, bukan satu index atas pasangan
-- kolomnya. Di Postgres dua NULL tidak dianggap sama, jadi index
-- gabungan (formula_id, material_id, item_id) akan meloloskan bahan
-- yang sama dimasukkan berkali-kali begitu salah satu kolomnya null.
-- ============================================================

drop index if exists rnd_formula_items_uniq;

create unique index if not exists rnd_formula_items_material_uniq
  on public.rnd_formula_items (formula_id, material_id)
  where material_id is not null;

create unique index if not exists rnd_formula_items_item_uniq
  on public.rnd_formula_items (formula_id, item_id)
  where item_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rnd_formula_items_sumber_chk'
      and conrelid = 'public.rnd_formula_items'::regclass
  ) then
    alter table public.rnd_formula_items
      add constraint rnd_formula_items_sumber_chk
      check (num_nonnulls(material_id, item_id) = 1);
  end if;
end;
$$;

-- Baris kemasan boleh TIDAK menunjuk apa-apa (cuma nama yang diketik
-- tangan), jadi syaratnya paling banyak satu, bukan tepat satu.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rnd_formula_packaging_sumber_chk'
      and conrelid = 'public.rnd_formula_packaging'::regclass
  ) then
    alter table public.rnd_formula_packaging
      add constraint rnd_formula_packaging_sumber_chk
      check (num_nonnulls(material_id, item_id) <= 1);
  end if;
end;
$$;


-- ============================================================
-- 4. rnd_tulis_baris, menerima kedua bentuk sumber
-- ============================================================
create or replace function public.rnd_tulis_baris(
  p_organization_id uuid,
  p_formula_id      uuid,
  p_items           jsonb,
  p_specs           jsonb,
  p_packaging       jsonb
) returns void
language plpgsql
as $$
begin
  delete from rnd_formula_items     where formula_id = p_formula_id;
  delete from rnd_formula_specs     where formula_id = p_formula_id;
  delete from rnd_formula_packaging where formula_id = p_formula_id;

  insert into rnd_formula_items (
    organization_id, formula_id, material_id, item_id, fase, percentage,
    fungsi, catatan
  )
  select
    p_organization_id,
    p_formula_id,
    nullif(r->>'material_id', '')::uuid,
    case
      when nullif(r->>'material_id', '') is not null then null
      else nullif(r->>'item_id', '')::uuid
    end,
    nullif(trim(coalesce(r->>'fase', '')), ''),
    coalesce((r->>'percentage')::numeric, 0),
    nullif(trim(coalesce(r->>'fungsi', '')), ''),
    nullif(trim(coalesce(r->>'catatan', '')), '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) r
  where coalesce(nullif(r->>'material_id', ''), nullif(r->>'item_id', ''))
        is not null;

  insert into rnd_formula_specs (
    organization_id, formula_id, urutan, grup, parameter, satuan, target, hasil
  )
  select
    p_organization_id,
    p_formula_id,
    coalesce((r->>'urutan')::int, 0),
    nullif(trim(coalesce(r->>'grup', '')), ''),
    trim(r->>'parameter'),
    nullif(trim(coalesce(r->>'satuan', '')), ''),
    nullif(trim(coalesce(r->>'target', '')), ''),
    nullif(trim(coalesce(r->>'hasil', '')), '')
  from jsonb_array_elements(coalesce(p_specs, '[]'::jsonb)) r
  where nullif(trim(coalesce(r->>'parameter', '')), '') is not null;

  insert into rnd_formula_packaging (
    organization_id, formula_id, material_id, item_id, nama, qty_per_pcs,
    harga_estimasi
  )
  select
    p_organization_id,
    p_formula_id,
    nullif(r->>'material_id', '')::uuid,
    case
      when nullif(r->>'material_id', '') is not null then null
      else nullif(r->>'item_id', '')::uuid
    end,
    nullif(trim(coalesce(r->>'nama', '')), ''),
    coalesce((r->>'qty_per_pcs')::numeric, 1),
    nullif(r->>'harga_estimasi', '')::numeric
  from jsonb_array_elements(coalesce(p_packaging, '[]'::jsonb)) r
  where nullif(r->>'material_id', '') is not null
     or nullif(r->>'item_id', '') is not null
     or nullif(trim(coalesce(r->>'nama', '')), '') is not null;
end;
$$;


-- ============================================================
-- 5. save_rnd_formula_tx
--
-- Yang berubah cuma KUNCI barisnya: jumlah bahan dan pemeriksaan
-- bahan dobel sekarang memakai material_id kalau ada, item_id kalau
-- tidak. Tanpa itu, satu formula bisa memuat bahan yang sama dua kali
-- selama yang satu dipilih dari master material dan yang satunya dari
-- item stok, dan totalnya jadi dobel tanpa ada yang menolak.
-- ============================================================
create or replace function public.save_rnd_formula_tx(
  p_organization_id uuid,
  p_formula_id      uuid,     -- null = dokumen baru
  p_header          jsonb,
  p_items           jsonb,
  p_specs           jsonb,
  p_packaging       jsonb,
  p_dibuat_oleh     uuid
) returns uuid
language plpgsql
as $$
declare
  v_prefix  text;
  v_seq     int;
  v_no      text;
  v_id      uuid;
  v_status  text;
  v_tanggal date;
  v_nama    text;
  v_jumlah  int;
  v_dobel   int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  v_nama    := nullif(trim(coalesce(p_header->>'nama_produk', '')), '');
  v_tanggal := nullif(p_header->>'tanggal_develop', '')::date;

  if v_nama is null then
    raise exception 'Nama produk wajib diisi';
  end if;
  if v_tanggal is null then
    raise exception 'Tanggal develop wajib diisi';
  end if;

  select count(*) into v_jumlah
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) r
  where coalesce(nullif(r->>'material_id', ''), nullif(r->>'item_id', ''))
        is not null
    and coalesce((r->>'percentage')::numeric, 0) > 0;

  if v_jumlah = 0 then
    raise exception 'Formula harus punya minimal satu bahan dengan persentase lebih dari 0';
  end if;

  select count(*) - count(distinct coalesce(
           nullif(r->>'material_id', ''), nullif(r->>'item_id', '')))
    into v_dobel
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) r
  where coalesce(nullif(r->>'material_id', ''), nullif(r->>'item_id', ''))
        is not null;

  if v_dobel > 0 then
    raise exception 'Ada bahan yang dipakai dua kali di formula ini';
  end if;

  if p_formula_id is null then
    -- Nomor induk: RND.YYYYMM + 3 digit. Revisi memakai akhiran
    -- "-R<n>", dan penjaga regex di bawah yang membuatnya tidak
    -- ikut terbaca sebagai urutan induk.
    v_prefix := 'RND.' || to_char(v_tanggal, 'YYYYMM');
    select coalesce(max(substring(no_formula from length(v_prefix) + 1)::int), 0)
      into v_seq
    from rnd_formulas
    where organization_id = p_organization_id
      and no_formula like v_prefix || '%'
      and substring(no_formula from length(v_prefix) + 1) ~ '^\d+$';

    v_no := v_prefix || lpad((v_seq + 1)::text, 3, '0');

    insert into rnd_formulas (
      organization_id, no_formula, induk_id, revisi, nama_produk, brand,
      client_id, tanggal_develop, status, trial_gram, netto_gram, catatan,
      dibuat_oleh
    ) values (
      p_organization_id, v_no, null, 0, v_nama,
      nullif(trim(coalesce(p_header->>'brand', '')), ''),
      nullif(p_header->>'client_id', '')::uuid,
      v_tanggal, 'Draft',
      nullif(p_header->>'trial_gram', '')::numeric,
      nullif(p_header->>'netto_gram', '')::numeric,
      nullif(trim(coalesce(p_header->>'catatan', '')), ''),
      p_dibuat_oleh
    ) returning id into v_id;
  else
    select status into v_status
    from rnd_formulas
    where id = p_formula_id and organization_id = p_organization_id
    for update;

    if not found then
      raise exception 'Formula tidak ditemukan';
    end if;

    if v_status in ('Disetujui', 'Arsip') then
      raise exception 'Formula berstatus % tidak bisa disunting. Buat revisi baru lewat tab Revisi.', v_status;
    end if;

    update rnd_formulas set
      nama_produk     = v_nama,
      brand           = nullif(trim(coalesce(p_header->>'brand', '')), ''),
      client_id       = nullif(p_header->>'client_id', '')::uuid,
      tanggal_develop = v_tanggal,
      trial_gram      = nullif(p_header->>'trial_gram', '')::numeric,
      netto_gram      = nullif(p_header->>'netto_gram', '')::numeric,
      catatan         = nullif(trim(coalesce(p_header->>'catatan', '')), '')
    where id = p_formula_id and organization_id = p_organization_id;

    v_id := p_formula_id;
  end if;

  perform rnd_tulis_baris(p_organization_id, v_id, p_items, p_specs, p_packaging);

  return v_id;
end;
$$;


-- ============================================================
-- 6. revise_rnd_formula_tx, ikut menyalin kolom sumber yang baru
-- ============================================================
create or replace function public.revise_rnd_formula_tx(
  p_organization_id uuid,
  p_formula_id      uuid,
  p_tanggal         date,
  p_alasan          text,
  p_dibuat_oleh     uuid
) returns uuid
language plpgsql
as $$
declare
  v_induk   uuid;
  v_no_ind  text;
  v_revisi  int;
  v_no      text;
  v_baru    uuid;
  v_src     rnd_formulas%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_tanggal is null then
    raise exception 'Tanggal revisi wajib diisi';
  end if;

  select * into v_src
  from rnd_formulas
  where id = p_formula_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Formula tidak ditemukan';
  end if;

  v_induk := coalesce(v_src.induk_id, v_src.id);

  select no_formula into v_no_ind
  from rnd_formulas
  where id = v_induk and organization_id = p_organization_id;

  select coalesce(max(revisi), 0) + 1 into v_revisi
  from rnd_formulas
  where organization_id = p_organization_id
    and (id = v_induk or induk_id = v_induk);

  v_no := v_no_ind || '-R' || v_revisi;

  insert into rnd_formulas (
    organization_id, no_formula, induk_id, revisi, nama_produk, brand,
    client_id, tanggal_develop, status, trial_gram, netto_gram, catatan,
    alasan_revisi, dibuat_oleh
  ) values (
    p_organization_id, v_no, v_induk, v_revisi, v_src.nama_produk, v_src.brand,
    v_src.client_id, p_tanggal, 'Draft', v_src.trial_gram, v_src.netto_gram,
    v_src.catatan, nullif(trim(coalesce(p_alasan, '')), ''), p_dibuat_oleh
  ) returning id into v_baru;

  insert into rnd_formula_items (
    organization_id, formula_id, material_id, item_id, fase, percentage,
    fungsi, catatan
  )
  select organization_id, v_baru, material_id, item_id, fase, percentage,
         fungsi, catatan
  from rnd_formula_items
  where formula_id = p_formula_id and organization_id = p_organization_id;

  insert into rnd_formula_specs (
    organization_id, formula_id, urutan, grup, parameter, satuan, target, hasil
  )
  select organization_id, v_baru, urutan, grup, parameter, satuan, target, null
  from rnd_formula_specs
  where formula_id = p_formula_id and organization_id = p_organization_id;

  insert into rnd_formula_packaging (
    organization_id, formula_id, material_id, item_id, nama, qty_per_pcs,
    harga_estimasi
  )
  select organization_id, v_baru, material_id, item_id, nama, qty_per_pcs,
         harga_estimasi
  from rnd_formula_packaging
  where formula_id = p_formula_id and organization_id = p_organization_id;

  return v_baru;
end;
$$;
