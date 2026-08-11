-- ============================================================
-- Retur pembelian ke supplier.
--
-- MASALAH YANG DISELESAIKAN
--
-- Barang masuk sudah bisa ditolak QC, tapi berhentinya di situ: stoknya
-- hangus dan tercatat di batch_dispositions, sementara FAKTURNYA tetap
-- utuh. Hutang ke supplier tidak berkurang sepeser pun untuk barang yang
-- dikembalikan, dan tidak ada dokumen resmi yang bisa dikirim ke supplier
-- sebagai dasar potong tagihan.
--
-- DUA HAL YANG DIPISAH, DAN INI YANG PALING MUDAH SALAH
--
-- Pergerakan STOK dan pengurangan HUTANG tidak selalu terjadi bersamaan:
--
--  - Batch yang DITOLAK QC stoknya SUDAH nol (decideQc menulis
--    qty_sisa = 0, qty_karantina = 0, lalu mencatat batch_dispositions
--    'QC Reject'). Retur untuk batch ini TIDAK BOLEH memotong stok lagi,
--    kalau dipotong, satu barang yang sama keluar dua kali dari laporan.
--    Yang berkurang hanya hutangnya.
--  - Batch yang masih di karantina atau sudah di-release stoknya MASIH
--    ada. Retur memotongnya, dan hutangnya ikut berkurang.
--
-- Karena itu tiap baris retur menyimpan asal potongannya
-- (qty_dari_karantina / qty_dari_sisa). Nilainya nol untuk batch yang
-- sudah ditolak QC, dan itu juga yang membuat pembatalan retur bisa
-- mengembalikan qty ke tempat yang persis benar.
--
-- HUTANG
--
-- receivings.total_retur bertambah sebesar nilai retur TERMASUK PPN,
-- memakai ppn_percent faktur aslinya. Sisa hutang sebuah faktur jadi
-- total_invoice - total_retur.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================


-- ============================================================
-- 1. Kolom hutang di faktur pembelian
-- ============================================================
alter table public.receivings
  add column if not exists total_retur numeric not null default 0;


-- ============================================================
-- 2. Tabel dokumen retur
-- ============================================================

create table if not exists public.purchase_returns (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  no_retur        text not null,
  tanggal         date not null,
  -- Retur selalu terhadap SATU faktur penerimaan. Tanpa itu, pengurangan
  -- hutangnya tidak punya alamat yang jelas.
  receiving_id    uuid not null references public.receivings(id),
  supplier_id     uuid,
  supplier_nama   text,
  alasan          text not null,
  catatan         text,
  -- Termasuk PPN: ini angka yang mengurangi tagihan
  total_nilai     numeric not null default 0,
  dibuat_oleh     uuid,
  created_at      timestamptz not null default now()
);

create unique index if not exists purchase_returns_no_uniq
  on public.purchase_returns (organization_id, no_retur);

create index if not exists purchase_returns_org_tanggal_idx
  on public.purchase_returns (organization_id, tanggal desc);

create index if not exists purchase_returns_receiving_idx
  on public.purchase_returns (receiving_id);

create table if not exists public.purchase_return_items (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  retur_id           uuid not null references public.purchase_returns(id) on delete cascade,
  purchase_batch_id  uuid not null references public.purchase_batches(id),
  item_id            uuid not null references public.items(id),
  qty                numeric not null,
  -- Asal potongan stok, dipakai saat pembatalan. Dua-duanya 0 berarti
  -- stoknya memang sudah tidak ada di pembukuan (batch ditolak QC).
  qty_dari_karantina numeric not null default 0,
  qty_dari_sisa      numeric not null default 0,
  harga_per_unit     numeric not null default 0,
  subtotal           numeric not null default 0   -- sebelum PPN
);

create index if not exists purchase_return_items_retur_idx
  on public.purchase_return_items (retur_id);

create index if not exists purchase_return_items_batch_idx
  on public.purchase_return_items (purchase_batch_id);

create index if not exists purchase_return_items_org_item_idx
  on public.purchase_return_items (organization_id, item_id);


-- ============================================================
-- 3. Row Level Security
-- ============================================================

alter table public.purchase_returns      enable row level security;
alter table public.purchase_return_items enable row level security;

drop policy if exists purchase_returns_org on public.purchase_returns;
create policy purchase_returns_org on public.purchase_returns
  for all to authenticated
  using (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  )
  with check (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  );

drop policy if exists purchase_return_items_org on public.purchase_return_items;
create policy purchase_return_items_org on public.purchase_return_items
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
-- 4. create_purchase_return_tx
-- ============================================================
create or replace function public.create_purchase_return_tx(
  p_organization_id uuid,
  p_tanggal         date,
  p_receiving_id    uuid,
  p_alasan          text,
  p_catatan         text,
  p_dibuat_oleh     uuid,
  p_items           jsonb   -- [{batch_id, qty}]
) returns uuid
language plpgsql
as $$
declare
  v_rcv       record;
  v_batch     record;
  v_it        record;
  v_prefix    text;
  v_seq       int;
  v_no        text;
  v_retur     uuid;
  v_sudah     numeric;
  v_maks      numeric;
  v_dari_kar  numeric;
  v_dari_sis  numeric;
  v_sisa_amb  numeric;
  v_subtotal  numeric := 0;
  v_total     numeric;
  v_nama      text;
  v_satuan    text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_tanggal is null then
    raise exception 'Tanggal retur wajib diisi';
  end if;

  -- Daftar yang sama ada di lib/purchaseReturn.ts. Kalau menambah alasan,
  -- ubah DUA-DUANYA.
  if p_alasan is null or p_alasan not in (
    'Rusak', 'Tidak Sesuai Spesifikasi', 'Ditolak QC',
    'Salah Kirim', 'Kelebihan Kirim', 'Lain-lain'
  ) then
    raise exception 'Alasan retur tidak dikenal';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu barang dengan qty lebih dari 0';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where (x->>'qty')::numeric is null or (x->>'qty')::numeric <= 0
  ) then
    raise exception 'Qty retur harus lebih dari 0';
  end if;

  select r.id, r.po_id, r.tanggal_terima, r.ppn_percent, r.total_invoice,
         r.total_retur, r.supplier_id, r.supplier_nama
    into v_rcv
  from receivings r
  where r.id = p_receiving_id
    and r.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Faktur penerimaan tidak ditemukan';
  end if;

  v_prefix := 'RTR.' || to_char(p_tanggal, 'YYYYMM');
  select coalesce(max(substring(no_retur from length(v_prefix) + 1)::int), 0)
    into v_seq
  from purchase_returns
  where organization_id = p_organization_id
    and no_retur like v_prefix || '%'
    and substring(no_retur from length(v_prefix) + 1) ~ '^\d+$';

  v_no := v_prefix || lpad((v_seq + 1)::text, 3, '0');

  insert into purchase_returns (
    organization_id, no_retur, tanggal, receiving_id,
    supplier_id, supplier_nama, alasan, catatan, dibuat_oleh
  ) values (
    p_organization_id, v_no, p_tanggal, v_rcv.id,
    v_rcv.supplier_id, v_rcv.supplier_nama, p_alasan,
    nullif(trim(coalesce(p_catatan, '')), ''), p_dibuat_oleh
  ) returning id into v_retur;

  -- Qty digabung per batch dulu: satu batch yang diisi dua baris harus
  -- diperiksa berdasarkan totalnya, bukan masing-masing.
  for v_it in
    select (x->>'batch_id')::uuid as batch_id,
           sum((x->>'qty')::numeric) as qty
    from jsonb_array_elements(p_items) x
    group by 1
  loop
    select pb.id, pb.item_id, pb.qty_masuk, pb.qty_sisa, pb.qty_karantina,
           pb.harga_per_unit, pb.qc_status, pb.receiving_id, pb.po_id,
           pb.tanggal_terima
      into v_batch
    from purchase_batches pb
    where pb.id = v_it.batch_id
      and pb.organization_id = p_organization_id
    for update;

    if not found then
      raise exception 'Ada batch yang tidak ditemukan';
    end if;

    -- Batch harus benar-benar milik faktur ini. Data lama belum punya
    -- receiving_id, jadi dicocokkan lewat PO + tanggal terima, sama
    -- seperti fallback di halaman detail penerimaan.
    if not (
      v_batch.receiving_id = v_rcv.id
      or (v_batch.receiving_id is null
          and v_batch.po_id is not distinct from v_rcv.po_id
          and v_batch.tanggal_terima = v_rcv.tanggal_terima)
    ) then
      raise exception 'Ada batch yang bukan bagian dari faktur penerimaan ini';
    end if;

    select i.nama, i.satuan into v_nama, v_satuan
    from items i where i.id = v_batch.item_id;

    if v_batch.qc_status = 'Rejected' then
      -- Stoknya sudah dihapus saat QC menolak. Yang dibatasi di sini
      -- jumlah yang sudah pernah diretur, supaya satu batch tidak
      -- ditagihkan balik ke supplier dua kali.
      select coalesce(sum(ri.qty), 0) into v_sudah
      from purchase_return_items ri
      where ri.purchase_batch_id = v_batch.id
        and ri.organization_id = p_organization_id
        and ri.retur_id <> v_retur;

      v_maks     := v_batch.qty_masuk - v_sudah;
      v_dari_kar := 0;
      v_dari_sis := 0;
    else
      -- Stok masih ada di pembukuan: karantina dipotong lebih dulu,
      -- sisanya dari stok siap pakai.
      v_maks := coalesce(v_batch.qty_karantina, 0) + coalesce(v_batch.qty_sisa, 0);

      v_dari_kar := least(coalesce(v_batch.qty_karantina, 0), v_it.qty);
      v_sisa_amb := v_it.qty - v_dari_kar;
      v_dari_sis := least(coalesce(v_batch.qty_sisa, 0), v_sisa_amb);
    end if;

    if v_it.qty > v_maks + 0.000001 then
      raise exception 'Qty retur % melebihi yang bisa dikembalikan (maksimal % %)',
        coalesce(v_nama, 'barang'), v_maks, coalesce(v_satuan, '');
    end if;

    if v_dari_kar > 0 then
      update purchase_batches
        set qty_karantina = qty_karantina - v_dari_kar
        where id = v_batch.id;
    end if;
    if v_dari_sis > 0 then
      update purchase_batches
        set qty_sisa = qty_sisa - v_dari_sis
        where id = v_batch.id;
    end if;

    insert into purchase_return_items (
      organization_id, retur_id, purchase_batch_id, item_id,
      qty, qty_dari_karantina, qty_dari_sisa, harga_per_unit, subtotal
    ) values (
      p_organization_id, v_retur, v_batch.id, v_batch.item_id,
      v_it.qty, v_dari_kar, v_dari_sis,
      coalesce(v_batch.harga_per_unit, 0),
      v_it.qty * coalesce(v_batch.harga_per_unit, 0)
    );

    v_subtotal := v_subtotal + v_it.qty * coalesce(v_batch.harga_per_unit, 0);
  end loop;

  -- Nilai yang mengurangi tagihan: ikut PPN faktur aslinya
  v_total := v_subtotal * (1 + coalesce(v_rcv.ppn_percent, 0) / 100);

  if coalesce(v_rcv.total_retur, 0) + v_total > coalesce(v_rcv.total_invoice, 0) + 0.01 then
    raise exception 'Total retur melebihi nilai faktur (sisa yang bisa diretur %)',
      coalesce(v_rcv.total_invoice, 0) - coalesce(v_rcv.total_retur, 0);
  end if;

  update purchase_returns set total_nilai = v_total where id = v_retur;

  -- Relatif, bukan nilai hasil hitung di aplikasi
  update receivings
    set total_retur = total_retur + v_total
    where id = v_rcv.id;

  return v_retur;
end;
$$;


-- ============================================================
-- 5. cancel_purchase_return_tx
--
-- Kembalikan qty ke kolom ASALNYA dan pulihkan hutangnya.
-- ============================================================
create or replace function public.cancel_purchase_return_tx(
  p_organization_id uuid,
  p_retur_id        uuid
) returns void
language plpgsql
as $$
declare
  v_retur record;
  v_row   record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select id, receiving_id, total_nilai into v_retur
  from purchase_returns
  where id = p_retur_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Dokumen retur tidak ditemukan';
  end if;

  for v_row in
    select purchase_batch_id, qty_dari_karantina, qty_dari_sisa
    from purchase_return_items
    where retur_id = p_retur_id
      and organization_id = p_organization_id
  loop
    if v_row.qty_dari_karantina > 0 then
      update purchase_batches
        set qty_karantina = qty_karantina + v_row.qty_dari_karantina
        where id = v_row.purchase_batch_id
          and organization_id = p_organization_id;
    end if;
    if v_row.qty_dari_sisa > 0 then
      update purchase_batches
        set qty_sisa = qty_sisa + v_row.qty_dari_sisa
        where id = v_row.purchase_batch_id
          and organization_id = p_organization_id;
    end if;
  end loop;

  update receivings
    set total_retur = greatest(total_retur - coalesce(v_retur.total_nilai, 0), 0)
    where id = v_retur.receiving_id
      and organization_id = p_organization_id;

  delete from purchase_return_items
    where retur_id = p_retur_id and organization_id = p_organization_id;

  delete from purchase_returns
    where id = p_retur_id and organization_id = p_organization_id;
end;
$$;


-- ============================================================
-- 6. Audit trail
--
-- Header saja, mengikuti aturan di 20260806_activity_logs.sql: baris
-- anak tidak dipantau karena setiap alur yang mengubahnya selalu ikut
-- menyentuh header-nya.
-- ============================================================
drop trigger if exists trg_log_purchase_returns on public.purchase_returns;
create trigger trg_log_purchase_returns
  after insert or update or delete on public.purchase_returns
  for each row execute function public.log_activity('purchase-returns', 'no_retur', '');
