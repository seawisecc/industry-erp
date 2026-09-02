-- ============================================================
-- Batal invoice yang lahir dari konsinyasi
--
-- Sampai sekarang cancel_invoice_tx menolak sumber 'Konsinyasi' dengan
-- pesan "batalkan/koreksi lewat menu Consignment", dan menu itu tidak
-- pernah ada. Jadi salah ketik qty laku cuma bisa dibetulkan lewat SQL.
--
-- Yang menghalangi bukan kebijakan, melainkan data: TIDAK ADA yang
-- mencatat qty sebuah baris invoice diambil dari pengiriman yang mana.
-- report_outlet_sale_tx menyebar FIFO ke beberapa pengiriman sekaligus
-- dan header invoice-nya bahkan tidak memuat consignment_id.
--
-- Menebaknya lewat product+varian salah persis di kasus yang paling
-- mahal: satu produk yang sama dititipkan di dua pengiriman dengan
-- harga_jual berbeda. Qty balik ke pengiriman yang keliru, nilai barang
-- yang masih di outlet jadi ngawur, dan tidak ada error apa pun.
--
-- Polanya sama dengan purchase_return_items.qty_dari_karantina /
-- qty_dari_sisa: simpan ASAL potongannya, supaya pembatalannya bisa
-- mengembalikan qty ke baris yang persis benar.
-- ============================================================


-- ============================================================
-- 1. Catatan asal stok tiap penjualan konsinyasi
--
-- Satu baris invoice bisa berasal dari BEBERAPA pengiriman (FIFO lintas
-- pengiriman di outlet yang sama), jadi hubungannya satu-ke-banyak dan
-- tidak muat sebagai kolom di sales_invoice_items.
-- ============================================================
create table if not exists public.consignment_sale_lines (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  invoice_id          uuid not null
                        references public.sales_invoices(id) on delete cascade,
  consignment_item_id uuid not null
                        references public.consignment_items(id) on delete cascade,
  qty                 numeric not null check (qty > 0),
  created_at          timestamptz not null default now()
);

create index if not exists idx_csl_invoice
  on public.consignment_sale_lines(invoice_id);
create index if not exists idx_csl_item
  on public.consignment_sale_lines(consignment_item_id);
create index if not exists idx_csl_org
  on public.consignment_sale_lines(organization_id);

alter table public.consignment_sale_lines enable row level security;

do $$
begin
  create policy consignment_sale_lines_rw on public.consignment_sale_lines
    using (
      is_authenticated_active()
      and (is_super_admin() or organization_id = current_user_org())
    )
    with check (
      is_authenticated_active()
      and (is_super_admin() or organization_id = current_user_org())
    );
exception
  when duplicate_object then null;
end $$;

comment on table public.consignment_sale_lines is
  'Asal stok tiap penjualan konsinyasi: baris invoice mana mengambil '
  'berapa dari consignment_item mana. Dipakai cancel_invoice_tx untuk '
  'mengembalikan qty ke pengiriman yang persis benar.';


-- ============================================================
-- 2. consignment_take sekarang melaporkan pembagiannya
--
-- Return type-nya berubah dari numeric ke jsonb, jadi harus DROP dulu;
-- create or replace tidak bisa mengganti tipe kembalian. Aslinya
-- SECURITY INVOKER tanpa atribut khusus, jadi tidak ada yang perlu
-- dipasang ulang.
--
-- Dua pemanggilnya (report_outlet_sale_tx, retur_outlet_tx) ikut
-- diperbarui di bawah. retur_outlet_tx memakai `perform`, jadi tipe
-- kembalian apa pun tetap jalan, tapi tetap ditulis ulang supaya
-- pembacanya tidak mengira ada dua versi.
-- ============================================================
drop function if exists public.consignment_take(uuid, uuid, uuid, text, numeric, text);

create function public.consignment_take(
  p_organization_id uuid,
  p_client_id       uuid,
  p_product_id      uuid,
  p_varian          text,
  p_qty             numeric,
  p_field           text          -- 'qty_terjual' | 'qty_retur'
) returns jsonb                    -- {harga, alloc:[{consignment_item_id, qty}]}
language plpgsql
as $$
declare
  v_row       record;
  v_needed    numeric := p_qty;
  v_take      numeric;
  v_sisa      numeric;
  v_total     numeric := 0;
  v_harga     numeric := 0;
  v_nama      text;
  v_alloc     jsonb := '[]'::jsonb;
begin
  if p_field not in ('qty_terjual', 'qty_retur') then
    raise exception 'Kolom % tidak dikenal', p_field;
  end if;

  -- Total sisa di outlet ini untuk produk+varian tsb.
  select coalesce(sum(ci.qty_kirim - ci.qty_terjual - ci.qty_retur), 0)
    into v_total
  from consignment_items ci
  join consignments c on c.id = ci.consignment_id
  where ci.organization_id = p_organization_id
    and c.client_id = p_client_id
    and c.status = 'Aktif'
    and ci.product_id = p_product_id
    and varian_key(ci.varian_ukuran) = varian_key(p_varian);

  if p_qty > v_total + 0.001 then
    select nama_produk into v_nama from products where id = p_product_id;
    raise exception 'Qty % melebihi sisa di outlet (sisa %)',
      coalesce(v_nama, 'produk'), v_total;
  end if;

  for v_row in
    select ci.id, ci.qty_kirim, ci.qty_terjual, ci.qty_retur, ci.harga_jual
    from consignment_items ci
    join consignments c on c.id = ci.consignment_id
    where ci.organization_id = p_organization_id
      and c.client_id = p_client_id
      and c.status = 'Aktif'
      and ci.product_id = p_product_id
      and varian_key(ci.varian_ukuran) = varian_key(p_varian)
    order by c.tanggal_kirim asc, ci.id asc
    for update of ci
  loop
    exit when v_needed <= 0;

    v_sisa := v_row.qty_kirim - v_row.qty_terjual - v_row.qty_retur;
    continue when v_sisa <= 0;

    if v_harga = 0 then
      v_harga := v_row.harga_jual;
    end if;

    v_take := least(v_sisa, v_needed);

    -- Increment relatif, bukan nilai hasil hitung di aplikasi
    if p_field = 'qty_terjual' then
      update consignment_items
        set qty_terjual = qty_terjual + v_take
        where id = v_row.id;
    else
      update consignment_items
        set qty_retur = qty_retur + v_take
        where id = v_row.id;
    end if;

    v_alloc := v_alloc || jsonb_build_object(
      'consignment_item_id', v_row.id,
      'qty',                 v_take
    );

    v_needed := v_needed - v_take;
  end loop;

  if v_needed > 0.001 then
    raise exception 'Gagal mendistribusikan qty, sisa % belum teralokasi', v_needed;
  end if;

  return jsonb_build_object('harga', v_harga, 'alloc', v_alloc);
end;
$$;


-- ============================================================
-- 3. Laku per outlet: ikut menulis asal stoknya
--
-- Isinya sama dengan 20260818 kecuali pemakaian hasil consignment_take
-- dan penulisan consignment_sale_lines di akhir.
-- ============================================================
create or replace function public.report_outlet_sale_tx(
  p_organization_id uuid,
  p_client_id       uuid,
  p_lines           jsonb,   -- [{product_id, varian_ukuran, qty, harga}]
  p_opts            jsonb    -- {diskon_percent, pakai_tax, tax_percent, top_days, tanggal, jatuh_tempo, dibuat_oleh}
) returns uuid
language plpgsql
as $$
declare
  v_line      record;
  v_ambil     jsonb;
  v_harga     numeric;
  v_items     jsonb := '[]'::jsonb;
  v_alloc     jsonb := '[]'::jsonb;
  v_subtotal  numeric := 0;
  v_hasil     jsonb;
  v_invoice   uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Isi minimal satu produk yang laku';
  end if;

  for v_line in
    select (l->>'product_id')::uuid  as product_id,
           nullif(l->>'varian_ukuran', '') as varian,
           (l->>'qty')::numeric      as qty,
           nullif(l->>'harga', '')::numeric as harga
    from jsonb_array_elements(p_lines) l
  loop
    if v_line.qty is null or v_line.qty <= 0 then
      raise exception 'Qty harus lebih dari 0';
    end if;

    -- Potong stok dulu; kalau baris mana pun gagal, seluruh transaksi
    -- di-rollback termasuk invoice, tidak ada lagi stok hilang tanpa dokumen.
    v_ambil := consignment_take(
      p_organization_id, p_client_id, v_line.product_id,
      v_line.varian, v_line.qty, 'qty_terjual');

    v_harga := (v_ambil->>'harga')::numeric;
    v_alloc := v_alloc || (v_ambil->'alloc');

    if v_line.harga is not null and v_line.harga > 0 then
      v_harga := v_line.harga;
    end if;

    v_subtotal := v_subtotal + v_line.qty * coalesce(v_harga, 0);
    v_items := v_items || jsonb_build_object(
      'product_id',    v_line.product_id,
      'varian_ukuran', v_line.varian,
      'qty',           v_line.qty,
      'harga',         coalesce(v_harga, 0)
    );
  end loop;

  v_hasil := invoice_tax_calc(
    v_subtotal,
    coalesce((p_opts->>'diskon_percent')::numeric, 0),
    coalesce((p_opts->>'pakai_tax')::boolean, false),
    coalesce((p_opts->>'tax_percent')::numeric, 0),
    org_tax_mode(p_organization_id),
    org_tax_dpp_nilai_lain(p_organization_id)
  );

  v_invoice := create_sales_invoice_tx(
    p_organization_id,
    jsonb_build_object(
      'tipe',           'Proforma',
      'sumber',         'Konsinyasi',
      'client_id',      p_client_id,
      'tanggal',        p_opts->>'tanggal',
      'diskon_percent', coalesce((p_opts->>'diskon_percent')::numeric, 0),
      'pakai_tax',      coalesce((p_opts->>'pakai_tax')::boolean, false),
      'tax_percent',    coalesce((p_opts->>'tax_percent')::numeric, 0),
      'subtotal',       v_subtotal,
      'total',          (v_hasil->>'total')::numeric,
      'top_days',       p_opts->>'top_days',
      'jatuh_tempo',    p_opts->>'jatuh_tempo',
      'dibuat_oleh',    p_opts->>'dibuat_oleh'
    ),
    v_items
  );

  insert into consignment_sale_lines
    (organization_id, invoice_id, consignment_item_id, qty)
  select p_organization_id, v_invoice,
         (a->>'consignment_item_id')::uuid, (a->>'qty')::numeric
  from jsonb_array_elements(v_alloc) a;

  return v_invoice;
end;
$$;


-- ============================================================
-- 4. Retur per outlet: memakai bentuk kembalian yang baru
-- ============================================================
create or replace function public.retur_outlet_tx(
  p_organization_id uuid,
  p_client_id       uuid,
  p_lines           jsonb
) returns void
language plpgsql
as $$
declare
  v_line record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Isi minimal satu produk yang diretur';
  end if;

  for v_line in
    select (l->>'product_id')::uuid as product_id,
           nullif(l->>'varian_ukuran', '') as varian,
           (l->>'qty')::numeric     as qty
    from jsonb_array_elements(p_lines) l
  loop
    if v_line.qty is null or v_line.qty <= 0 then
      raise exception 'Qty retur harus lebih dari 0';
    end if;
    -- Retur tidak perlu dicatat asalnya: barangnya sudah kembali ke
    -- gudang dan tidak ada dokumen yang bisa dibatalkan sesudahnya.
    perform consignment_take(
      p_organization_id, p_client_id, v_line.product_id,
      v_line.varian, v_line.qty, 'qty_retur');
  end loop;
end;
$$;


-- ============================================================
-- 5. Laku per pengiriman: asalnya sudah pasti, tinggal dicatat
-- ============================================================
create or replace function public.report_consignment_sale_tx(
  p_organization_id uuid,
  p_consignment_id  uuid,
  p_items           jsonb,   -- [{consignment_item_id, qty_laku}]
  p_opts            jsonb
) returns uuid
language plpgsql
as $$
declare
  v_cons      record;
  v_it        record;
  v_ci        record;
  v_sisa      numeric;
  v_items     jsonb := '[]'::jsonb;
  v_alloc     jsonb := '[]'::jsonb;
  v_subtotal  numeric := 0;
  v_hasil     jsonb;
  v_invoice   uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select id, client_id, status into v_cons
  from consignments
  where id = p_consignment_id and organization_id = p_organization_id;

  if not found then
    raise exception 'Konsinyasi tidak ditemukan';
  end if;
  if v_cons.status <> 'Aktif' then
    raise exception 'Konsinyasi sudah selesai';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu item laku';
  end if;

  for v_it in
    select (x->>'consignment_item_id')::uuid as ci_id,
           (x->>'qty_laku')::numeric         as qty
    from jsonb_array_elements(p_items) x
  loop
    if v_it.qty is null or v_it.qty <= 0 then
      continue;
    end if;

    select id, product_id, varian_ukuran, qty_kirim, qty_terjual, qty_retur, harga_jual
      into v_ci
    from consignment_items
    where id = v_it.ci_id
      and consignment_id = p_consignment_id
      and organization_id = p_organization_id
    for update;

    if not found then
      raise exception 'Item konsinyasi tidak ditemukan';
    end if;

    v_sisa := v_ci.qty_kirim - v_ci.qty_terjual - v_ci.qty_retur;
    if v_it.qty > v_sisa then
      raise exception 'Qty laku melebihi sisa di lokasi konsinyasi (sisa % pcs)', v_sisa;
    end if;

    update consignment_items
      set qty_terjual = qty_terjual + v_it.qty
      where id = v_ci.id;

    v_subtotal := v_subtotal + v_it.qty * v_ci.harga_jual;
    v_items := v_items || jsonb_build_object(
      'product_id',    v_ci.product_id,
      'varian_ukuran', v_ci.varian_ukuran,
      'qty',           v_it.qty,
      'harga',         v_ci.harga_jual
    );
    v_alloc := v_alloc || jsonb_build_object(
      'consignment_item_id', v_ci.id,
      'qty',                 v_it.qty
    );
  end loop;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Minimal satu item laku';
  end if;

  v_hasil := invoice_tax_calc(
    v_subtotal,
    coalesce((p_opts->>'diskon_percent')::numeric, 0),
    coalesce((p_opts->>'pakai_tax')::boolean, false),
    coalesce((p_opts->>'tax_percent')::numeric, 0),
    org_tax_mode(p_organization_id),
    org_tax_dpp_nilai_lain(p_organization_id)
  );

  v_invoice := create_sales_invoice_tx(
    p_organization_id,
    jsonb_build_object(
      'tipe',           'Proforma',
      'sumber',         'Konsinyasi',
      'client_id',      v_cons.client_id,
      'consignment_id', p_consignment_id,
      'tanggal',        p_opts->>'tanggal',
      'diskon_percent', coalesce((p_opts->>'diskon_percent')::numeric, 0),
      'pakai_tax',      coalesce((p_opts->>'pakai_tax')::boolean, false),
      'tax_percent',    coalesce((p_opts->>'tax_percent')::numeric, 0),
      'subtotal',       v_subtotal,
      'total',          (v_hasil->>'total')::numeric,
      'top_days',       p_opts->>'top_days',
      'jatuh_tempo',    p_opts->>'jatuh_tempo',
      'dibuat_oleh',    p_opts->>'dibuat_oleh'
    ),
    v_items
  );

  insert into consignment_sale_lines
    (organization_id, invoice_id, consignment_item_id, qty)
  select p_organization_id, v_invoice,
         (a->>'consignment_item_id')::uuid, (a->>'qty')::numeric
  from jsonb_array_elements(v_alloc) a;

  return v_invoice;
end;
$$;


-- ============================================================
-- 6. Batal invoice, sekarang termasuk yang dari konsinyasi
--
-- Dua kondisi, dan pembedaannya bukan kosmetik:
--
--   Pengiriman masih Aktif  -> qty_terjual turun saja. Qty-nya balik
--     jadi sisa di outlet, dan stok produk jadi TIDAK bergerak karena
--     barangnya memang masih ada di outlet (fg_stock_calc menghitung
--     konsinyasi sebagai qty_kirim - qty_retur, qty_terjual tidak ikut).
--
--   Pengiriman sudah Selesai -> qty_terjual turun DAN qty_retur naik.
--     close_consignment_tx sudah mengubah sisa yang tak laku jadi retur,
--     jadi menurunkan qty_terjual saja akan membuat pengiriman yang
--     sudah ditutup punya sisa yang tidak ada barangnya, sekaligus tidak
--     pernah mengembalikan stoknya ke gudang. Barang yang batal laku itu
--     semestinya ikut pulang waktu konsinyasi ditutup, dan itulah yang
--     ditulis di sini.
-- ============================================================
create or replace function public.cancel_invoice_tx(
  p_organization_id uuid,
  p_invoice_id      uuid
) returns void
language plpgsql
as $$
declare
  v_inv       record;
  v_bayar_cli int;
  v_alloc     int;
  v_row       record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select id, sumber into v_inv
  from sales_invoices
  where id = p_invoice_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Dokumen tidak ditemukan';
  end if;

  -- Kas otomatis POS tidak dihitung sebagai pembayaran client
  select count(*) into v_bayar_cli
  from sales_payments
  where invoice_id = p_invoice_id
    and organization_id = p_organization_id
    and coalesce(catatan, '') <> 'Pembayaran tunai (POS)';

  if v_bayar_cli > 0 then
    raise exception 'Sudah ada pembayaran dari client, hapus dulu pembayarannya di Sales Payments.';
  end if;

  if v_inv.sumber = 'Konsinyasi' then
    select count(*) into v_alloc
    from consignment_sale_lines
    where invoice_id = p_invoice_id and organization_id = p_organization_id;

    if v_alloc = 0 then
      raise exception 'Dokumen ini terbit sebelum asal stok konsinyasi dicatat, jadi qty-nya tidak bisa dikembalikan ke pengiriman yang benar. Koreksi lewat Stock Opname produk jadi.';
    end if;

    -- Kunci baris pengirimannya dulu, sejalan dengan RPC laku.
    perform 1
    from consignment_items ci
    where ci.id in (
      select consignment_item_id from consignment_sale_lines
      where invoice_id = p_invoice_id and organization_id = p_organization_id
    )
    for update;

    -- DIJUMLAHKAN per consignment_item, bukan diulang per baris catatan.
    -- Satu invoice boleh punya dua baris produk yang sama dan keduanya
    -- bisa jatuh ke pengiriman yang sama; kalau diproses satu per satu,
    -- pemeriksaan qty putaran kedua memakai angka yang sudah basi.
    for v_row in
      select csl.consignment_item_id      as ci_id,
             sum(csl.qty)                 as qty,
             min(ci.qty_terjual)          as terjual,
             min(c.status::text)          as status
      from consignment_sale_lines csl
      join consignment_items ci on ci.id = csl.consignment_item_id
      join consignments c on c.id = ci.consignment_id
      where csl.invoice_id = p_invoice_id
        and csl.organization_id = p_organization_id
      group by csl.consignment_item_id
    loop
      if v_row.terjual < v_row.qty - 0.001 then
        raise exception 'Qty terjual di pengiriman sudah lebih kecil daripada yang dicatat dokumen ini. Periksa dulu di menu Consignment.';
      end if;

      if v_row.status = 'Aktif' then
        update consignment_items
          set qty_terjual = qty_terjual - v_row.qty
          where id = v_row.ci_id;
      else
        update consignment_items
          set qty_terjual = qty_terjual - v_row.qty,
              qty_retur   = qty_retur + v_row.qty
          where id = v_row.ci_id;
      end if;
    end loop;

    delete from consignment_sale_lines
      where invoice_id = p_invoice_id and organization_id = p_organization_id;
  end if;

  delete from sales_payments
    where invoice_id = p_invoice_id and organization_id = p_organization_id;
  delete from sales_invoice_items
    where invoice_id = p_invoice_id and organization_id = p_organization_id;
  delete from sales_invoices
    where id = p_invoice_id and organization_id = p_organization_id;
end;
$$;


-- ============================================================
-- 7. Backfill asal stok untuk invoice konsinyasi yang sudah terbit
--
-- HANYA yang pasangannya tidak ambigu. Kalau satu baris invoice punya
-- lebih dari satu kandidat consignment_item, SELURUH invoice itu
-- dilewati: setengah catatan asal lebih berbahaya daripada tidak ada,
-- karena pembatalannya akan mengembalikan sebagian qty saja tanpa
-- memberi tahu siapa pun.
--
-- Invoice yang tidak ter-backfill tetap tidak bisa dibatalkan, dan
-- pesan errornya menyebutkan alasannya.
-- ============================================================
do $$
declare
  v_inv       record;
  v_it        record;
  v_ids       uuid[];
  v_alloc     jsonb;
  v_lengkap   boolean;
begin
  for v_inv in
    select si.id, si.organization_id, si.client_id, si.consignment_id
    from sales_invoices si
    where si.sumber = 'Konsinyasi'
      and not exists (
        select 1 from consignment_sale_lines csl where csl.invoice_id = si.id
      )
  loop
    v_alloc := '[]'::jsonb;
    v_lengkap := true;

    for v_it in
      select sii.product_id, sii.varian_ukuran, sii.qty
      from sales_invoice_items sii
      where sii.invoice_id = v_inv.id
        and sii.product_id is not null
    loop
      -- array_agg, bukan min(id): tidak ada agregat min(uuid) di
      -- Postgres, dan yang dibutuhkan di sini memang jumlah kandidatnya
      -- sekaligus id-nya.
      select array_agg(ci.id) into v_ids
      from consignment_items ci
      join consignments c on c.id = ci.consignment_id
      where ci.organization_id = v_inv.organization_id
        and c.client_id = v_inv.client_id
        and ci.product_id = v_it.product_id
        and varian_key(ci.varian_ukuran) = varian_key(v_it.varian_ukuran)
        and ci.qty_terjual >= v_it.qty
        and (v_inv.consignment_id is null
             or ci.consignment_id = v_inv.consignment_id);

      if coalesce(array_length(v_ids, 1), 0) <> 1 then
        v_lengkap := false;
        exit;
      end if;

      v_alloc := v_alloc || jsonb_build_object(
        'consignment_item_id', v_ids[1],
        'qty',                 v_it.qty
      );
    end loop;

    if v_lengkap and jsonb_array_length(v_alloc) > 0 then
      insert into consignment_sale_lines
        (organization_id, invoice_id, consignment_item_id, qty)
      select v_inv.organization_id, v_inv.id,
             (a->>'consignment_item_id')::uuid, (a->>'qty')::numeric
      from jsonb_array_elements(v_alloc) a;
    end if;
  end loop;
end $$;
