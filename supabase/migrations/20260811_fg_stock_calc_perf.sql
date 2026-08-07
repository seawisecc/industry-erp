-- ============================================================
-- fg_stock_calc: filter produk didorong masuk ke tiap sumber.
--
-- MASALAHNYA
--
-- Di versi 20260810 filter p_product_id ditulis di luar union:
--
--   from sumber s
--   where (p_product_id is null or s.product_id = p_product_id)
--
-- Untuk get_finished_stock (tanpa filter) itu tidak masalah, memang
-- seluruh organisasi yang diminta. Tapi fg_available memanggilnya dengan
-- SATU produk, dan tetap harus membaca seluruh riwayat produksi,
-- konsinyasi, dan penjualan organisasi dulu sebelum menyaring satu baris.
--
-- fg_available dipanggil sekali per BARIS invoice. Invoice 10 baris =
-- 10 kali pemindaian penuh. Sekarang belum terasa; pada organisasi dengan
-- puluhan ribu baris penjualan, itu jadi penyebab lambat yang paling
-- tidak kelihatan asalnya.
--
-- YANG DIUBAH
--
-- Rumusnya TIDAK berubah sama sekali, jadi angkanya tidak boleh bergeser.
-- Yang berubah cuma letak filternya: dari sesudah union jadi di dalam
-- tiap cabang, plus index yang membuatnya bisa dipakai.
--
-- get_finished_stock dan fg_available tidak perlu disentuh: keduanya
-- cuma membungkus fungsi ini.
--
-- Aman dijalankan berulang, dan aman dijalankan tanpa downtime.
-- ============================================================


-- ============================================================
-- 1. Index pendukung
--
-- Tanpa ini filter yang didorong masuk tetap berupa pemindaian penuh,
-- cuma lebih awal menyaringnya.
-- ============================================================

create index if not exists production_outputs_org_product_idx
  on public.production_outputs (organization_id, product_id);

create index if not exists consignment_items_org_product_idx
  on public.consignment_items (organization_id, product_id);

-- Parsial: baris jasa punya product_id null dan tidak pernah dicari
-- lewat index ini.
create index if not exists sales_invoice_items_org_product_idx
  on public.sales_invoice_items (organization_id, product_id)
  where product_id is not null;


-- ============================================================
-- 2. fg_stock_calc
-- ============================================================
create or replace function public.fg_stock_calc(
  p_org        uuid,
  p_product_id uuid default null,
  p_varian     text default null
) returns table (
  product_id uuid,
  varian     text,
  produced   numeric,
  consigned  numeric,
  sold       numeric,
  adjustment numeric,
  available  numeric
)
language sql
stable
as $$
  with sumber as (
    -- Produksi. Batch yang ditahan/ditolak QA tidak pernah masuk stok jual;
    -- qa_status null = batch lama atau QA nonaktif, tetap dihitung.
    select
      po.product_id,
      varian_key(po.varian_ukuran)         as varian,
      po.qty_hasil::numeric                as produced,
      0::numeric                           as consigned,
      0::numeric                           as sold,
      0::numeric                           as adjustment
    from production_outputs po
    join production_batches pb on pb.id = po.production_batch_id
    where po.organization_id = p_org
      and (p_product_id is null or po.product_id = p_product_id)
      and (p_varian is null or varian_key(po.varian_ukuran) = varian_key(p_varian))
      and (pb.qa_status is null or pb.qa_status::text = 'Released')

    union all

    -- Konsinyasi: yang keluar adalah kirim dikurangi retur. Penjualan DARI
    -- konsinyasi tidak mengurangi lagi, barangnya sudah keluar saat dikirim.
    select
      ci.product_id,
      varian_key(ci.varian_ukuran),
      0, ci.qty_kirim::numeric - ci.qty_retur::numeric, 0, 0
    from consignment_items ci
    where ci.organization_id = p_org
      and (p_product_id is null or ci.product_id = p_product_id)
      and (p_varian is null or varian_key(ci.varian_ukuran) = varian_key(p_varian))

    union all

    -- Penjualan langsung. Baris jasa (product_id null) tidak punya stok.
    select
      sii.product_id,
      varian_key(sii.varian_ukuran),
      0, 0, sii.qty::numeric, 0
    from sales_invoice_items sii
    join sales_invoices si on si.id = sii.invoice_id
    where sii.organization_id = p_org
      and sii.product_id is not null
      and (p_product_id is null or sii.product_id = p_product_id)
      and (p_varian is null or varian_key(sii.varian_ukuran) = varian_key(p_varian))
      and si.sumber in ('Direct', 'POS')

    union all

    -- Koreksi opname / penyesuaian manual.
    select
      fa.product_id,
      varian_key(fa.varian),
      0, 0, 0, fa.qty_delta::numeric
    from finished_goods_adjustments fa
    where fa.organization_id = p_org
      and (p_product_id is null or fa.product_id = p_product_id)
      and (p_varian is null or varian_key(fa.varian) = varian_key(p_varian))
  )
  select
    s.product_id,
    s.varian,
    sum(s.produced)                                                   as produced,
    sum(s.consigned)                                                  as consigned,
    sum(s.sold)                                                       as sold,
    sum(s.adjustment)                                                 as adjustment,
    sum(s.produced) - sum(s.consigned) - sum(s.sold) + sum(s.adjustment) as available
  from sumber s
  group by s.product_id, s.varian;
$$;
