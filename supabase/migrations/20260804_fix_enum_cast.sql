-- ============================================================
-- PATCH 20260804 — cast enum pada penulisan kolom status
--
-- Gejala yang diperbaiki:
--   ERROR: column "status" is of type po_status but expression is of
--          type text
-- Muncul saat menyimpan Terima Barang (Purchasing → Receiving).
--
-- Sebabnya CASE yang seluruh cabangnya literal tanpa tipe diselesaikan
-- Postgres jadi `text`, dan text→enum tidak punya assignment cast.
-- Literal telanjang (`set status = 'Selesai'`) tidak kena masalah ini
-- karena literal tanpa tipe langsung dipaksa ke tipe kolom.
--
-- Aman dijalankan berulang: CREATE OR REPLACE, tidak menyentuh tabel
-- maupun data. Tidak ada perubahan signature, jadi tidak perlu
-- menyesuaikan kode aplikasi.
-- ============================================================


-- ------------------------------------------------------------
-- 1. create_receiving_tx — status PO di akhir penerimaan.
--    PENYEBAB ERROR YANG DILAPORKAN.
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- 2. recompute_invoice_status — status bayar invoice.
--    Belum pernah error, tapi polanya persis sama. Dikeraskan lewat
--    variabel %TYPE supaya benar baik kolomnya text maupun enum.
-- ------------------------------------------------------------
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
