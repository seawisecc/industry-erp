-- ============================================================
-- Import formula & varian produk jadi lewat CSV.
--
-- MASALAH YANG DISELESAIKAN
--
-- CSV Products cuma satu baris per produk, jadi formula (banyak bahan
-- per produk) dan varian (banyak ukuran per produk) tidak pernah ikut
-- import maupun export. Memindahkan data berarti mengetik ulang semua
-- formula lewat form Edit Produk, satu produk satu kali buka.
--
-- Jalurnya sekarang dua CSV tersendiri, polanya sama dengan komposisi
-- INCI material (20260826):
--
--   Formula : satu baris per pasangan produk dan bahan. Formula tiap
--             produk yang disebut di file DIGANTI utuh, sama dengan
--             form Produk. Produk yang tidak disebut tidak disentuh.
--   Varian  : satu baris per varian. Cuma MENAMBAH varian baru dan
--             memperbarui yang sudah ada, TIDAK PERNAH menghapus.
--
-- KENAPA VARIAN TIDAK DIGANTI UTUH
--
-- Stok produk jadi menempel pada NAMA variannya (lihat bab "Nama varian
-- adalah kunci stok" di CLAUDE.md). Import yang menghapus varian yang
-- tidak disebut di file akan memutus stoknya dari master tanpa error
-- apa pun, persis kejadian 250 ml -> 220 ml. Menghapus varian tetap
-- lewat form Produk, yang punya penjaganya.
--
-- Yang dijaga di sini: produk yang BELUM punya varian menyimpan
-- stoknya di kunci '-'. Menambah varian pertama ke produk seperti itu
-- membuat stok '-' tidak punya pasangan lagi, jadi ditolak selama
-- stoknya bukan nol, aturan yang sama dengan
-- assertVarianBerstokTidakHilang di products/actions.ts.
--
-- KENAPA FORMULA DIHAPUS & DISISIP PER PRODUK, BUKAN SEKALIGUS
--
-- Trigger audit `log_formula_change` berjalan per PERNYATAAN dan
-- menganggap satu pernyataan menyentuh satu produk saja (dia mengambil
-- product_id lewat LIMIT 1). Satu delete untuk sepuluh produk akan
-- tercatat sebagai perubahan satu produk, dan snapshot formula
-- sembilan lainnya hilang dari audit CPKB.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================

create or replace function public.import_product_formula_tx(
  p_organization_id uuid,
  p_items           jsonb   -- [{product_id, item_id, percentage, fase}]
) returns void
language plpgsql
as $$
declare
  v_pid uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Tidak ada baris formula untuk diimport';
  end if;

  -- coalesce, bukan "is null or ... <= 0": urutan evaluasi OR tidak
  -- dijamin, dan cast string kosong ke numeric langsung meledak.
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where coalesce(nullif(x->>'percentage', '')::numeric, 0) <= 0
  ) then
    raise exception 'Persentase formula harus lebih dari 0';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where not exists (
      select 1 from products p
      where p.id = (x->>'product_id')::uuid
        and p.organization_id = p_organization_id
    )
  ) then
    raise exception 'Ada produk yang tidak terdaftar di organisasi ini';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where not exists (
      select 1 from items i
      where i.id = (x->>'item_id')::uuid
        and i.organization_id = p_organization_id
    )
  ) then
    raise exception 'Ada item bahan yang tidak terdaftar di organisasi ini';
  end if;

  -- Form Produk cuma menawarkan Bahan Baku di tabel formula
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    join items i on i.id = (x->>'item_id')::uuid
    where i.kategori = 'Kemasan'
  ) then
    raise exception 'Item kemasan tidak bisa masuk formula, kemasan diatur per varian';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    group by x->>'product_id', x->>'item_id'
    having count(*) > 1
  ) then
    raise exception 'Ada bahan yang sama diisi lebih dari sekali untuk satu produk';
  end if;

  -- Satu produk satu pasang pernyataan, lihat keterangan di kepala berkas
  for v_pid in
    select distinct (x->>'product_id')::uuid
    from jsonb_array_elements(p_items) x
  loop
    delete from product_formulas where product_id = v_pid;

    insert into product_formulas (
      organization_id, product_id, item_id, percentage, fase
    )
    select
      p_organization_id,
      v_pid,
      (x->>'item_id')::uuid,
      (x->>'percentage')::numeric,
      nullif(trim(coalesce(x->>'fase', '')), '')
    from jsonb_array_elements(p_items) x
    where (x->>'product_id')::uuid = v_pid;
  end loop;
end;
$$;


create or replace function public.import_product_variants_tx(
  p_organization_id uuid,
  p_items           jsonb   -- [{product_id, nama_varian, netto, satuan_netto, harga_jual}]
) returns jsonb           -- {baru, diubah}
language plpgsql
as $$
declare
  x        jsonb;
  v_id     uuid;
  v_pid    uuid;
  v_nama   text;
  v_harga  numeric;
  v_baru   int := 0;
  v_diubah int := 0;
  v_kode   text;
  v_sisa   numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Tidak ada baris varian untuk diimport';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where coalesce(nullif(x->>'netto', '')::numeric, 0) <= 0
  ) then
    raise exception 'Netto varian harus lebih dari 0';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where coalesce(x->>'satuan_netto', '') not in ('g', 'ml')
  ) then
    raise exception 'Satuan netto varian harus g atau ml';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where coalesce(nullif(x->>'harga_jual', '')::numeric, 0) < 0
  ) then
    raise exception 'Harga jual varian tidak boleh negatif';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where not exists (
      select 1 from products p
      where p.id = (x->>'product_id')::uuid
        and p.organization_id = p_organization_id
    )
  ) then
    raise exception 'Ada produk yang tidak terdaftar di organisasi ini';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    group by x->>'product_id', lower(trim(x->>'nama_varian'))
    having count(*) > 1
  ) then
    raise exception 'Ada varian yang sama diisi lebih dari sekali untuk satu produk';
  end if;

  -- Varian pertama untuk produk yang stoknya masih di kunci '-'
  for v_pid in
    select distinct (x->>'product_id')::uuid
    from jsonb_array_elements(p_items) x
  loop
    if not exists (select 1 from product_variants pv where pv.product_id = v_pid) then
      v_sisa := fg_available(p_organization_id, v_pid, '-');
      if abs(coalesce(v_sisa, 0)) > 0.000001 then
        select kode into v_kode from products where id = v_pid;
        raise exception
          'Produk % belum punya varian dan masih punya stok % pcs tanpa varian. Menambah varian lewat import akan memutus stok itu dari master. Tambahkan variannya lewat form Edit Produk, lalu pindahkan stoknya lewat Stock Opname produk jadi.',
          coalesce(v_kode, '(tanpa kode)'), v_sisa;
      end if;
    end if;
  end loop;

  for x in select * from jsonb_array_elements(p_items)
  loop
    v_pid  := (x->>'product_id')::uuid;
    v_nama := trim(x->>'nama_varian');
    v_harga := nullif(x->>'harga_jual', '')::numeric;

    -- Cocokkan lewat nama dulu. Kalau tidak ketemu, lewat netto & satuan:
    -- varian lama yang namanya ditulis dengan gaya lain ("30ml") tetap
    -- terbaca sebagai varian yang sama, bukan varian kembar yang baru.
    select pv.id into v_id
    from product_variants pv
    where pv.product_id = v_pid
      and lower(trim(pv.nama_varian)) = lower(v_nama)
    limit 1;

    if v_id is null then
      select pv.id into v_id
      from product_variants pv
      where pv.product_id = v_pid
        and pv.netto = (x->>'netto')::numeric
        and pv.satuan_netto = x->>'satuan_netto'
      limit 1;
    end if;

    if v_id is null then
      insert into product_variants (
        organization_id, product_id, nama_varian, netto, satuan_netto, harga_jual
      ) values (
        p_organization_id, v_pid, v_nama,
        (x->>'netto')::numeric, x->>'satuan_netto', v_harga
      );
      v_baru := v_baru + 1;
    else
      -- Nama TIDAK diubah: itu kunci stoknya. Harga yang dikosongkan di
      -- file berarti "tidak diubah", bukan "hapus harganya": file varian
      -- yang disusun tanpa kolom harga tidak boleh menghapus seluruh
      -- harga jual diam-diam.
      update product_variants
      set netto        = (x->>'netto')::numeric,
          satuan_netto = x->>'satuan_netto',
          harga_jual   = coalesce(v_harga, harga_jual)
      where id = v_id;
      v_diubah := v_diubah + 1;
    end if;
  end loop;

  return jsonb_build_object('baru', v_baru, 'diubah', v_diubah);
end;
$$;
