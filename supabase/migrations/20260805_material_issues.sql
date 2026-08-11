-- ============================================================
-- Pemakaian Bahan di luar produksi (Material Issue).
--
-- MASALAH YANG DISELESAIKAN
--
-- Bahan baku tidak selalu habis lewat produksi. Alkohol untuk
-- sanitasi ruang, bahan untuk trial R&D, sampel yang dikirim ke
-- client, semuanya keluar dari gudang tanpa dokumen. Akibatnya
-- stok fisik dan stok sistem selisih, dan selisihnya baru ketahuan
-- saat opname, tanpa jejak siapa memakai untuk apa.
--
-- Dokumen ini mencatatnya: satu header per pemakaian, satu baris
-- detail per LOT yang terpotong (bukan per item), supaya biayanya
-- memakai harga lot yang benar-benar terpakai dan pembatalannya
-- bisa mengembalikan qty ke batch asalnya.
--
-- POLA YANG DIIKUTI
--
-- Sama dengan create_production / cancel_production:
--  - satu pg_advisory_xact_lock per organisasi di awal fungsi,
--  - potong purchase_batches.qty_sisa secara FEFO,
--  - semua UPDATE qty relatif (`qty_sisa = qty_sisa - n`),
--  - tolak seluruh transaksi bila stok kurang.
--
-- Tanggal dikirim dari aplikasi (lib/dates.ts), BUKAN current_date:
-- server berjalan di UTC, tanggal kalender operasional dihitung di
-- sisi aplikasi.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================


-- ============================================================
-- 1. Tabel
-- ============================================================

create table if not exists public.material_issues (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  no_pemakaian    text not null,
  tanggal         date not null,
  tujuan          text not null,
  catatan         text,
  total_biaya     numeric not null default 0,
  dibuat_oleh     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Nomor dokumen unik per organisasi, bukan global
create unique index if not exists material_issues_no_uniq
  on public.material_issues (organization_id, no_pemakaian);

create index if not exists material_issues_org_tanggal_idx
  on public.material_issues (organization_id, tanggal desc);

-- Satu baris per LOT yang terpotong: satu item bisa menghasilkan
-- beberapa baris kalau FEFO menyeberang lot.
create table if not exists public.material_issue_items (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  issue_id          uuid not null references public.material_issues(id) on delete cascade,
  item_id           uuid not null references public.items(id),
  purchase_batch_id uuid references public.purchase_batches(id),
  qty               numeric not null,
  harga_per_unit    numeric not null default 0,
  subtotal          numeric not null default 0
);

create index if not exists material_issue_items_issue_idx
  on public.material_issue_items (issue_id);

create index if not exists material_issue_items_org_item_idx
  on public.material_issue_items (organization_id, item_id);


-- ============================================================
-- 2. Row Level Security
--
-- CATATAN: policy di bawah memakai pola "organisasi sendiri, atau
-- super admin boleh semua". Kalau tabel lain di project ini memakai
-- ekspresi yang berbeda (mis. lewat fungsi helper), samakan dulu
-- policy ini dengan yang ada di `purchase_batches` sebelum dipakai.
-- ============================================================

alter table public.material_issues       enable row level security;
alter table public.material_issue_items  enable row level security;

drop policy if exists material_issues_org on public.material_issues;
create policy material_issues_org on public.material_issues
  for all to authenticated
  using (
    organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_super_admin)
  )
  with check (
    organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_super_admin)
  );

drop policy if exists material_issue_items_org on public.material_issue_items;
create policy material_issue_items_org on public.material_issue_items
  for all to authenticated
  using (
    organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_super_admin)
  )
  with check (
    organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_super_admin)
  );


-- ============================================================
-- 3. create_material_issue_tx
--
-- Header + penomoran + potong stok FEFO + biaya per lot, satu
-- transaksi. Stok kurang = seluruh dokumen ditolak, tidak ada
-- pemotongan setengah jalan.
-- ============================================================
create or replace function public.create_material_issue_tx(
  p_organization_id uuid,
  p_tanggal         date,
  p_tujuan          text,
  p_catatan         text,
  p_dibuat_oleh     uuid,
  p_items           jsonb   -- [{item_id, qty}]
) returns uuid
language plpgsql
as $$
declare
  v_prefix    text;
  v_seq       int;
  v_no        text;
  v_issue     uuid;
  v_it        record;
  v_batch     record;
  v_needed    numeric;
  v_take      numeric;
  v_tersedia  numeric;
  v_nama      text;
  v_satuan    text;
  v_total     numeric := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_tanggal is null then
    raise exception 'Tanggal pemakaian wajib diisi';
  end if;

  -- Kategori tujuan: daftarnya juga ada di lib/materialIssue.ts.
  -- Kalau menambah kategori, ubah DUA-DUANYA.
  if p_tujuan is null or p_tujuan not in (
    'R&D', 'Cleaning & Sanitasi', 'Sampel', 'Rusak / Tumpah', 'Lain-lain'
  ) then
    raise exception 'Tujuan pemakaian tidak dikenal';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu bahan dengan qty lebih dari 0';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where (x->>'qty')::numeric is null or (x->>'qty')::numeric <= 0
  ) then
    raise exception 'Qty pemakaian harus lebih dari 0';
  end if;

  -- Nomor MI.YYYYMM### berurutan per organisasi per bulan.
  -- Bagian setelah prefix dipotong langsung, bukan dicari dengan regex
  -- digit-terakhir: 'MI.202608001' akan terbaca 202608001 kalau begitu.
  v_prefix := 'MI.' || to_char(p_tanggal, 'YYYYMM');
  select coalesce(max(substring(no_pemakaian from length(v_prefix) + 1)::int), 0)
    into v_seq
  from material_issues
  where organization_id = p_organization_id
    and no_pemakaian like v_prefix || '%'
    and substring(no_pemakaian from length(v_prefix) + 1) ~ '^\d+$';

  v_no := v_prefix || lpad((v_seq + 1)::text, 3, '0');

  insert into material_issues (
    organization_id, no_pemakaian, tanggal, tujuan, catatan, dibuat_oleh
  ) values (
    p_organization_id, v_no, p_tanggal, p_tujuan, nullif(trim(coalesce(p_catatan, '')), ''), p_dibuat_oleh
  ) returning id into v_issue;

  -- Qty digabung per item dulu: kalau satu bahan diisi dua baris,
  -- pengecekan stoknya harus melihat totalnya.
  for v_it in
    select (x->>'item_id')::uuid as item_id,
           sum((x->>'qty')::numeric) as qty
    from jsonb_array_elements(p_items) x
    group by 1
  loop
    select i.nama, i.satuan into v_nama, v_satuan
    from items i
    where i.id = v_it.item_id and i.organization_id = p_organization_id;

    if not found then
      raise exception 'Ada bahan yang tidak terdaftar di organisasi ini';
    end if;

    select coalesce(sum(pb.qty_sisa), 0) into v_tersedia
    from purchase_batches pb
    where pb.organization_id = p_organization_id
      and pb.item_id = v_it.item_id
      and pb.qty_sisa > 0;

    if v_it.qty > v_tersedia + 0.000001 then
      raise exception 'Stok % tidak cukup (tersedia % %)',
        v_nama, v_tersedia, coalesce(v_satuan, '');
    end if;

    v_needed := v_it.qty;

    -- FEFO: yang paling cepat kedaluwarsa dipakai lebih dulu.
    -- Batch tanpa exp_date diambil paling belakang, lalu urut
    -- penerimaan supaya hasilnya deterministik.
    for v_batch in
      select pb.id, pb.qty_sisa, pb.harga_per_unit
      from purchase_batches pb
      where pb.organization_id = p_organization_id
        and pb.item_id = v_it.item_id
        and pb.qty_sisa > 0
      order by pb.exp_date asc nulls last, pb.tanggal_terima asc, pb.created_at asc
      for update
    loop
      exit when v_needed <= 0;

      v_take := least(v_batch.qty_sisa, v_needed);

      update purchase_batches
        set qty_sisa = qty_sisa - v_take
        where id = v_batch.id;

      insert into material_issue_items (
        organization_id, issue_id, item_id, purchase_batch_id,
        qty, harga_per_unit, subtotal
      ) values (
        p_organization_id, v_issue, v_it.item_id, v_batch.id,
        v_take, coalesce(v_batch.harga_per_unit, 0),
        v_take * coalesce(v_batch.harga_per_unit, 0)
      );

      v_total  := v_total + v_take * coalesce(v_batch.harga_per_unit, 0);
      v_needed := v_needed - v_take;
    end loop;

    -- Tidak boleh terjadi (sudah dicek di atas, dan barisnya dikunci),
    -- tapi kalau terjadi lebih baik seluruh transaksi batal.
    if v_needed > 0.000001 then
      raise exception 'Stok % berubah saat proses, ulangi transaksinya', v_nama;
    end if;
  end loop;

  update material_issues set total_biaya = v_total where id = v_issue;

  return v_issue;
end;
$$;


-- ============================================================
-- 4. cancel_material_issue_tx
--
-- Kembalikan qty ke batch ASALNYA (pola sama dengan
-- cancel_production), lalu hapus detail & header.
-- ============================================================
create or replace function public.cancel_material_issue_tx(
  p_organization_id uuid,
  p_issue_id        uuid
) returns void
language plpgsql
as $$
declare
  v_row record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if not exists (
    select 1 from material_issues
    where id = p_issue_id and organization_id = p_organization_id
  ) then
    raise exception 'Dokumen pemakaian bahan tidak ditemukan';
  end if;

  for v_row in
    select id, purchase_batch_id, qty
    from material_issue_items
    where issue_id = p_issue_id
      and organization_id = p_organization_id
  loop
    if v_row.purchase_batch_id is not null then
      -- Relatif, bukan nilai hasil hitung di aplikasi
      update purchase_batches
        set qty_sisa = qty_sisa + v_row.qty
        where id = v_row.purchase_batch_id
          and organization_id = p_organization_id;
    end if;
  end loop;

  delete from material_issue_items
    where issue_id = p_issue_id and organization_id = p_organization_id;

  delete from material_issues
    where id = p_issue_id and organization_id = p_organization_id;
end;
$$;
