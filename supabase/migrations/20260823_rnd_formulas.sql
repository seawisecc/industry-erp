-- ============================================================
-- R&D Formulation: develop formula sebelum jadi produk.
--
-- MASALAH YANG DISELESAIKAN
--
-- Formula lahir jauh sebelum produknya ada. Formulator mencoba,
-- membawa lembar kerja ke lab, mencatat hasil, lalu mencoba lagi
-- dengan komposisi yang digeser sedikit. Selama ini seluruh siklus
-- itu hidup di spreadsheet pribadi: tidak ada nomor, tidak ada
-- riwayat versi, dan bahan yang dipakai trial keluar dari gudang
-- lewat Material Issue tanpa pernah bisa dihubungkan ke formula
-- mana.
--
-- Akibat yang paling mahal bukan kehilangan file, melainkan
-- kehilangan JEJAK PERUBAHAN. Waktu satu batch produksi bermasalah,
-- pertanyaan pertama selalu "formula versi berapa yang dipakai",
-- dan jawabannya harus bisa ditunjukkan, bukan diingat.
--
-- BENTUKNYA: SATU BARIS PER VERSI, BUKAN SATU BARIS YANG DISUNTING
--
-- Revisi TIDAK menimpa formula sebelumnya. Tiap revisi adalah baris
-- baru yang menunjuk ke induknya, dengan nomor turunan:
--
--   RND.202609001        formula asli
--   RND.202609001-R1     revisi pertama
--   RND.202609001-R2     revisi kedua
--
-- Konsekuensinya, dan ini yang membuat modul ini ada: formula yang
-- sudah `Disetujui` DIBEKUKAN. Mengubahnya berarti membuat revisi,
-- bukan menyunting barisnya. Alasannya sama dengan opname yang sudah
-- ditutup: barisnya adalah potret keputusan pada hari itu, bukan
-- daftar yang boleh dirapikan belakangan.
--
-- SATU YANG DISETUJUI PER SILSILAH
--
-- `approve_rnd_formula_tx` menurunkan revisi yang tadinya disetujui
-- jadi `Arsip`. Dua versi berstatus Disetujui dalam satu silsilah
-- berarti tidak ada yang tahu mana yang dipakai produksi, dan itu
-- persis keadaan yang mau dihilangkan.
--
-- SATUAN
--
-- Persentase formula ditafsirkan sama persis dengan
-- `product_formulas`: qty bahan = % x massa ruahan, dalam satuan
-- item itu sendiri. Modul produksi sudah memakai konvensi ini
-- (lihat PlanForm: `qty = (percentage / 100) * bulkKg`), jadi biaya
-- yang dihitung di layar R&D memakai angka yang sama dengan yang
-- nanti benar-benar terpotong.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================


-- ============================================================
-- 1. Tabel
-- ============================================================

create table if not exists public.rnd_formulas (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  no_formula      text not null,
  -- Induk silsilah revisi. null = baris ini sendiri yang jadi induk.
  induk_id        uuid references public.rnd_formulas(id) on delete cascade,
  revisi          int not null default 0,
  nama_produk     text not null,
  brand           text,
  client_id       uuid references public.clients(id) on delete set null,
  tanggal_develop date not null,
  -- Draft / Trial / Disetujui / Arsip
  status          text not null default 'Draft',
  -- Ukuran batch trial di lab, dalam GRAM. Lembar kerja lab memakai
  -- angka ini; produksi memakai kg, jadi keduanya sengaja dipisah.
  trial_gram      numeric,
  -- Gramasi produk jadi per pcs, dipakai menghitung biaya per pcs.
  netto_gram      numeric,
  catatan         text,
  alasan_revisi   text,
  hasil_develop   text,
  disetujui_oleh  uuid,
  disetujui_pada  timestamptz,
  dibuat_oleh     uuid,
  created_at      timestamptz not null default now()
);

-- Nomor unik per organisasi, bukan global
create unique index if not exists rnd_formulas_no_uniq
  on public.rnd_formulas (organization_id, no_formula);

create index if not exists rnd_formulas_org_tanggal_idx
  on public.rnd_formulas (organization_id, tanggal_develop desc);

create index if not exists rnd_formulas_induk_idx
  on public.rnd_formulas (induk_id);

create table if not exists public.rnd_formula_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  formula_id      uuid not null references public.rnd_formulas(id) on delete cascade,
  item_id         uuid not null references public.items(id) on delete restrict,
  fase            text,
  percentage      numeric not null,
  -- Peran bahan di formula (emulsifier, humektan, pengawet). Bukan
  -- data master, cuma keterangan yang membuat formula bisa dibaca
  -- orang lain tanpa bertanya.
  fungsi          text,
  catatan         text
);

create unique index if not exists rnd_formula_items_uniq
  on public.rnd_formula_items (formula_id, item_id);

create index if not exists rnd_formula_items_org_item_idx
  on public.rnd_formula_items (organization_id, item_id);

-- Spesifikasi target + hasil ujinya. Target diisi saat develop,
-- `hasil` diisi setelah lembar kerja kembali dari lab.
create table if not exists public.rnd_formula_specs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  formula_id      uuid not null references public.rnd_formulas(id) on delete cascade,
  urutan          int not null default 0,
  grup            text,
  parameter       text not null,
  satuan          text,
  target          text,
  hasil           text
);

create index if not exists rnd_formula_specs_formula_idx
  on public.rnd_formula_specs (formula_id);

-- Rencana kemasan per pcs, untuk estimasi biaya. `item_id` boleh null
-- karena kemasan yang sedang dijajaki sering belum pernah dibeli dan
-- belum punya baris di master item; untuk baris seperti itu harganya
-- diketik tangan.
create table if not exists public.rnd_formula_packaging (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  formula_id      uuid not null references public.rnd_formulas(id) on delete cascade,
  item_id         uuid references public.items(id) on delete set null,
  nama            text,
  qty_per_pcs     numeric not null default 1,
  harga_estimasi  numeric
);

create index if not exists rnd_formula_packaging_formula_idx
  on public.rnd_formula_packaging (formula_id);


-- ============================================================
-- 2. Row Level Security
-- ============================================================

alter table public.rnd_formulas          enable row level security;
alter table public.rnd_formula_items     enable row level security;
alter table public.rnd_formula_specs     enable row level security;
alter table public.rnd_formula_packaging enable row level security;

drop policy if exists rnd_formulas_org on public.rnd_formulas;
create policy rnd_formulas_org on public.rnd_formulas
  for all to authenticated
  using (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  )
  with check (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  );

drop policy if exists rnd_formula_items_org on public.rnd_formula_items;
create policy rnd_formula_items_org on public.rnd_formula_items
  for all to authenticated
  using (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  )
  with check (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  );

drop policy if exists rnd_formula_specs_org on public.rnd_formula_specs;
create policy rnd_formula_specs_org on public.rnd_formula_specs
  for all to authenticated
  using (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  )
  with check (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  );

drop policy if exists rnd_formula_packaging_org on public.rnd_formula_packaging;
create policy rnd_formula_packaging_org on public.rnd_formula_packaging
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
-- 3. Penulis baris anak, dipakai bersama oleh simpan & revisi.
--
-- Sengaja satu fungsi, bukan disalin di dua tempat: bentuk jsonb
-- yang diterima dari aplikasi dan urutan kolomnya harus persis sama
-- di alur simpan maupun alur salin-revisi.
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
    organization_id, formula_id, item_id, fase, percentage, fungsi, catatan
  )
  select
    p_organization_id,
    p_formula_id,
    (r->>'item_id')::uuid,
    nullif(trim(coalesce(r->>'fase', '')), ''),
    coalesce((r->>'percentage')::numeric, 0),
    nullif(trim(coalesce(r->>'fungsi', '')), ''),
    nullif(trim(coalesce(r->>'catatan', '')), '')
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) r
  where nullif(r->>'item_id', '') is not null;

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
    organization_id, formula_id, item_id, nama, qty_per_pcs, harga_estimasi
  )
  select
    p_organization_id,
    p_formula_id,
    nullif(r->>'item_id', '')::uuid,
    nullif(trim(coalesce(r->>'nama', '')), ''),
    coalesce((r->>'qty_per_pcs')::numeric, 1),
    nullif(r->>'harga_estimasi', '')::numeric
  from jsonb_array_elements(coalesce(p_packaging, '[]'::jsonb)) r
  where nullif(r->>'item_id', '') is not null
     or nullif(trim(coalesce(r->>'nama', '')), '') is not null;
end;
$$;


-- ============================================================
-- 4. save_rnd_formula_tx
--
-- Buat formula baru (p_formula_id null) atau ganti seluruh isinya.
-- Polanya sama dengan update_po_tx: header + SELURUH baris ditulis
-- ulang dalam satu transaksi, tidak ada penambalan sebagian.
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
  where nullif(r->>'item_id', '') is not null
    and coalesce((r->>'percentage')::numeric, 0) > 0;

  if v_jumlah = 0 then
    raise exception 'Formula harus punya minimal satu bahan dengan persentase lebih dari 0';
  end if;

  select count(*) - count(distinct r->>'item_id') into v_dobel
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) r
  where nullif(r->>'item_id', '') is not null;

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

    -- Formula yang sudah diputuskan adalah potret keputusan hari itu.
    -- Perubahannya lewat revisi, supaya versi yang dipakai produksi
    -- tetap bisa ditunjuk.
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
-- 5. save_rnd_result_tx
--
-- Catatan hasil develop + hasil uji tiap parameter, boleh disimpan
-- berkali-kali selama formula belum diputuskan. Dicocokkan lewat id
-- baris spesifikasi, bukan nama parameternya: dua baris boleh
-- bernama sama pada grup yang berbeda.
-- ============================================================
create or replace function public.save_rnd_result_tx(
  p_organization_id uuid,
  p_formula_id      uuid,
  p_hasil_develop   text,
  p_specs           jsonb   -- [{id, hasil}]
) returns void
language plpgsql
as $$
declare
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select status into v_status
  from rnd_formulas
  where id = p_formula_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Formula tidak ditemukan';
  end if;
  if v_status in ('Disetujui', 'Arsip') then
    raise exception 'Formula berstatus % sudah dibekukan. Buat revisi baru untuk mencatat percobaan berikutnya.', v_status;
  end if;

  update rnd_formula_specs s set
    hasil = nullif(trim(coalesce(r->>'hasil', '')), '')
  from jsonb_array_elements(coalesce(p_specs, '[]'::jsonb)) r
  where s.formula_id = p_formula_id
    and s.organization_id = p_organization_id
    and s.id = nullif(r->>'id', '')::uuid;

  update rnd_formulas set
    hasil_develop = nullif(trim(coalesce(p_hasil_develop, '')), ''),
    -- Formula yang hasilnya sudah dicatat berarti sudah turun ke lab.
    status = case when status = 'Draft' then 'Trial' else status end
  where id = p_formula_id and organization_id = p_organization_id;
end;
$$;


-- ============================================================
-- 6. revise_rnd_formula_tx
--
-- Salin formula jadi versi berikutnya. Nomornya turunan dari INDUK,
-- bukan dari baris yang disalin: merevisi -R2 tetap menghasilkan -R3,
-- bukan "-R2-R1".
--
-- Hasil uji sengaja TIDAK ikut disalin. Angka pH milik percobaan
-- kemarin, dan membawanya ke lembar percobaan berikutnya adalah cara
-- paling gampang membuat orang lupa mengisinya.
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
    organization_id, formula_id, item_id, fase, percentage, fungsi, catatan
  )
  select organization_id, v_baru, item_id, fase, percentage, fungsi, catatan
  from rnd_formula_items
  where formula_id = p_formula_id and organization_id = p_organization_id;

  insert into rnd_formula_specs (
    organization_id, formula_id, urutan, grup, parameter, satuan, target, hasil
  )
  select organization_id, v_baru, urutan, grup, parameter, satuan, target, null
  from rnd_formula_specs
  where formula_id = p_formula_id and organization_id = p_organization_id;

  insert into rnd_formula_packaging (
    organization_id, formula_id, item_id, nama, qty_per_pcs, harga_estimasi
  )
  select organization_id, v_baru, item_id, nama, qty_per_pcs, harga_estimasi
  from rnd_formula_packaging
  where formula_id = p_formula_id and organization_id = p_organization_id;

  return v_baru;
end;
$$;


-- ============================================================
-- 7. approve_rnd_formula_tx
--
-- Satu versi yang berlaku per silsilah. Menyetujui revisi baru
-- menurunkan versi lama jadi Arsip dalam transaksi yang sama, jadi
-- tidak pernah ada dua formula "Disetujui" untuk produk yang sama.
-- ============================================================
create or replace function public.approve_rnd_formula_tx(
  p_organization_id uuid,
  p_formula_id      uuid,
  p_user            uuid,
  p_setuju          boolean
) returns void
language plpgsql
as $$
declare
  v_induk  uuid;
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select coalesce(induk_id, id), status into v_induk, v_status
  from rnd_formulas
  where id = p_formula_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Formula tidak ditemukan';
  end if;

  if p_setuju then
    if v_status = 'Disetujui' then
      return;
    end if;

    update rnd_formulas set
      status         = 'Arsip',
      disetujui_oleh = null,
      disetujui_pada = null
    where organization_id = p_organization_id
      and (id = v_induk or induk_id = v_induk)
      and id <> p_formula_id
      and status = 'Disetujui';

    update rnd_formulas set
      status         = 'Disetujui',
      disetujui_oleh = p_user,
      disetujui_pada = now()
    where id = p_formula_id and organization_id = p_organization_id;
  else
    if v_status <> 'Disetujui' then
      raise exception 'Formula ini belum disetujui';
    end if;

    update rnd_formulas set
      status         = 'Trial',
      disetujui_oleh = null,
      disetujui_pada = null
    where id = p_formula_id and organization_id = p_organization_id;
  end if;
end;
$$;


-- ============================================================
-- 8. delete_rnd_formula_tx
--
-- Cuma untuk percobaan yang batal sebelum diputuskan. Versi yang
-- punya turunan tidak boleh hilang: nomor revisinya menunjuk ke sini,
-- dan silsilah yang bolong tidak bisa dibaca siapa pun.
-- ============================================================
create or replace function public.delete_rnd_formula_tx(
  p_organization_id uuid,
  p_formula_id      uuid
) returns void
language plpgsql
as $$
declare
  v_status text;
  v_anak   int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select status into v_status
  from rnd_formulas
  where id = p_formula_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Formula tidak ditemukan';
  end if;
  if v_status = 'Disetujui' then
    raise exception 'Formula yang sudah disetujui tidak bisa dihapus. Batalkan persetujuannya dulu.';
  end if;

  select count(*) into v_anak
  from rnd_formulas
  where organization_id = p_organization_id and induk_id = p_formula_id;

  if v_anak > 0 then
    raise exception 'Formula ini punya % revisi turunan, jadi tidak bisa dihapus.', v_anak;
  end if;

  delete from rnd_formulas
  where id = p_formula_id and organization_id = p_organization_id;
end;
$$;


-- ============================================================
-- 9. Audit trail
--
-- Header saja, mengikuti aturan di 20260806_activity_logs.sql: baris
-- anak tidak dipantau karena setiap alur yang mengubahnya selalu ikut
-- menyentuh header-nya.
-- ============================================================
drop trigger if exists trg_log_rnd_formulas on public.rnd_formulas;
create trigger trg_log_rnd_formulas
  after insert or update or delete on public.rnd_formulas
  for each row execute function public.log_activity('rnd', 'no_formula', '');
