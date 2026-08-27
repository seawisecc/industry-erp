-- Kode master harus unik PER ORGANISASI, bukan unik sedunia.
--
-- Gejalanya: import material di company kedua gagal dengan
--   duplicate key value violates unique constraint "materials_material_code_key"
-- padahal company itu belum punya satu material pun. Kodenya bentrok dengan
-- milik company LAIN, karena constraint-nya cuma memakai satu kolom
-- (material_code) tanpa organization_id. Nama constraint tanpa
-- "organization_id" di tengahnya adalah tandanya: Postgres menamai unik
-- otomatis dengan pola <tabel>_<kolom-kolom>_key.
--
-- Blok ini menukar constraint satu kolom itu dengan (organization_id, kolom)
-- untuk tabel master yang punya organization_id. Aman dijalankan berulang:
-- tabel yang unik-nya sudah per-organisasi tidak disentuh.
--
-- Tabel yang di dalam satu organisasi TERNYATA sudah punya kode dobel
-- dilewati dengan notice, bukan membatalkan migrasi. Bersihkan dulu
-- datanya, baru jalankan ulang berkas ini.

do $$
declare
  t            text;
  c            text;
  r            record;
  oid_tabel    oid;
  attnum_kolom smallint;
  nama_baru    text;
  jml_dobel    bigint;
begin
  for t, c in
    select tabel, kolom
    from (values
      ('materials', 'material_code'),
      ('items',     'kode'),
      ('clients',   'kode'),
      ('suppliers', 'kode'),
      ('products',  'kode')
    ) as v(tabel, kolom)
  loop
    oid_tabel := to_regclass(format('public.%I', t));
    if oid_tabel is null then
      continue;
    end if;

    -- Kolomnya, dan organization_id-nya, harus benar-benar ada
    select a.attnum into attnum_kolom
    from pg_attribute a
    where a.attrelid = oid_tabel and a.attname = c and a.attnum > 0 and not a.attisdropped;
    if attnum_kolom is null then
      continue;
    end if;
    if not exists (
      select 1 from pg_attribute a
      where a.attrelid = oid_tabel and a.attname = 'organization_id'
        and a.attnum > 0 and not a.attisdropped
    ) then
      continue;
    end if;

    nama_baru := t || '_org_' || c || '_key';
    if exists (select 1 from pg_constraint where conrelid = oid_tabel and conname = nama_baru) then
      continue;  -- sudah pernah dijalankan
    end if;

    -- Kalau di dalam satu organisasi kodenya sudah dobel, constraint barunya
    -- pasti ditolak. Lewati, jangan sampai yang lama terlanjur dibuang.
    execute format(
      'select count(*) from (select organization_id, %I from public.%I
         where %I is not null
         group by organization_id, %I having count(*) > 1) d',
      c, t, c, c
    ) into jml_dobel;
    if jml_dobel > 0 then
      raise notice '% dilewati: ada % kombinasi (organization_id, %) yang dobel', t, jml_dobel, c;
      continue;
    end if;

    -- Buang constraint unik yang cuma satu kolom itu
    for r in
      select con.conname
      from pg_constraint con
      where con.conrelid = oid_tabel
        and con.contype = 'u'
        and array_length(con.conkey, 1) = 1
        and con.conkey[1] = attnum_kolom
    loop
      execute format('alter table public.%I drop constraint %I', t, r.conname);
      raise notice 'dibuang: %.%', t, r.conname;
    end loop;

    -- Ada juga yang dibuat sebagai unique index lepas, bukan constraint
    for r in
      select i.relname as idxname
      from pg_index x
      join pg_class i on i.oid = x.indexrelid
      where x.indrelid = oid_tabel
        and x.indisunique
        and x.indnatts = 1
        and x.indkey[0] = attnum_kolom
        and not exists (select 1 from pg_constraint con where con.conindid = i.oid)
    loop
      execute format('drop index public.%I', r.idxname);
      raise notice 'dibuang index: %.%', t, r.idxname;
    end loop;

    execute format(
      'alter table public.%I add constraint %I unique (organization_id, %I)',
      t, nama_baru, c
    );
    raise notice 'dipasang: % unique (organization_id, %)', nama_baru, c;
  end loop;
end $$;
