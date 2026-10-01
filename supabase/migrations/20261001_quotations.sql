-- ============================================================
-- Quotation (penawaran harga) + baris bebas di invoice.
--
-- MASALAH YANG DISELESAIKAN
--
-- Penawaran maklon, sample kit, dan layanan lain dibuat di luar
-- aplikasi, karena yang ditawarkan hampir selalu barang BARU: belum
-- ada di master Products maupun Services. Akibatnya nomor penawaran,
-- harga yang dijanjikan, dan masa berlakunya tidak tercatat di mana
-- pun, dan Proforma yang terbit sesudah client setuju harus diketik
-- ulang dari dokumen lain.
--
-- BARISNYA BEBAS, DAN ITU YANG MEMBUATNYA TIDAK MENYENTUH STOK
--
-- Baris quotation cuma deskripsi + qty + satuan + harga ketikan, tanpa
-- product_id. Tidak ada satu pun alur di sini yang memotong stok atau
-- menambah piutang. Piutang baru lahir waktu Proforma diterbitkan,
-- lewat create_sales_invoice_tx yang sama dengan invoice biasa.
--
-- BARIS INVOICE BOLEH TANPA PRODUK & JASA
--
-- sales_invoice_items dapat kolom `deskripsi`. Satu baris berisi
-- produk ATAU jasa ATAU deskripsi. Pembaca yang menghitung stok
-- (fg_stock_calc, lib/salesStock.ts), margin, dan dashboard sudah
-- menyaring product_id / service_id, jadi baris bebas otomatis tidak
-- terhitung sebagai barang keluar: memang tidak ada barangnya.
-- Cek stok di create_sales_invoice_tx juga sudah melewati baris yang
-- product_id-nya kosong.
--
-- Satuan baris bebas ditulis ke `varian_ukuran`, kolom yang dicetak
-- sebagai "Pack" di invoice. Kolom itu cuma jadi kunci stok bila
-- product_id terisi, jadi aman dipakai untuk baris yang tidak punya
-- produk.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================


-- ============================================================
-- 1. Baris invoice bebas
-- ============================================================

alter table public.sales_invoice_items
  add column if not exists deskripsi text;

-- NOT VALID: baris lama tidak diperiksa ulang, cuma yang ditulis
-- sesudah ini. Kalau ada baris lama yang produknya entah bagaimana
-- kosong, migrasi ini tidak boleh gagal karenanya.
alter table public.sales_invoice_items
  drop constraint if exists sales_invoice_items_ada_isi;
alter table public.sales_invoice_items
  add constraint sales_invoice_items_ada_isi
  check (
    product_id is not null
    or service_id is not null
    or nullif(btrim(deskripsi), '') is not null
  ) not valid;


-- ============================================================
-- 2. create_sales_invoice_tx, ikut menulis `deskripsi`
--
-- Isinya SALINAN PERSIS definisi yang terpasang di project (dibaca
-- lewat pg_get_functiondef, 1 Oktober 2026). Yang berubah cuma satu:
-- kolom deskripsi ikut di-insert. Fungsi aslinya bukan security
-- definer dan tidak punya SET, jadi tidak ada atribut yang perlu
-- dipasang kembali (lihat Jebakan Postgres di CLAUDE.md).
-- ============================================================
create or replace function public.create_sales_invoice_tx(
  p_organization_id uuid,
  p_header jsonb,
  p_items jsonb
) returns uuid
language plpgsql
as $function$
declare
  v_id uuid; v_prefix text; v_seq int; v_avail numeric; it jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  -- Cek stok hanya untuk penjualan yang memotong stok (Direct/POS);
  -- baris jasa & baris bebas (product_id null) dilewati.
  if p_header->>'sumber' in ('Direct', 'POS') then
    for it in select * from jsonb_array_elements(p_items) loop
      if nullif(it->>'product_id', '') is not null then
        v_avail := fg_available(
          p_organization_id, (it->>'product_id')::uuid, it->>'varian_ukuran');
        if (it->>'qty')::numeric > v_avail then
          raise exception
            'Stok produk jadi tidak cukup (tersedia % pcs untuk varian %)',
            v_avail, coalesce(nullif(it->>'varian_ukuran', ''), '-');
        end if;
      end if;
    end loop;
  end if;

  v_prefix := 'INV.' || replace(substr(p_header->>'tanggal', 1, 7), '-', '');
  select coalesce(max((substring(no_invoice from length(v_prefix) + 1))::int), 0)
    into v_seq
  from sales_invoices
  where organization_id = p_organization_id
    and no_invoice like v_prefix || '%'
    and substring(no_invoice from length(v_prefix) + 1) ~ '^[0-9]+$';

  insert into sales_invoices (
    no_invoice, tipe, sumber, client_id, consignment_id, nama_pembeli, tanggal,
    diskon_percent, pakai_tax, tax_percent, subtotal, total,
    top_days, jatuh_tempo, status_bayar, tanggal_bayar, catatan,
    dibuat_oleh, organization_id
  ) values (
    v_prefix || lpad((v_seq + 1)::text, 3, '0'),
    p_header->>'tipe',
    p_header->>'sumber',
    nullif(p_header->>'client_id', '')::uuid,
    nullif(p_header->>'consignment_id', '')::uuid,
    nullif(p_header->>'nama_pembeli', ''),
    (p_header->>'tanggal')::date,
    coalesce((p_header->>'diskon_percent')::numeric, 0),
    coalesce((p_header->>'pakai_tax')::boolean, false),
    coalesce((p_header->>'tax_percent')::numeric, 0),
    (p_header->>'subtotal')::numeric,
    (p_header->>'total')::numeric,
    nullif(p_header->>'top_days', '')::int,
    nullif(p_header->>'jatuh_tempo', '')::date,
    coalesce(nullif(p_header->>'status_bayar', ''), 'Belum Lunas'),
    nullif(p_header->>'tanggal_bayar', '')::date,
    nullif(p_header->>'catatan', ''),
    nullif(p_header->>'dibuat_oleh', '')::uuid,
    p_organization_id
  ) returning id into v_id;

  insert into sales_invoice_items (
    invoice_id, product_id, service_id, varian_ukuran, deskripsi,
    qty, harga, subtotal, organization_id
  )
  select
    v_id,
    nullif(x->>'product_id', '')::uuid,
    nullif(x->>'service_id', '')::uuid,
    nullif(x->>'varian_ukuran', ''),
    nullif(btrim(coalesce(x->>'deskripsi', '')), ''),
    (x->>'qty')::numeric,
    (x->>'harga')::numeric,
    (x->>'qty')::numeric * (x->>'harga')::numeric,
    p_organization_id
  from jsonb_array_elements(p_items) x;

  return v_id;
end;
$function$;


-- ============================================================
-- 3. Tabel quotation
-- ============================================================

create table if not exists public.quotations (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  no_quotation       text not null,
  -- Client yang sudah terdaftar, ATAU nama penerima ketikan untuk
  -- calon client yang belum punya baris di master Clients.
  client_id          uuid references public.clients(id) on delete set null,
  nama_penerima      text,
  -- Nama orang yang dituju (UP / Attn).
  up                 text,
  perihal            text,
  tanggal            date not null,
  berlaku_sampai     date,
  -- Draft / Terkirim / Diterima / Ditolak. "Kedaluwarsa" sengaja TIDAK
  -- disimpan: dihitung dari berlaku_sampai, jadi tidak butuh job yang
  -- mengubah status tiap malam.
  status             text not null default 'Draft'
                     check (status in ('Draft', 'Terkirim', 'Diterima', 'Ditolak')),
  diskon_percent     numeric not null default 0,
  pakai_tax          boolean not null default false,
  -- Aturan pajak saat quotation disimpan, dibekukan seperti invoice.
  tax_mode           text not null default 'Exclude',
  tax_percent        numeric not null default 0,
  tax_dpp_nilai_lain boolean not null default true,
  subtotal           numeric not null default 0,
  total              numeric not null default 0,
  -- Syarat & ketentuan yang ikut tercetak (pembayaran, lead time, MOQ).
  syarat             text,
  -- Proforma yang lahir dari quotation ini. Kalau Proforma-nya
  -- dibatalkan, kolom ini kembali null dan quotation bisa diterbitkan
  -- ulang.
  invoice_id         uuid references public.sales_invoices(id) on delete set null,
  dibuat_oleh        uuid,
  created_at         timestamptz not null default now()
);

create unique index if not exists quotations_no_uniq
  on public.quotations (organization_id, no_quotation);

create index if not exists quotations_org_tanggal_idx
  on public.quotations (organization_id, tanggal desc);

-- Satu Proforma cuma boleh lahir dari satu quotation.
create unique index if not exists quotations_invoice_uniq
  on public.quotations (invoice_id)
  where invoice_id is not null;

create table if not exists public.quotation_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quotation_id    uuid not null references public.quotations(id) on delete cascade,
  urutan          int not null default 0,
  deskripsi       text not null,
  -- Rincian tambahan yang ikut tercetak di bawah deskripsi (spesifikasi
  -- kemasan, isi kit, dsb.). Tidak ikut turun ke Proforma: di sana
  -- barisnya cuma satu kalimat.
  keterangan      text,
  satuan          text,
  qty             numeric not null,
  harga           numeric not null,
  subtotal        numeric not null
);

create index if not exists quotation_items_quotation_idx
  on public.quotation_items (quotation_id);


-- ============================================================
-- 4. Row Level Security + grant Data API
-- ============================================================

alter table public.quotations      enable row level security;
alter table public.quotation_items enable row level security;

-- Sejak 30 Oktober 2026 Supabase tidak lagi memberi grant otomatis ke
-- tabel baru di schema public. `anon` sengaja tidak diberi apa pun.
grant select, insert, update, delete on public.quotations to authenticated;
grant select, insert, update, delete on public.quotations to service_role;
grant select, insert, update, delete on public.quotation_items to authenticated;
grant select, insert, update, delete on public.quotation_items to service_role;

drop policy if exists quotations_org on public.quotations;
create policy quotations_org on public.quotations
  for all to authenticated
  using (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  )
  with check (
    is_authenticated_active()
    and (is_super_admin() or organization_id = current_user_org())
  );

drop policy if exists quotation_items_org on public.quotation_items;
create policy quotation_items_org on public.quotation_items
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
-- 5. save_quotation_tx
--
-- Buat quotation baru (p_quotation_id null, + penomoran) atau ganti
-- header & SELURUH barisnya. Polanya sama dengan update_po_tx.
--
-- Totalnya dihitung ulang di sini lewat invoice_tax_calc dengan aturan
-- pajak yang dikirim server action (yang membacanya sendiri dari
-- Settings), bukan dipercaya dari angka total kiriman layar.
-- ============================================================
create or replace function public.save_quotation_tx(
  p_organization_id uuid,
  p_quotation_id    uuid,     -- null = dokumen baru
  p_header          jsonb,
  p_items           jsonb,    -- [{deskripsi, keterangan, satuan, qty, harga}]
  p_dibuat_oleh     uuid
) returns uuid
language plpgsql
as $$
declare
  v_prefix   text;
  v_seq      int;
  v_id       uuid;
  v_tanggal  date;
  v_berlaku  date;
  v_status   text;
  v_invoice  uuid;
  v_jumlah   int;
  v_subtotal numeric;
  v_diskon   numeric;
  v_pakai    boolean;
  v_mode     text;
  v_tarif    numeric;
  v_nilai    boolean;
  v_calc     jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  v_tanggal := nullif(p_header->>'tanggal', '')::date;
  v_berlaku := nullif(p_header->>'berlaku_sampai', '')::date;

  if v_tanggal is null then
    raise exception 'Tanggal quotation wajib diisi';
  end if;
  if v_berlaku is not null and v_berlaku < v_tanggal then
    raise exception 'Tanggal berlaku tidak boleh sebelum tanggal quotation';
  end if;
  if nullif(p_header->>'client_id', '') is null
     and nullif(btrim(coalesce(p_header->>'nama_penerima', '')), '') is null then
    raise exception 'Pilih client atau isi nama penerima';
  end if;

  select count(*) into v_jumlah
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) r
  where nullif(btrim(coalesce(r->>'deskripsi', '')), '') is not null;

  if v_jumlah = 0 then
    raise exception 'Quotation harus punya minimal satu baris';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) r
    where nullif(btrim(coalesce(r->>'deskripsi', '')), '') is not null
      and (coalesce((r->>'qty')::numeric, 0) <= 0
           or coalesce((r->>'harga')::numeric, 0) < 0)
  ) then
    raise exception 'Tiap baris wajib punya qty lebih dari 0 dan harga tidak negatif';
  end if;

  v_diskon := coalesce((p_header->>'diskon_percent')::numeric, 0);
  if v_diskon < 0 or v_diskon > 100 then
    raise exception 'Diskon harus di antara 0 dan 100%%';
  end if;

  v_pakai := coalesce((p_header->>'pakai_tax')::boolean, false);
  v_mode  := coalesce(nullif(p_header->>'tax_mode', ''), 'Exclude');
  v_tarif := coalesce((p_header->>'tax_percent')::numeric, 0);
  v_nilai := coalesce((p_header->>'tax_dpp_nilai_lain')::boolean, true);

  select coalesce(sum((r->>'qty')::numeric * (r->>'harga')::numeric), 0)
    into v_subtotal
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) r
  where nullif(btrim(coalesce(r->>'deskripsi', '')), '') is not null;

  v_calc := invoice_tax_calc(v_subtotal, v_diskon, v_pakai, v_tarif, v_mode, v_nilai);

  if p_quotation_id is null then
    v_prefix := 'QUO.' || to_char(v_tanggal, 'YYYYMM');
    select coalesce(max(substring(no_quotation from length(v_prefix) + 1)::int), 0)
      into v_seq
    from quotations
    where organization_id = p_organization_id
      and no_quotation like v_prefix || '%'
      and substring(no_quotation from length(v_prefix) + 1) ~ '^\d+$';

    insert into quotations (
      organization_id, no_quotation, client_id, nama_penerima, up, perihal,
      tanggal, berlaku_sampai, status, diskon_percent, pakai_tax, tax_mode,
      tax_percent, tax_dpp_nilai_lain, subtotal, total, syarat, dibuat_oleh
    ) values (
      p_organization_id,
      v_prefix || lpad((v_seq + 1)::text, 3, '0'),
      nullif(p_header->>'client_id', '')::uuid,
      nullif(btrim(coalesce(p_header->>'nama_penerima', '')), ''),
      nullif(btrim(coalesce(p_header->>'up', '')), ''),
      nullif(btrim(coalesce(p_header->>'perihal', '')), ''),
      v_tanggal, v_berlaku, 'Draft',
      v_diskon, v_pakai, v_mode, v_tarif, v_nilai,
      v_subtotal, (v_calc->>'total')::numeric,
      nullif(btrim(coalesce(p_header->>'syarat', '')), ''),
      p_dibuat_oleh
    ) returning id into v_id;
  else
    select status, invoice_id into v_status, v_invoice
    from quotations
    where id = p_quotation_id and organization_id = p_organization_id
    for update;

    if not found then
      raise exception 'Quotation tidak ditemukan';
    end if;

    -- Angka yang sudah jadi Proforma adalah angka yang ditagihkan.
    -- Menyuntingnya sesudah itu membuat quotation dan tagihannya
    -- menunjuk dua harga berbeda untuk kesepakatan yang sama.
    if v_invoice is not null then
      raise exception 'Quotation ini sudah diterbitkan jadi Proforma. Batalkan Proforma-nya dulu kalau isinya mau diubah.';
    end if;
    if v_status in ('Diterima', 'Ditolak') then
      raise exception 'Quotation berstatus % tidak bisa disunting. Kembalikan statusnya ke Terkirim dulu.', v_status;
    end if;

    update quotations set
      client_id          = nullif(p_header->>'client_id', '')::uuid,
      nama_penerima      = nullif(btrim(coalesce(p_header->>'nama_penerima', '')), ''),
      up                 = nullif(btrim(coalesce(p_header->>'up', '')), ''),
      perihal            = nullif(btrim(coalesce(p_header->>'perihal', '')), ''),
      tanggal            = v_tanggal,
      berlaku_sampai     = v_berlaku,
      diskon_percent     = v_diskon,
      pakai_tax          = v_pakai,
      tax_mode           = v_mode,
      tax_percent        = v_tarif,
      tax_dpp_nilai_lain = v_nilai,
      subtotal           = v_subtotal,
      total              = (v_calc->>'total')::numeric,
      syarat             = nullif(btrim(coalesce(p_header->>'syarat', '')), '')
    where id = p_quotation_id and organization_id = p_organization_id;

    v_id := p_quotation_id;
    delete from quotation_items where quotation_id = v_id;
  end if;

  insert into quotation_items (
    organization_id, quotation_id, urutan, deskripsi, keterangan, satuan,
    qty, harga, subtotal
  )
  select
    p_organization_id,
    v_id,
    (r.ord - 1)::int,
    btrim(r.val->>'deskripsi'),
    nullif(btrim(coalesce(r.val->>'keterangan', '')), ''),
    nullif(btrim(coalesce(r.val->>'satuan', '')), ''),
    (r.val->>'qty')::numeric,
    (r.val->>'harga')::numeric,
    (r.val->>'qty')::numeric * (r.val->>'harga')::numeric
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality r(val, ord)
  where nullif(btrim(coalesce(r.val->>'deskripsi', '')), '') is not null;

  return v_id;
end;
$$;


-- ============================================================
-- 6. issue_quotation_proforma_tx
--
-- Quotation jadi Proforma dalam satu transaksi: invoice terbit lewat
-- create_sales_invoice_tx (penomoran INV tidak disalin, lock-nya
-- re-entrant), quotation ditautkan ke invoice itu dan ditandai
-- Diterima. Gagal di langkah mana pun = tidak ada yang tertulis.
--
-- Aturan pajaknya harus SAMA dengan yang berlaku sekarang. Invoice
-- membekukan model pajak perusahaan saat terbit (trigger
-- set_invoice_tax_mode), jadi quotation yang disimpan dengan aturan
-- lama akan menghasilkan Proforma bertotal berbeda dari angka yang
-- sudah dijanjikan ke client. Daripada diam-diam bergeser, ditolak
-- dengan kalimat yang menyebut jalan keluarnya.
-- ============================================================
create or replace function public.issue_quotation_proforma_tx(
  p_organization_id uuid,
  p_quotation_id    uuid,
  p_tanggal         date,
  p_top_days        int,
  p_catatan         text,
  p_dibuat_oleh     uuid
) returns uuid
language plpgsql
as $$
declare
  q          quotations%rowtype;
  v_mode     text;
  v_nilai    boolean;
  v_tarif    numeric;
  v_calc     jsonb;
  v_items    jsonb;
  v_inv      uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_tanggal is null then
    raise exception 'Tanggal Proforma wajib diisi';
  end if;
  if p_top_days is not null and p_top_days < 0 then
    raise exception 'TOP tidak boleh negatif';
  end if;

  select * into q
  from quotations
  where id = p_quotation_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Quotation tidak ditemukan';
  end if;
  if q.invoice_id is not null then
    raise exception 'Quotation ini sudah diterbitkan jadi Proforma';
  end if;
  if q.status = 'Ditolak' then
    raise exception 'Quotation yang ditolak tidak bisa diterbitkan. Ubah statusnya dulu kalau client berubah pikiran.';
  end if;

  if q.pakai_tax then
    v_mode  := org_tax_mode(p_organization_id);
    v_nilai := org_tax_dpp_nilai_lain(p_organization_id);
    select coalesce(
      (select tax_percent from organization_settings
        where organization_id = p_organization_id),
      12
    ) into v_tarif;

    if v_mode <> q.tax_mode
       or v_nilai <> q.tax_dpp_nilai_lain
       or v_tarif <> q.tax_percent then
      raise exception 'Pengaturan pajak perusahaan sudah berubah sejak quotation ini disimpan, jadi totalnya akan berbeda dari yang ditawarkan. Buka Edit, cek angkanya, lalu simpan ulang sebelum menerbitkan Proforma.';
    end if;
  else
    v_tarif := q.tax_percent;
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'product_id',    null,
             'service_id',    null,
             'deskripsi',     deskripsi,
             'varian_ukuran', satuan,
             'qty',           qty,
             'harga',         harga
           ) order by urutan
         ), '[]'::jsonb)
    into v_items
  from quotation_items
  where quotation_id = q.id;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Quotation ini tidak punya baris';
  end if;

  v_calc := invoice_tax_calc(
    q.subtotal, q.diskon_percent, q.pakai_tax, v_tarif, q.tax_mode, q.tax_dpp_nilai_lain
  );

  v_inv := create_sales_invoice_tx(
    p_organization_id,
    jsonb_build_object(
      'tipe',           'Proforma',
      'sumber',         'Direct',
      'client_id',      q.client_id,
      'nama_pembeli',   coalesce(q.nama_penerima, ''),
      'tanggal',        p_tanggal,
      'diskon_percent', q.diskon_percent,
      'pakai_tax',      q.pakai_tax,
      'tax_percent',    v_tarif,
      'subtotal',       q.subtotal,
      'total',          (v_calc->>'total')::numeric,
      'top_days',       p_top_days,
      'jatuh_tempo',    case when p_top_days is null then null
                             else p_tanggal + p_top_days end,
      'status_bayar',   'Belum Lunas',
      'catatan',        coalesce(btrim(p_catatan), ''),
      'dibuat_oleh',    p_dibuat_oleh
    ),
    v_items
  );

  update quotations
     set invoice_id = v_inv,
         status     = 'Diterima'
   where id = q.id;

  return v_inv;
end;
$$;


-- ============================================================
-- 7. Audit trail
--
-- Header saja, mengikuti aturan di 20260806_activity_logs.sql: baris
-- anak tidak dipantau karena setiap alur yang mengubahnya selalu ikut
-- menyentuh header-nya.
-- ============================================================
drop trigger if exists trg_log_quotations on public.quotations;
create trigger trg_log_quotations
  after insert or update or delete on public.quotations
  for each row execute function public.log_activity('quotations', 'no_quotation', '');
