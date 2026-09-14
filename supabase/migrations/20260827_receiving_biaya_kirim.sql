-- ============================================================
-- Penerimaan: diskon faktur & biaya kirim
--
-- MASALAH YANG DISELESAIKAN
--
-- Faktur supplier di lapangan punya dua baris yang selama ini tidak
-- punya tempat di sistem: POTONGAN (volume discount, packing discount)
-- dan ONGKOS KIRIM. Keduanya dulu cuma bisa dititipkan ke harga per
-- baris, dan itu salah untuk dua-duanya: ongkir bukan harga barang,
-- dan potongan dokumen tidak selalu bisa dibagi rata ke tiap baris.
--
-- Akibat yang paling mahal bukan angkanya, melainkan PAJAKNYA. Contoh
-- yang dipakai sebagai acuan, faktur Chemarome 2026/13257 (Include):
--
--   5 kg x 568.928         = 2.844.640   <- gross, harga faktur
--   - volume discount           28.446
--   = netto                  2.816.194   <- INI yang kena pajak
--       harga jual ex-tax    2.537.112     (netto / 1,11)
--       DPP (11/12)          2.325.686     Faktur Pajak: 2.325.686
--       PPN 12%                279.082     Faktur Pajak: 279.082
--   + delivery cost             50.000   <- DI LUAR pajak
--   = TOTAL tagihan          2.866.194     Invoice: 2.866.194
--
-- Jadi aturannya dua kalimat, dan dua-duanya harus dijaga:
--
--   1. DISKON mengurangi Dasar Pengenaan Pajak. Di Faktur Pajak dia
--      tercetak sebagai baris "Dikurangi Potongan Harga" tepat di atas
--      DPP. Menaruhnya sesudah pajak akan menghasilkan PPN yang lebih
--      besar daripada yang tercetak di faktur suppliernya.
--   2. BIAYA KIRIM tidak pernah masuk DPP. Dia ditambahkan sesudah PPN,
--      cuma menambah tagihan dan hutang.
--
-- HPP TIDAK IKUT BERGERAK
--
-- purchase_batches.harga_per_unit tetap lahir dari harga per baris
-- (dikeluarkan PPN-nya pada faktur Include), persis seperti sebelum
-- migrasi ini. Diskon dokumen dan biaya kirim berhenti di header
-- faktur, di tagihan supplier, dan di laporan.
--
-- Itu keputusan yang disengaja, bukan pekerjaan yang tertunda. Kalau
-- potongannya memang milik satu barang tertentu, tempatnya di harga
-- baris itu sendiri, dan cara itu sudah ada sejak dulu. Membebankan
-- potongan dokumen ke HPP berarti angka HPP satu batch bergantung pada
-- baris LAIN di faktur yang sama, dan itu menyebar diam-diam ke biaya
-- produksi, margin produk, dan nilai stok.
--
-- CATATAN TENTANG RETUR
--
-- create_purchase_return_tx membandingkan nilai retur dengan
-- total_invoice, yang sekarang ikut memuat biaya kirim. Artinya
-- mengembalikan SELURUH barang tidak menghapus ongkos kirimnya, dan itu
-- memang yang benar di lapangan: kurirnya sudah jalan, ongkosnya tidak
-- ikut pulang.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang. Wajib sesudah 20260822_purchase_tax_mode.sql.
-- ============================================================


-- ============================================================
-- 1. Kolom baru
--
-- Keduanya not null default 0, jadi seluruh faktur lama terbaca sebagai
-- "tanpa diskon, tanpa ongkir" dan tidak ada satu angka pun yang
-- bergerak: total_invoice mereka memang sudah dihitung tanpa keduanya.
-- ============================================================
alter table public.receivings
  add column if not exists diskon numeric not null default 0;

alter table public.receivings
  add column if not exists biaya_kirim numeric not null default 0;

comment on column public.receivings.diskon is
  'Potongan harga di faktur supplier, dalam RUPIAH seperti tertulis di '
  'kertasnya. Mengurangi nilai barang SEBELUM pajak, jadi ikut '
  'mengurangi DPP, persis baris "Dikurangi Potongan Harga" di Faktur '
  'Pajak. Tidak dibebankan ke harga_per_unit batch.';

comment on column public.receivings.biaya_kirim is
  'Ongkos kirim yang ditagihkan supplier di faktur yang sama. '
  'Ditambahkan SESUDAH PPN: menambah tagihan & hutang, tidak pernah '
  'masuk DPP dan tidak dibebankan ke HPP batch.';


-- ============================================================
-- 2. create_receiving_tx: diskon sebelum pajak, ongkir sesudahnya
--
-- Isinya sama dengan 20260822 kecuali blok hitungan dan dua kolom baru
-- di insert header. Cast enum pada status PO tetap dipertahankan, itu
-- perbaikan yang sudah pernah dibayar mahal sekali.
--
-- Tetap SECURITY INVOKER seperti aslinya.
-- ============================================================
create or replace function public.create_receiving_tx(
  p_organization_id uuid,
  p_header          jsonb,   -- {po_id, tanggal_terima, no_invoice, ppn_percent, tax_mode, tax_dpp_nilai_lain, diskon, biaya_kirim, top_days, jatuh_tempo, dibuat_oleh}
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
  v_diskon      numeric := 0;
  v_kirim       numeric := 0;
  v_netto       numeric := 0;
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

  v_diskon := coalesce((p_header->>'diskon')::numeric, 0);
  v_kirim  := coalesce((p_header->>'biaya_kirim')::numeric, 0);

  if v_diskon < 0 or v_kirim < 0 then
    raise exception 'Diskon dan biaya kirim tidak boleh negatif';
  end if;
  if v_diskon > v_subtotal then
    raise exception 'Diskon (%) melebihi nilai barang di faktur (%)',
      v_diskon, v_subtotal;
  end if;

  -- Diskon dokumen mengurangi DASAR PENGENAAN PAJAK, biaya kirim tidak.
  --
  -- Itu bukan tafsir, itu yang tercetak di Faktur Pajak: diskonnya muncul
  -- sebagai baris "Dikurangi Potongan Harga" di atas DPP, sedangkan
  -- ongkos kirim tidak pernah ikut masuk ke sana dan cuma menambah
  -- tagihan di lembar invoice-nya.
  --
  -- Yang diserahkan ke invoice_tax_calc adalah NETTO, bukan subtotal
  -- dengan diskon persen. Sisi pembelian mencatat potongan dalam RUPIAH
  -- seperti yang tertulis di kertas supplier, dan mengubahnya jadi
  -- persen lebih dulu cuma menambah satu pembulatan yang tidak ada di
  -- dokumen aslinya. Cerminan TypeScript-nya hitungTotalPembelian() di
  -- lib/purchaseTax.ts, dua-duanya wajib ikut berubah bersamaan.
  v_netto := v_subtotal - v_diskon;
  v_hasil := invoice_tax_calc(
    v_netto, 0, v_mode <> 'Non', v_tarif, v_mode, v_nilai_lain
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
    subtotal, diskon, biaya_kirim, total_ppn, total_invoice,
    top_days, jatuh_tempo, dibuat_oleh, organization_id
  ) values (
    v_po.id,
    (p_header->>'tanggal_terima')::date,
    v_po.supplier_id,
    v_supplier,
    nullif(p_header->>'no_invoice', ''),
    v_tarif, v_mode, v_nilai_lain,
    v_subtotal,
    v_diskon,
    v_kirim,
    (v_hasil->>'tax')::numeric,
    -- Biaya kirim ditambahkan SESUDAH pajak: dia bagian dari yang harus
    -- dibayar ke supplier, jadi wajib masuk ke tagihan & hutang, tapi
    -- bukan bagian dari nilai barang yang dikenai PPN.
    (v_hasil->>'total')::numeric + v_kirim,
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
