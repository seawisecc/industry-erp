-- ============================================================
-- Lembar opname produk jadi berhenti memuat varian yatim yang
-- stoknya nol.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
--
-- Masalahnya. Cakupan baris produk jadi di create_stock_opname_tx
-- adalah master produk+varian yang aktif DITAMBAH seluruh kombinasi
-- yang muncul di fg_stock_calc. Cabang kedua itu ada supaya barang
-- yang varian-nya sudah dihapus dari master tetap ikut dihitung,
-- karena barangnya memang masih ada di gudang.
--
-- Yang tidak diperhitungkan: opname yang MEMINDAHKAN stok ke nama
-- varian baru meninggalkan sepasang koreksi di nama lama (+462 waktu
-- stok awal dicatat, -462 waktu dipindahkan). Nama lama itu tetap
-- punya baris di fg_stock_calc walau jumlahnya nol di semua kolom,
-- jadi dia ikut tercetak di lembar hitung berikutnya sebagai baris
-- tanpa harga yang namanya mirip dengan varian yang benar. Di DNAlab
-- itu tujuh baris, dan lembar hitung dipakai orang sambil memegang
-- barang: dua baris "250 ml" dan "220 ml" untuk produk yang sama
-- adalah undangan salah tulis, dan salah tulisnya baru ketahuan
-- sesudah opname ditutup dan koreksinya terlanjur jadi stok.
--
-- Syaratnya `available <> 0`, bukan "seluruh kolom nol" seperti di
-- layar Finished Goods, karena lembar opname menjawab pertanyaan yang
-- berbeda: bukan "apa riwayatnya" melainkan "apa yang harus dihitung
-- di gudang". Varian yatim yang stoknya belum nol TETAP ikut, termasuk
-- yang minus, karena itu justru barang yang perlu diluruskan.
--
-- Opname yang sudah ada tidak disentuh sama sekali. Semuanya berstatus
-- Selesai dan itu dokumen audit; barisnya adalah potret stok pada hari
-- itu, bukan daftar yang boleh dirapikan belakangan.
--
-- Selebihnya fungsi ini SAMA PERSIS dengan versi di
-- 20260810_finished_goods_opname.sql. Fungsinya tidak security definer
-- dan tidak punya proconfig, jadi create or replace di sini tidak
-- menghilangkan atribut apa pun (lihat bab Jebakan Postgres di
-- CLAUDE.md).
-- ============================================================


create or replace function public.create_stock_opname_tx(
  p_organization_id uuid,
  p_tanggal         date,
  p_kategori        text,    -- null = seluruh golongan
  p_catatan         text,
  p_dibuat_oleh     uuid
) returns uuid
language plpgsql
as $$
declare
  v_prefix text;
  v_seq    int;
  v_no     text;
  v_opname uuid;
  v_bahan  int := 0;
  v_fg     int := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_tanggal is null then
    raise exception 'Tanggal opname wajib diisi';
  end if;

  if p_kategori is not null
     and p_kategori not in ('Bahan Baku', 'Kemasan', 'Produk Jadi') then
    raise exception 'Kategori opname tidak dikenal';
  end if;

  -- Satu opname berjalan pada satu waktu. Dua opname terbuka bersamaan
  -- berarti dua potret stok yang saling menimpa saat ditutup.
  if exists (
    select 1 from stock_opnames
    where organization_id = p_organization_id and status = 'Berjalan'
  ) then
    raise exception 'Masih ada opname yang berjalan. Selesaikan atau batalkan dulu.';
  end if;

  v_prefix := 'OPN.' || to_char(p_tanggal, 'YYYYMM');
  select coalesce(max(substring(no_opname from length(v_prefix) + 1)::int), 0)
    into v_seq
  from stock_opnames
  where organization_id = p_organization_id
    and no_opname like v_prefix || '%'
    and substring(no_opname from length(v_prefix) + 1) ~ '^\d+$';

  v_no := v_prefix || lpad((v_seq + 1)::text, 3, '0');

  insert into stock_opnames (
    organization_id, no_opname, tanggal, kategori, catatan, dibuat_oleh
  ) values (
    p_organization_id, v_no, p_tanggal, p_kategori,
    nullif(trim(coalesce(p_catatan, '')), ''), p_dibuat_oleh
  ) returning id into v_opname;

  -- ---- Baris bahan (Bahan Baku / Kemasan) ----
  if p_kategori is null or p_kategori in ('Bahan Baku', 'Kemasan') then
    insert into stock_opname_items (organization_id, opname_id, item_id, qty_sistem)
    select
      p_organization_id,
      v_opname,
      i.id,
      coalesce((
        select sum(pb.qty_sisa)
        from purchase_batches pb
        where pb.item_id = i.id
          and pb.organization_id = p_organization_id
      ), 0)
    from items i
    where i.organization_id = p_organization_id
      and i.aktif = true
      and (p_kategori is null or i.kategori::text = p_kategori);

    get diagnostics v_bahan = row_count;
  end if;

  -- ---- Baris produk jadi ----
  --
  -- Cakupannya master produk+varian yang aktif, DITAMBAH kombinasi yang
  -- pernah bergerak walau varian-nya sudah dihapus dari master: barangnya
  -- masih ada di gudang dan harus tetap dihitung.
  if p_kategori is null or p_kategori = 'Produk Jadi' then
    insert into stock_opname_items
      (organization_id, opname_id, product_id, varian, qty_sistem)
    with stok as (
      select * from fg_stock_calc(p_organization_id, null, null)
    ),
    master as (
      select pv.product_id, varian_key(pv.nama_varian) as varian
      from product_variants pv
      join products p on p.id = pv.product_id
      where pv.organization_id = p_organization_id
        and p.aktif = true

      union

      select p.id, '-'
      from products p
      where p.organization_id = p_organization_id
        and p.aktif = true
        and not exists (
          select 1 from product_variants pv2 where pv2.product_id = p.id
        )

      union

      -- Varian yang sudah tidak ada di master TAPI stoknya belum nol.
      -- Yang nol tidak ikut: lihat catatan di kepala berkas ini.
      select s.product_id, s.varian
      from stok s
      join products p on p.id = s.product_id
      where p.organization_id = p_organization_id
        and p.aktif = true
        and s.available <> 0
    )
    select
      p_organization_id,
      v_opname,
      m.product_id,
      m.varian,
      coalesce(s.available, 0)
    from master m
    left join stok s
      on s.product_id = m.product_id
     and s.varian = m.varian;

    get diagnostics v_fg = row_count;
  end if;

  if v_bahan + v_fg = 0 then
    raise exception 'Tidak ada item aktif dalam cakupan opname ini';
  end if;

  return v_opname;
end;
$$;
