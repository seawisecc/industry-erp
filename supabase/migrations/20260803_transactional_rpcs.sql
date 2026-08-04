-- ============================================================
-- Transaksi atomik untuk alur yang sebelumnya dijahit di JS.
--
-- MASALAH YANG DIPERBAIKI
--
-- 1) Tidak atomik. Contoh terparah, reportOutletSale: stok konsinyasi
--    dipotong DULU lewat beberapa UPDATE terpisah, invoice dibuat
--    SESUDAHNYA. Kalau pembuatan invoice gagal, stok sudah hilang
--    tanpa dokumen apa pun dan tidak ada yang mengembalikan.
--    Kebalikannya di reportConsignmentSale: invoice dibuat dulu,
--    qty_terjual di-update belakangan — gagal di tengah loop berarti
--    barang bisa terjual dua kali.
--
-- 2) Lost update. Pola "baca qty di JS → tambah → tulis balik" pada
--    qty_terjual / qty_retur / qty_diterima. Dua request bersamaan
--    membaca angka yang sama, yang menulis terakhir menang, satu
--    transaksi hilang diam-diam.
--
-- CARA PERBAIKANNYA
--
-- Semua fungsi di bawah mengambil pg_advisory_xact_lock yang SAMA
-- dengan create_sales_invoice_tx / create_consignment_tx, yaitu
-- hashtextextended(organization_id). Advisory lock bersifat re-entrant
-- dalam satu transaksi, jadi fungsi ini aman memanggil
-- create_sales_invoice_tx di dalamnya — penomoran invoice tidak perlu
-- diduplikasi di sini.
--
-- Semua UPDATE qty ditulis sebagai `qty = qty + n` (bukan hasil hitung
-- dari JS) dan barisnya dikunci FOR UPDATE, jadi tidak ada lost update.
--
-- Aman dijalankan ulang (CREATE OR REPLACE), tidak mengubah tabel.
-- ============================================================


-- Samakan cara membandingkan varian dengan sisi aplikasi:
-- null, string kosong, dan '-' dianggap varian yang sama.
create or replace function public.varian_key(v text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(trim(coalesce(v, '')), ''), '-');
$$;


-- ============================================================
-- Potong stok konsinyasi di sebuah outlet secara FIFO
-- (pengiriman tertua dulu), mengembalikan harga_jual rujukan.
-- Dipakai bersama oleh laku & retur.
-- ============================================================
create or replace function public.consignment_take(
  p_organization_id uuid,
  p_client_id       uuid,
  p_product_id      uuid,
  p_varian          text,
  p_qty             numeric,
  p_field           text          -- 'qty_terjual' | 'qty_retur'
) returns numeric                  -- harga_jual pengiriman terkait
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

    v_needed := v_needed - v_take;
  end loop;

  if v_needed > 0.001 then
    raise exception 'Gagal mendistribusikan qty, sisa % belum teralokasi', v_needed;
  end if;

  return v_harga;
end;
$$;


-- ============================================================
-- Laku di outlet: potong stok + terbitkan Proforma, satu transaksi.
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
  v_harga     numeric;
  v_items     jsonb := '[]'::jsonb;
  v_subtotal  numeric := 0;
  v_diskon    numeric;
  v_dpp       numeric;
  v_tax       numeric;
  v_total     numeric;
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
    -- di-rollback termasuk invoice — tidak ada lagi stok hilang tanpa dokumen.
    v_harga := consignment_take(
      p_organization_id, p_client_id, v_line.product_id,
      v_line.varian, v_line.qty, 'qty_terjual');

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

  -- Sama persis dengan computeTotals() di lib/invoiceMath.ts
  v_diskon := v_subtotal * coalesce((p_opts->>'diskon_percent')::numeric, 0) / 100;
  v_dpp    := v_subtotal - v_diskon;
  v_tax    := case when coalesce((p_opts->>'pakai_tax')::boolean, false)
                   then v_dpp * coalesce((p_opts->>'tax_percent')::numeric, 0) / 100
                   else 0 end;
  v_total  := v_dpp + v_tax;

  return create_sales_invoice_tx(
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
      'total',          v_total,
      'top_days',       p_opts->>'top_days',
      'jatuh_tempo',    p_opts->>'jatuh_tempo',
      'dibuat_oleh',    p_opts->>'dibuat_oleh'
    ),
    v_items
  );
end;
$$;


-- ============================================================
-- Retur di outlet: barang kembali ke stok produk jadi.
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
    perform consignment_take(
      p_organization_id, p_client_id, v_line.product_id,
      v_line.varian, v_line.qty, 'qty_retur');
  end loop;
end;
$$;


-- ============================================================
-- Laku dari SATU pengiriman konsinyasi (bukan level outlet).
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
  v_subtotal  numeric := 0;
  v_diskon    numeric;
  v_dpp       numeric;
  v_tax       numeric;
  v_total     numeric;
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
  end loop;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Minimal satu item laku';
  end if;

  v_diskon := v_subtotal * coalesce((p_opts->>'diskon_percent')::numeric, 0) / 100;
  v_dpp    := v_subtotal - v_diskon;
  v_tax    := case when coalesce((p_opts->>'pakai_tax')::boolean, false)
                   then v_dpp * coalesce((p_opts->>'tax_percent')::numeric, 0) / 100
                   else 0 end;
  v_total  := v_dpp + v_tax;

  return create_sales_invoice_tx(
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
      'total',          v_total,
      'top_days',       p_opts->>'top_days',
      'jatuh_tempo',    p_opts->>'jatuh_tempo',
      'dibuat_oleh',    p_opts->>'dibuat_oleh'
    ),
    v_items
  );
end;
$$;


-- ============================================================
-- Tutup konsinyasi: sisa yang tidak laku dianggap retur.
-- ============================================================
create or replace function public.close_consignment_tx(
  p_organization_id uuid,
  p_consignment_id  uuid
) returns void
language plpgsql
as $$
declare
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select status into v_status
  from consignments
  where id = p_consignment_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Konsinyasi tidak ditemukan';
  end if;
  if v_status <> 'Aktif' then
    raise exception 'Sudah selesai';
  end if;

  update consignment_items
    set qty_retur = qty_retur + (qty_kirim - qty_terjual - qty_retur)
    where consignment_id = p_consignment_id
      and organization_id = p_organization_id
      and (qty_kirim - qty_terjual - qty_retur) > 0;

  update consignments
    set status = 'Selesai'
    where id = p_consignment_id and organization_id = p_organization_id;
end;
$$;


-- ============================================================
-- Penerimaan barang: header + batch stok + qty_diterima PO +
-- status PO, semuanya sekali jalan.
-- ============================================================
create or replace function public.create_receiving_tx(
  p_organization_id uuid,
  p_header          jsonb,   -- {po_id, tanggal_terima, no_invoice, ppn_percent, top_days, jatuh_tempo, dibuat_oleh}
  p_items           jsonb,   -- [{po_item_id, item_id, qty_masuk, harga_per_unit, no_lot_supplier, exp_date}]
  p_qc_on           boolean
) returns uuid
language plpgsql
as $$
declare
  v_po          record;
  v_it          record;
  v_poi         record;
  v_sisa        numeric;
  v_subtotal    numeric := 0;
  v_ppn         numeric;
  v_receiving   uuid;
  v_supplier    text;
  v_belum       int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu item dengan qty masuk lebih dari 0';
  end if;

  select po.id, po.status, po.supplier_id, s.nama as supplier_nama
    into v_po
  from purchase_orders po
  left join suppliers s on s.id = po.supplier_id
  where po.id = (p_header->>'po_id')::uuid
    and po.organization_id = p_organization_id
  for update of po;

  if not found then
    raise exception 'PO tidak ditemukan';
  end if;
  if v_po.status = 'Selesai' then
    raise exception 'PO ini sudah Selesai, semua barang sudah diterima.';
  end if;
  v_supplier := v_po.supplier_nama;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where (x->>'qty_masuk')::numeric is null or (x->>'qty_masuk')::numeric <= 0
  ) then
    raise exception 'Qty masuk harus lebih dari 0';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where (x->>'harga_per_unit')::numeric < 0
  ) then
    raise exception 'Harga tidak boleh negatif';
  end if;

  select coalesce(sum((x->>'qty_masuk')::numeric * (x->>'harga_per_unit')::numeric), 0)
    into v_subtotal
  from jsonb_array_elements(p_items) x;

  -- Validasi sisa PO sambil mengunci barisnya. Qty dijumlahkan per baris PO
  -- dulu — kalau satu po_item muncul dua kali, pengecekannya harus melihat
  -- total, bukan masing-masing.
  for v_it in
    select (x->>'po_item_id')::uuid as po_item_id,
           sum((x->>'qty_masuk')::numeric) as qty_masuk
    from jsonb_array_elements(p_items) x
    group by 1
  loop
    select id, qty_pesan, qty_diterima into v_poi
    from po_items
    where id = v_it.po_item_id and po_id = v_po.id
    for update;

    if not found then
      raise exception 'Ada baris yang tidak ditemukan di PO';
    end if;

    v_sisa := v_poi.qty_pesan - v_poi.qty_diterima;
    if v_it.qty_masuk > v_sisa then
      raise exception 'Qty masuk melebihi sisa PO (sisa %). Kurangi qty-nya.', v_sisa;
    end if;
  end loop;

  v_ppn := v_subtotal * coalesce((p_header->>'ppn_percent')::numeric, 0) / 100;

  insert into receivings (
    po_id, tanggal_terima, supplier_id, supplier_nama, no_invoice,
    ppn_percent, subtotal, total_ppn, total_invoice,
    top_days, jatuh_tempo, dibuat_oleh, organization_id
  ) values (
    v_po.id,
    (p_header->>'tanggal_terima')::date,
    v_po.supplier_id,
    v_supplier,
    nullif(p_header->>'no_invoice', ''),
    coalesce((p_header->>'ppn_percent')::numeric, 0),
    v_subtotal, v_ppn, v_subtotal + v_ppn,
    nullif(p_header->>'top_days', '')::int,
    nullif(p_header->>'jatuh_tempo', '')::date,
    nullif(p_header->>'dibuat_oleh', '')::uuid,
    p_organization_id
  ) returning id into v_receiving;

  -- Batch stok. QC aktif → masuk karantina dulu (qty_sisa 0).
  insert into purchase_batches (
    item_id, tanggal_terima, supplier_id, supplier_nama, no_lot_supplier,
    exp_date, qty_masuk, harga_per_unit, qc_status, qty_karantina, qty_sisa,
    po_id, receiving_id, dibuat_oleh, organization_id
  )
  select
    (x->>'item_id')::uuid,
    (p_header->>'tanggal_terima')::date,
    v_po.supplier_id,
    v_supplier,
    nullif(x->>'no_lot_supplier', ''),
    nullif(x->>'exp_date', '')::date,
    (x->>'qty_masuk')::numeric,
    (x->>'harga_per_unit')::numeric,
    case when p_qc_on then 'Karantina' else 'Released' end,
    case when p_qc_on then (x->>'qty_masuk')::numeric else 0 end,
    case when p_qc_on then 0 else (x->>'qty_masuk')::numeric end,
    v_po.id,
    v_receiving,
    nullif(p_header->>'dibuat_oleh', '')::uuid,
    p_organization_id
  from jsonb_array_elements(p_items) x;

  -- Increment relatif, bukan nilai hasil hitung di aplikasi
  update po_items pi
    set qty_diterima = pi.qty_diterima + agg.qty
  from (
    select (x->>'po_item_id')::uuid as po_item_id,
           sum((x->>'qty_masuk')::numeric) as qty
    from jsonb_array_elements(p_items) x
    group by 1
  ) agg
  where pi.id = agg.po_item_id
    and pi.po_id = v_po.id;

  select count(*) into v_belum
  from po_items
  where po_id = v_po.id and qty_diterima < qty_pesan;

  -- Cast wajib. Literal telanjang (`set status = 'Selesai'`) otomatis
  -- dipaksa ke tipe kolom, tapi CASE yang seluruh cabangnya literal
  -- tanpa tipe akan diselesaikan jadi `text` dulu — dan text→enum tidak
  -- punya assignment cast, jadi Postgres menolak dengan
  -- "column status is of type po_status but expression is of type text".
  update purchase_orders
    set status = (case when v_belum = 0 then 'Selesai' else 'Diterima Sebagian' end)::po_status
    where id = v_po.id and organization_id = p_organization_id;

  return v_receiving;
end;
$$;


-- ============================================================
-- Ganti seluruh baris item PO (hapus + insert) dalam satu transaksi,
-- supaya tidak pernah ada PO yang kehilangan itemnya.
-- ============================================================
create or replace function public.update_po_tx(
  p_organization_id uuid,
  p_po_id           uuid,
  p_header          jsonb,
  p_items           jsonb
) returns void
language plpgsql
as $$
declare
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select status into v_status
  from purchase_orders
  where id = p_po_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'PO tidak ditemukan';
  end if;
  if v_status <> 'Dibuat' then
    raise exception 'PO ini statusnya "%", hanya PO berstatus "Dibuat" yang bisa diubah/dihapus.', v_status;
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu item harus diisi';
  end if;

  update purchase_orders set
    supplier_id  = (p_header->>'supplier_id')::uuid,
    tanggal_po   = (p_header->>'tanggal_po')::date,
    ppn_percent  = coalesce((p_header->>'ppn_percent')::numeric, 0),
    catatan      = nullif(p_header->>'catatan', '')
  where id = p_po_id and organization_id = p_organization_id;

  delete from po_items where po_id = p_po_id;

  insert into po_items (po_id, item_id, qty_pesan, harga_per_unit, organization_id)
  select
    p_po_id,
    (x->>'item_id')::uuid,
    (x->>'qty_pesan')::numeric,
    (x->>'harga_per_unit')::numeric,
    p_organization_id
  from jsonb_array_elements(p_items) x;
end;
$$;


-- ============================================================
-- Batalkan invoice/proforma: pembayaran, item, lalu header —
-- sekali jalan, tidak bisa berhenti separuh.
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
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select id, sumber into v_inv
  from sales_invoices
  where id = p_invoice_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Dokumen tidak ditemukan';
  end if;
  if v_inv.sumber = 'Konsinyasi' then
    raise exception 'Dokumen dari konsinyasi, batalkan/koreksi lewat menu Consignment.';
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

  delete from sales_payments
    where invoice_id = p_invoice_id and organization_id = p_organization_id;
  delete from sales_invoice_items
    where invoice_id = p_invoice_id and organization_id = p_organization_id;
  delete from sales_invoices
    where id = p_invoice_id and organization_id = p_organization_id;
end;
$$;


-- ============================================================
-- Hitung ulang status bayar sebuah dokumen dari ledger cicilan.
--
-- `tipe` sengaja MONOTON: Proforma naik jadi Invoice begitu lunas,
-- dan sesudah itu tidak pernah turun lagi. Dokumen yang sudah terbit
-- tidak boleh berubah jadi Proforma cuma karena baru dibayar sebagian
-- atau pembayarannya dikoreksi.
-- ============================================================
create or replace function public.recompute_invoice_status(
  p_organization_id uuid,
  p_invoice_id      uuid,
  p_today           date
) returns void
language plpgsql
as $$
declare
  v_total   numeric;
  v_dibayar numeric;
  v_lunas   boolean;
  -- %TYPE, bukan nama tipe yang di-hardcode. Sama seperti status PO,
  -- CASE yang seluruh cabangnya literal jadi `text` dan ditolak kalau
  -- kolomnya enum. Lewat variabel bertipe kolom, assignment-nya pakai
  -- konversi I/O plpgsql sehingga benar baik kolomnya text maupun enum —
  -- termasuk kalau nanti diubah jadi enum.
  v_status  sales_invoices.status_bayar%type;
begin
  select total into v_total
  from sales_invoices
  where id = p_invoice_id and organization_id = p_organization_id;

  if not found then
    return;
  end if;

  select coalesce(sum(jumlah), 0) into v_dibayar
  from sales_payments
  where invoice_id = p_invoice_id and organization_id = p_organization_id;

  v_lunas := v_dibayar >= v_total - 0.5;  -- toleransi pembulatan rupiah
  v_status := case when v_lunas then 'Lunas' else 'Belum Lunas' end;

  -- `tipe` tidak perlu diapa-apakan: salah satu cabang CASE-nya adalah
  -- kolom `tipe` sendiri, jadi CASE-nya sudah beresolusi ke tipe kolom itu
  -- dan literal 'Invoice' ikut dipaksa ke sana.
  update sales_invoices set
    status_bayar  = v_status,
    tanggal_bayar = case when v_lunas then p_today else null end,
    tipe          = case when v_lunas then 'Invoice' else tipe end
  where id = p_invoice_id and organization_id = p_organization_id;
end;
$$;


-- ============================================================
-- Catat pembayaran: cek sisa tagihan + insert + hitung ulang status
-- dalam satu transaksi terkunci, supaya dua pembayaran bersamaan
-- tidak sama-sama lolos pengecekan dan jadi lebih bayar.
-- ============================================================
create or replace function public.record_sales_payment_tx(
  p_organization_id uuid,
  p_invoice_id      uuid,
  p_jumlah          numeric,
  p_tanggal         date,
  p_catatan         text,
  p_dibuat_oleh     uuid,
  p_today           date
) returns void
language plpgsql
as $$
declare
  v_total   numeric;
  v_sudah   numeric;
  v_sisa    numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Jumlah pembayaran harus lebih dari 0';
  end if;

  select total into v_total
  from sales_invoices
  where id = p_invoice_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Dokumen tidak ditemukan';
  end if;

  select coalesce(sum(jumlah), 0) into v_sudah
  from sales_payments
  where invoice_id = p_invoice_id and organization_id = p_organization_id;

  v_sisa := v_total - v_sudah;
  if p_jumlah > v_sisa + 0.5 then
    raise exception 'Melebihi sisa tagihan. Sisa Rp %', round(v_sisa);
  end if;

  insert into sales_payments
    (invoice_id, tanggal, jumlah, catatan, dibuat_oleh, organization_id)
  values
    (p_invoice_id, p_tanggal, p_jumlah, nullif(trim(coalesce(p_catatan, '')), ''),
     p_dibuat_oleh, p_organization_id);

  perform recompute_invoice_status(p_organization_id, p_invoice_id, p_today);
end;
$$;


-- ============================================================
-- Hapus satu cicilan (koreksi), lalu hitung ulang statusnya.
-- ============================================================
create or replace function public.delete_sales_payment_tx(
  p_organization_id uuid,
  p_payment_id      uuid,
  p_today           date
) returns void
language plpgsql
as $$
declare
  v_invoice_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select invoice_id into v_invoice_id
  from sales_payments
  where id = p_payment_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Pembayaran tidak ditemukan';
  end if;

  delete from sales_payments
  where id = p_payment_id and organization_id = p_organization_id;

  perform recompute_invoice_status(p_organization_id, v_invoice_id, p_today);
end;
$$;
