-- ============================================================
-- Import komposisi INCI material lewat CSV.
--
-- MASALAH YANG DISELESAIKAN
--
-- CSV Material isinya satu baris per material, jadi komposisi INCI
-- (satu material bisa punya banyak INCI, masing-masing dengan
-- persennya) tidak pernah ikut import maupun export. Memindahkan data
-- lewat CSV berarti mengetik ulang seluruh komposisi di form Material,
-- satu material satu kali buka.
--
-- Jalurnya sekarang CSV tersendiri, satu baris per pasangan material
-- dan INCI. Import-nya MENGGANTI seluruh komposisi material yang
-- disebut di file, sama dengan form Material yang juga menyimpan
-- komposisinya utuh. Material yang tidak disebut di file tidak
-- disentuh.
--
-- KENAPA RPC, BUKAN DUA PANGGILAN DARI APLIKASI
--
-- Mengganti berarti hapus lalu sisip. supabase-js tidak punya
-- transaksi, jadi sisip yang gagal sesudah hapus meninggalkan puluhan
-- material yang komposisinya sudah terhapus, dan tidak ada tanda apa
-- pun sampai orang membuka panel INCI produknya.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================

create or replace function public.import_material_inci_tx(
  p_organization_id uuid,
  p_items           jsonb   -- [{material_id, inci_master_id, percentage}]
) returns void
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Tidak ada baris komposisi untuk diimport';
  end if;

  -- coalesce, bukan "is null or ... < 0": urutan evaluasi OR tidak
  -- dijamin, dan cast string kosong ke numeric langsung meledak.
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where coalesce(nullif(x->>'percentage', '')::numeric, -1) not between 0 and 100
  ) then
    raise exception 'Persentase INCI harus antara 0 dan 100';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where not exists (
      select 1 from materials m
      where m.id = (x->>'material_id')::uuid
        and m.organization_id = p_organization_id
    )
  ) then
    raise exception 'Ada material yang tidak terdaftar di organisasi ini';
  end if;

  -- Form Material tidak pernah menyimpan komposisi untuk kemasan
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    join materials m on m.id = (x->>'material_id')::uuid
    where m.kategori = 'Kemasan'
  ) then
    raise exception 'Material kemasan tidak punya komposisi INCI';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where not exists (
      select 1 from inci_master i
      where i.id = (x->>'inci_master_id')::uuid
        and i.organization_id = p_organization_id
    )
  ) then
    raise exception 'Ada INCI yang belum terdaftar di INCI Master organisasi ini';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    group by x->>'material_id', x->>'inci_master_id'
    having count(*) > 1
  ) then
    raise exception 'Ada INCI yang sama diisi lebih dari sekali untuk satu material';
  end if;

  -- Dihapus lewat material_id saja, sama dengan updateMaterial: material
  -- sudah dipastikan milik organisasi ini di atas.
  delete from material_inci
  where material_id in (
    select distinct (x->>'material_id')::uuid
    from jsonb_array_elements(p_items) x
  );

  -- Nama diambil dari INCI Master, bukan dari file, supaya penulisan
  -- huruf besar-kecilnya seragam dengan kamusnya.
  insert into material_inci (
    organization_id, material_id, inci_master_id, inci_name, percentage
  )
  select
    p_organization_id,
    (x->>'material_id')::uuid,
    i.id,
    i.inci_name,
    (x->>'percentage')::numeric
  from jsonb_array_elements(p_items) x
  join inci_master i on i.id = (x->>'inci_master_id')::uuid;
end;
$$;
