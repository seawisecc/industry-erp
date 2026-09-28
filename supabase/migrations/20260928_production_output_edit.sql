-- ============================================================
-- Betulkan jumlah hasil produksi yang salah input.
--
-- MASALAH YANG DISELESAIKAN
--
-- Menu Edit di Produksi cuma bisa membetulkan nomor batch. Salah ketik
-- qty hasil (mis. 1.000 pcs tertulis 10.000) hanya bisa dibetulkan
-- lewat Batal Produksi lalu Input Hasil ulang, dan jalan itu tertutup
-- begitu ada satu pcs saja dari batch itu yang terjual.
--
-- KENAPA CUKUP MENGUBAH SATU KOLOM
--
-- Dua angka yang bergantung pada qty hasil TIDAK disimpan:
--   - stok produk jadi dihitung dari production_outputs.qty_hasil
--     lewat fg_stock_calc;
--   - HPP per pcs dihitung dari total_cost_bahan / jumlah qty_hasil
--     (lib/margin.ts).
-- Jadi mengubah qty_hasil langsung menggeser keduanya, dan bahan yang
-- sudah dipotong FEFO tidak ikut disentuh. Takaran bahan yang salah
-- tetap lewat Batal Produksi.
--
-- PENJAGA
--
-- Qty yang diturunkan tidak boleh membuat stok produk jadi minus,
-- yaitu keadaan "barangnya sudah terjual padahal menurut catatan
-- baru tidak pernah dibuat". Dicek dengan fg_stock_calc, rumus yang
-- sama dengan penjaga anti-oversell, di bawah advisory lock organisasi
-- yang sama, jadi tidak bisa balapan dengan penjualan yang sedang jalan.
-- Batch yang tidak dihitung ke stok jual (QA Hold / Rejected) dilewati,
-- syaratnya dicerminkan persis dari fg_stock_calc.
--
-- Nomor batch ikut ditulis di transaksi yang sama, di DUA tabelnya
-- (production_batches dan production_plans), supaya dialog yang
-- mengubah keduanya sekaligus tidak meninggalkan setengah perubahan.
--
-- AUDIT
--
-- production_outputs adalah tabel baris anak dan tidak dipantau
-- log_activity. Di alur ini header-nya tidak berubah (kalau cuma qty
-- yang dibetulkan), jadi perubahannya akan lenyap dari audit. Karena
-- itu dipasang trigger khusus UPDATE OF qty_hasil yang mencatat entri
-- atas nama BATCH-nya (dokumen_id & nomor batch), bukan baris output.
-- Insert/delete dari create_production & cancel_production tidak ikut
-- tercatat di sini: keduanya sudah tercatat lewat header batch.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Butuh 20260806_activity_logs (tabel activity_logs) dan
-- 20260811_fg_stock_calc_perf (fg_stock_calc). Aman dijalankan berulang.
-- ============================================================


-- ============================================================
-- 1. RPC
-- ============================================================
create or replace function public.update_production_result_tx(
  p_organization_id uuid,
  p_batch_id        uuid,
  p_no_batch        text,
  p_outputs         jsonb   -- [{varian_ukuran, qty_hasil}]
) returns void
language plpgsql
as $$
declare
  v_qa        text;
  v_no        text := nullif(trim(coalesce(p_no_batch, '')), '');
  v_masuk     boolean;
  r           record;
  v_avail     numeric;
  v_n         int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select pb.qa_status::text into v_qa
  from production_batches pb
  where pb.id = p_batch_id
    and pb.organization_id = p_organization_id;
  if not found then
    raise exception 'Batch produksi tidak ditemukan';
  end if;

  if v_no is null then
    raise exception 'No. batch wajib diisi';
  end if;

  if p_outputs is null or jsonb_array_length(p_outputs) = 0 then
    raise exception 'Tidak ada baris hasil untuk disimpan';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_outputs) x
    where coalesce(nullif(x->>'qty_hasil', '')::numeric, -1) < 0
  ) then
    raise exception 'Qty hasil tidak boleh kosong atau negatif';
  end if;

  if coalesce((
    select sum((x->>'qty_hasil')::numeric) from jsonb_array_elements(p_outputs) x
  ), 0) <= 0 then
    raise exception 'Minimal satu varian dengan hasil lebih dari 0';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_outputs) x
    group by varian_key(x->>'varian_ukuran')
    having count(*) > 1
  ) then
    raise exception 'Ada varian yang diisi lebih dari sekali';
  end if;

  -- Cuma membetulkan baris yang sudah ada. Menambah varian baru berarti
  -- stok lahir di nama yang tidak pernah diproduksi batch ini.
  if exists (
    select 1 from jsonb_array_elements(p_outputs) x
    where not exists (
      select 1 from production_outputs po
      where po.production_batch_id = p_batch_id
        and varian_key(po.varian_ukuran) = varian_key(x->>'varian_ukuran')
    )
  ) then
    raise exception 'Ada varian yang tidak termasuk hasil batch ini';
  end if;

  if exists (
    select 1 from production_outputs po
    where po.production_batch_id = p_batch_id
    group by varian_key(po.varian_ukuran)
    having count(*) > 1
  ) then
    raise exception 'Batch ini punya dua baris hasil untuk varian yang sama, betulkan lewat Batal Produksi';
  end if;

  -- Syarat masuk stok jual, cerminan fg_stock_calc
  v_masuk := v_qa is null or v_qa = 'Released';

  for r in
    select po.product_id, po.varian_ukuran,
           po.qty_hasil::numeric as lama,
           (x->>'qty_hasil')::numeric as baru
    from production_outputs po
    join jsonb_array_elements(p_outputs) x
      on varian_key(x->>'varian_ukuran') = varian_key(po.varian_ukuran)
    where po.production_batch_id = p_batch_id
  loop
    continue when r.baru = r.lama;

    if v_masuk and r.baru < r.lama then
      select coalesce(sum(f.available), 0) into v_avail
      from fg_stock_calc(p_organization_id, r.product_id, r.varian_ukuran) f;

      if v_avail - (r.lama - r.baru) < -0.001 then
        raise exception
          'Hasil % tidak bisa diturunkan dari % ke %: stok produk jadi varian ini tinggal % pcs, sisanya sudah terjual atau dikonsinyasi. Paling rendah % pcs.',
          coalesce(nullif(r.varian_ukuran, ''), 'produk'),
          r.lama,
          r.baru,
          greatest(v_avail, 0),
          r.lama - greatest(v_avail, 0);
      end if;
    end if;

    -- Nilai koreksi dari manusia, bukan hasil hitung stok di aplikasi,
    -- dan organisasinya sudah dikunci lewat advisory lock di atas.
    -- Varian unik per batch sudah dijaga di atas, jadi kuncinya cukup
    -- batch + varian.
    update production_outputs
    set qty_hasil = r.baru
    where production_batch_id = p_batch_id
      and varian_key(varian_ukuran) = varian_key(r.varian_ukuran);

    -- RLS yang menolak diam-diam menghasilkan 0 baris tanpa error, dan
    -- dialognya akan bilang berhasil padahal angkanya tidak bergerak.
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception 'Qty hasil % gagal disimpan, coba muat ulang halaman',
        coalesce(nullif(r.varian_ukuran, ''), 'produk');
    end if;
  end loop;

  update production_batches
  set no_batch_produksi = v_no
  where id = p_batch_id
    and no_batch_produksi is distinct from v_no;

  update production_plans
  set no_batch = v_no
  where production_batch_id = p_batch_id
    and organization_id = p_organization_id
    and no_batch is distinct from v_no;
end;
$$;


-- ============================================================
-- 2. Audit perubahan qty hasil, atas nama batch-nya
-- ============================================================
create or replace function public.log_production_output_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_nama   text;
  v_email  text;
  v_no     text;
  v_label  text;
begin
  if OLD.qty_hasil is not distinct from NEW.qty_hasil then
    return NEW;
  end if;

  select pb.no_batch_produksi into v_no
  from production_batches pb
  where pb.id = NEW.production_batch_id;

  if v_uid is not null then
    select p.nama, p.email into v_nama, v_email
    from profiles p where p.id = v_uid;
  end if;

  v_label := 'Hasil ' || coalesce(nullif(NEW.varian_ukuran, ''), 'produksi');

  insert into activity_logs (
    organization_id, user_id, user_nama, user_email,
    modul, tabel, aksi, dokumen_id, dokumen_no, ringkasan, perubahan
  ) values (
    NEW.organization_id, v_uid,
    coalesce(v_nama, case when v_uid is null then 'Sistem' else 'Pengguna dihapus' end),
    v_email,
    'production', 'production_outputs', 'Ubah',
    NEW.production_batch_id, v_no,
    coalesce(v_no, '?') || ' diubah: ' || lower(v_label),
    jsonb_build_object(
      v_label,
      jsonb_build_object('dari', to_jsonb(OLD.qty_hasil), 'ke', to_jsonb(NEW.qty_hasil))
    )
  );

  return NEW;
end;
$$;

drop trigger if exists trg_log_production_outputs_qty on public.production_outputs;
create trigger trg_log_production_outputs_qty
  after update of qty_hasil on public.production_outputs
  for each row execute function public.log_production_output_change();
