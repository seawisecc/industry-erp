-- ============================================================
-- Pajak sisi PEMBELIAN: modelnya per SUPPLIER, bukan per perusahaan
--
-- Di sisi penjualan, model harga adalah keputusan perusahaan sendiri:
-- satu `organization_settings.tax_mode` berlaku untuk semua invoice.
-- Di sisi pembelian keputusan itu bukan milik kita. Tiap supplier punya
-- kebijakan sendiri, dan tiga-tiganya ada di lapangan:
--
--   Non      supplier non-PKP, fakturnya tidak memuat PPN sama sekali
--   Exclude  harga di faktur belum kena PPN, PPN ditambahkan di bawah
--   Include  harga di faktur sudah final, PPN diurai dari dalamnya
--
-- Contoh Include yang jadi acuan (Amidis Depo Bali, MZI0085):
--
--   10 x 18.000     = 180.000   <- baris item, harga sudah termasuk PPN
--   Total Faktur      180.000   <- tidak bertambah sepeser pun
--   DPP               162.162   <- 180.000 / 1,11
--   PPN                17.838   <- sisanya
--
-- Angka itu keluar persis dari invoice_tax_calc() dengan model Include
-- dan DPP Nilai Lain menyala, rumus yang sama yang dipakai sisi
-- penjualan. Tidak ada rumus baru yang ditulis di migrasi ini, dan
-- memang tidak boleh ada: salinan ketiga adalah cara paling pasti untuk
-- membuat angka di layar berbeda dengan angka yang dihitung ulang di
-- database.
--
-- Yang ditambahkan migrasi ini:
--   1. suppliers.tax_mode          model bawaan per supplier
--   2. purchase_orders             model DIBEKUKAN per dokumen
--   3. receivings                  model DIBEKUKAN per dokumen
--   4. purchase_batches.harga_faktur  harga di kertas supplier
--   5. sync_supplier_tax_mode      bawaan supplier belajar dari dokumen
--   6. update_po_tx                ikut menulis kolom pajaknya
--   7. create_receiving_tx         total lewat invoice_tax_calc, HPP ex-tax
--   8. create_purchase_return_tx   nilai retur ikut model fakturnya
--
-- Urutan deploy tetap: SQL dulu, baru aplikasi.
-- ============================================================


-- ============================================================
-- 1. Model bawaan per supplier
--
-- Null artinya belum pernah diketahui, dan itu dibedakan dari 'Non'
-- dengan sengaja: 'Non' adalah pernyataan bahwa supplier ini memang
-- tidak memungut PPN, sedangkan null cuma berarti belum ada dokumen
-- yang memberitahu. Yang pertama tidak boleh ditimpa oleh tebakan.
-- ============================================================
alter table public.suppliers
  add column if not exists tax_mode text;

do $$
begin
  alter table public.suppliers
    add constraint suppliers_tax_mode_check
    check (tax_mode is null or tax_mode in ('Non', 'Exclude', 'Include'));
exception
  when duplicate_object then null;
end $$;

comment on column public.suppliers.tax_mode is
  'Model pajak faktur supplier ini: Non (tanpa PPN), Exclude (PPN '
  'ditambahkan di bawah harga), Include (harga sudah termasuk PPN). '
  'Dipakai sebagai bawaan saat membuat PO / penerimaan, dan ikut '
  'diperbarui trigger sync_supplier_tax_mode saat dokumen disimpan. '
  'Null = belum pernah diketahui, form jatuh ke Exclude.';


-- ============================================================
-- 2 & 3. Model DIBEKUKAN per dokumen
--
-- Alasannya sama dengan sales_invoices: bawaan supplier boleh berubah
-- kapan saja, dokumen yang sudah terbit dan sudah dibayar tidak boleh
-- ikut bergeser angkanya. Halaman cetak menghitung ulang rinciannya
-- dari ketiga kolom ini, bukan dari bawaan supplier yang berlaku
-- sekarang.
--
-- Berbeda dengan sales_invoices, kolomnya TIDAK diisi trigger. Di sana
-- invoice lahir dari tiga jalur RPC yang salah satunya bahkan tidak
-- di-track di repo; di sini cuma ada dua jalur (createPO dan
-- create_receiving_tx) dan dua-duanya memang harus memilih modelnya
-- secara sadar. Trigger yang mengisi diam-diam justru menyembunyikan
-- jalur yang lupa bertanya.
--
-- Backfill dokumen lama: ppn_percent 0 berarti memang tanpa pajak,
-- selebihnya Exclude tanpa DPP Nilai Lain (tarifnya waktu itu ditulis
-- 11 dan dikenakan ke harga penuh). Ditulis eksplisit supaya tidak ada
-- satu pun angka yang bergerak sesudah migrasi ini.
-- ============================================================
alter table public.purchase_orders
  add column if not exists tax_mode text;
alter table public.purchase_orders
  add column if not exists tax_dpp_nilai_lain boolean;

alter table public.receivings
  add column if not exists tax_mode text;
alter table public.receivings
  add column if not exists tax_dpp_nilai_lain boolean;

do $$
begin
  alter table public.purchase_orders
    add constraint purchase_orders_tax_mode_check
    check (tax_mode is null or tax_mode in ('Non', 'Exclude', 'Include'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.receivings
    add constraint receivings_tax_mode_check
    check (tax_mode is null or tax_mode in ('Non', 'Exclude', 'Include'));
exception
  when duplicate_object then null;
end $$;

update public.purchase_orders
   set tax_mode = coalesce(
         tax_mode,
         case when coalesce(ppn_percent, 0) = 0 then 'Non' else 'Exclude' end
       ),
       tax_dpp_nilai_lain = coalesce(tax_dpp_nilai_lain, false)
 where tax_mode is null or tax_dpp_nilai_lain is null;

update public.receivings
   set tax_mode = coalesce(
         tax_mode,
         case when coalesce(ppn_percent, 0) = 0 then 'Non' else 'Exclude' end
       ),
       tax_dpp_nilai_lain = coalesce(tax_dpp_nilai_lain, false)
 where tax_mode is null or tax_dpp_nilai_lain is null;

comment on column public.purchase_orders.tax_mode is
  'Model pajak yang berlaku saat PO terbit, dibekukan di sini. '
  'ppn_percent menyimpan TARIF regulasinya (12), tax_dpp_nilai_lain '
  'aturan DPP-nya. Dokumen sebelum 20260822 bertarif 11 tanpa Nilai Lain.';
comment on column public.receivings.tax_mode is
  'Model pajak faktur supplier untuk penerimaan ini, dibekukan di sini. '
  'Include berarti subtotal SUDAH memuat PPN dan total_invoice tidak '
  'bertambah di atasnya.';


-- ============================================================
-- 4. Harga di kertas supplier, terpisah dari HPP
--
-- Pada model Include, harga yang tertulis di faktur memuat PPN di
-- dalamnya. Kalau angka itu dipakai apa adanya sebagai HPP, barang yang
-- sama jadi lebih mahal cuma karena suppliernya menulis fakturnya
-- dengan gaya yang berbeda, padahal uang yang keluar sama saja.
--
-- Karena itu ada dua kolom, dan bedanya harus dijaga:
--
--   harga_faktur    apa yang tertulis di kertas supplier
--   harga_per_unit  HPP, SELALU tanpa pajak
--
-- Pada Non dan Exclude keduanya sama persis. Pada Include,
-- harga_per_unit = harga_faktur / (1 + tarif efektif).
--
-- Yang membaca BIAYA (produksi, pemakaian bahan, nilai stok) tetap
-- memakai harga_per_unit tanpa perlu tahu soal ini. Yang membaca
-- DOKUMEN (baris faktur penerimaan, nilai retur ke supplier, prefill
-- harga di PO berikutnya) memakai harga_faktur, karena angka itulah
-- yang akan dicocokkan orang dengan kertas di tangannya.
-- ============================================================
alter table public.purchase_batches
  add column if not exists harga_faktur numeric;

update public.purchase_batches
   set harga_faktur = harga_per_unit
 where harga_faktur is null;

comment on column public.purchase_batches.harga_faktur is
  'Harga per unit seperti tertulis di faktur supplier. Sama dengan '
  'harga_per_unit kecuali pada faktur Include, yang harga_per_unit-nya '
  'sudah dikeluarkan PPN-nya supaya HPP tetap setara antar supplier.';


-- ============================================================
-- 5. Bawaan supplier belajar dari dokumen yang disimpan
--
-- Tujuannya satu: PO kedua ke supplier yang sama tidak perlu memilih
-- modelnya lagi. Ditulis sebagai trigger, bukan di server action,
-- alasan yang sama dengan audit trail: PO lahir dari dua jalur
-- (insert biasa di createPO dan update_po_tx), penerimaan dari satu
-- jalur lagi, dan jalur yang lupa memanggil helper tidak menimbulkan
-- error apa pun, cuma supplier yang tidak pernah belajar.
--
-- Penerimaan menang atas PO kalau keduanya berbeda, dan itu memang
-- urutannya di lapangan: PO adalah dugaan kita, faktur yang datang
-- bersama barang adalah kenyataannya.
-- ============================================================
create or replace function public.sync_supplier_tax_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tax_mode is null or new.supplier_id is null then
    return null;
  end if;

  update suppliers
     set tax_mode = new.tax_mode
   where id = new.supplier_id
     and organization_id = new.organization_id
     and tax_mode is distinct from new.tax_mode;

  return null;
end;
$$;

comment on function public.sync_supplier_tax_mode() is
  'Menyalin model pajak dokumen ke bawaan suppliernya, supaya dokumen '
  'berikutnya dari supplier yang sama terisi otomatis.';

drop trigger if exists trg_sync_supplier_tax_mode_po on public.purchase_orders;
create trigger trg_sync_supplier_tax_mode_po
  after insert or update of tax_mode, supplier_id on public.purchase_orders
  for each row execute function public.sync_supplier_tax_mode();

drop trigger if exists trg_sync_supplier_tax_mode_rcv on public.receivings;
create trigger trg_sync_supplier_tax_mode_rcv
  after insert on public.receivings
  for each row execute function public.sync_supplier_tax_mode();


-- ============================================================
-- 6. update_po_tx ikut menulis kolom pajaknya
--
-- Isinya sama dengan 20260803 kecuali dua kolom tambahan di UPDATE.
-- Tetap SECURITY INVOKER seperti aslinya.
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
    supplier_id        = (p_header->>'supplier_id')::uuid,
    tanggal_po         = (p_header->>'tanggal_po')::date,
    ppn_percent        = coalesce((p_header->>'ppn_percent')::numeric, 0),
    tax_mode           = coalesce(nullif(p_header->>'tax_mode', ''), tax_mode, 'Exclude'),
    tax_dpp_nilai_lain = coalesce((p_header->>'tax_dpp_nilai_lain')::boolean, tax_dpp_nilai_lain, true),
    catatan            = nullif(p_header->>'catatan', '')
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
-- 7. create_receiving_tx: total lewat invoice_tax_calc, HPP ex-tax
--
-- Isinya sama dengan 20260804 kecuali blok hitungan dan kolom harga
-- batch. Cast enum pada status PO tetap dipertahankan, itu perbaikan
-- yang sudah pernah dibayar mahal sekali.
--
-- Tetap SECURITY INVOKER seperti aslinya.
-- ============================================================
create or replace function public.create_receiving_tx(
  p_organization_id uuid,
  p_header          jsonb,   -- {po_id, tanggal_terima, no_invoice, ppn_percent, tax_mode, tax_dpp_nilai_lain, top_days, jatuh_tempo, dibuat_oleh}
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
  v_mode        text;
  v_nilai_lain  boolean;
  v_tarif       numeric;
  v_efektif     numeric;
  v_pembagi     numeric;
  v_hasil       jsonb;
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

  -- Harga yang dikirim aplikasi adalah harga DI FAKTUR, apa adanya.
  select coalesce(sum((x->>'qty_masuk')::numeric * (x->>'harga_per_unit')::numeric), 0)
    into v_subtotal
  from jsonb_array_elements(p_items) x;

  -- Validasi sisa PO sambil mengunci barisnya. Qty dijumlahkan per baris PO
  -- dulu, kalau satu po_item muncul dua kali, pengecekannya harus melihat
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

  v_mode       := coalesce(nullif(p_header->>'tax_mode', ''), 'Exclude');
  v_nilai_lain := coalesce((p_header->>'tax_dpp_nilai_lain')::boolean, true);
  v_tarif      := coalesce((p_header->>'ppn_percent')::numeric, 0);

  -- Diskon 0: potongan supplier sudah masuk ke harga per baris, tidak ada
  -- kolom diskon dokumen di sisi pembelian.
  v_hasil := invoice_tax_calc(
    v_subtotal, 0, v_mode <> 'Non', v_tarif, v_mode, v_nilai_lain
  );

  -- Pengurai harga faktur -> HPP. Cerminan hargaExTax() di
  -- lib/purchaseTax.ts, dua-duanya wajib ikut berubah bersamaan.
  v_efektif := v_tarif * case when v_nilai_lain then 11::numeric / 12 else 1 end;
  v_pembagi := case
                 when v_mode = 'Include' and 1 + v_efektif / 100 > 0
                   then 1 + v_efektif / 100
                 else 1
               end;

  insert into receivings (
    po_id, tanggal_terima, supplier_id, supplier_nama, no_invoice,
    ppn_percent, tax_mode, tax_dpp_nilai_lain,
    subtotal, total_ppn, total_invoice,
    top_days, jatuh_tempo, dibuat_oleh, organization_id
  ) values (
    v_po.id,
    (p_header->>'tanggal_terima')::date,
    v_po.supplier_id,
    v_supplier,
    nullif(p_header->>'no_invoice', ''),
    v_tarif, v_mode, v_nilai_lain,
    v_subtotal,
    (v_hasil->>'tax')::numeric,
    (v_hasil->>'total')::numeric,
    nullif(p_header->>'top_days', '')::int,
    nullif(p_header->>'jatuh_tempo', '')::date,
    nullif(p_header->>'dibuat_oleh', '')::uuid,
    p_organization_id
  ) returning id into v_receiving;

  -- Batch stok. QC aktif -> masuk karantina dulu (qty_sisa 0).
  -- harga_faktur apa adanya, harga_per_unit sudah tanpa pajak.
  insert into purchase_batches (
    item_id, tanggal_terima, supplier_id, supplier_nama, no_lot_supplier,
    exp_date, qty_masuk, harga_per_unit, harga_faktur,
    qc_status, qty_karantina, qty_sisa,
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
    (x->>'harga_per_unit')::numeric / v_pembagi,
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
  -- tanpa tipe akan diselesaikan jadi `text` dulu, dan text->enum tidak
  -- punya assignment cast, jadi Postgres menolak dengan
  -- "column status is of type po_status but expression is of type text".
  update purchase_orders
    set status = (case when v_belum = 0 then 'Selesai' else 'Diterima Sebagian' end)::po_status
    where id = v_po.id and organization_id = p_organization_id;

  return v_receiving;
end;
$$;


-- ============================================================
-- 8. create_purchase_return_tx: nilai retur ikut model fakturnya
--
-- Dua perubahan dari 20260807, sisanya sama persis:
--
--   - baris retur dinilai dengan harga_faktur, bukan harga_per_unit.
--     Yang dikurangi retur ini adalah TAGIHAN supplier, dan tagihan itu
--     memakai angka di kertasnya. Data lama harga_faktur-nya sudah
--     di-backfill sama dengan harga_per_unit, jadi nilainya tidak
--     bergerak.
--   - totalnya lewat invoice_tax_calc dengan model faktur aslinya.
--     Rumus lama (subtotal * (1 + ppn/100)) benar untuk Exclude tapi
--     akan MENGGELEMBUNGKAN retur atas faktur Include, yang harganya
--     sudah memuat pajak.
--
-- Tetap SECURITY INVOKER seperti aslinya.
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
  v_harga     numeric;
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
         r.total_retur, r.supplier_id, r.supplier_nama,
         coalesce(r.tax_mode, case when coalesce(r.ppn_percent, 0) = 0
                                   then 'Non' else 'Exclude' end) as tax_mode,
         coalesce(r.tax_dpp_nilai_lain, false) as tax_dpp_nilai_lain
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
           pb.harga_per_unit, coalesce(pb.harga_faktur, pb.harga_per_unit) as harga_faktur,
           pb.qc_status, pb.receiving_id, pb.po_id, pb.tanggal_terima
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

    -- Harga di kertas supplier, karena yang dikurangi adalah tagihannya.
    v_harga := coalesce(v_batch.harga_faktur, 0);

    insert into purchase_return_items (
      organization_id, retur_id, purchase_batch_id, item_id,
      qty, qty_dari_karantina, qty_dari_sisa, harga_per_unit, subtotal
    ) values (
      p_organization_id, v_retur, v_batch.id, v_batch.item_id,
      v_it.qty, v_dari_kar, v_dari_sis,
      v_harga,
      v_it.qty * v_harga
    );

    v_subtotal := v_subtotal + v_it.qty * v_harga;
  end loop;

  -- Nilai yang mengurangi tagihan: ikut model pajak faktur aslinya.
  -- Pada Include, subtotal sudah memuat PPN dan totalnya berhenti di situ.
  v_total := (invoice_tax_calc(
    v_subtotal, 0,
    v_rcv.tax_mode <> 'Non',
    coalesce(v_rcv.ppn_percent, 0),
    v_rcv.tax_mode,
    v_rcv.tax_dpp_nilai_lain
  )->>'total')::numeric;

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
