-- ============================================================
-- Urutan daftar Purchase Orders mengikuti ALUR, bukan abjad
--
-- MASALAH YANG DISELESAIKAN
--
-- Daftar PO diurutkan `created_at` menurun, jadi yang menunggu
-- persetujuan berserakan di antara yang sudah selesai. Orang yang
-- membuka halaman itu hampir selalu sedang mencari pekerjaan yang belum
-- beres, dan pekerjaan itu tidak pernah ada di satu tempat.
--
-- KENAPA TIDAK `order by status` SAJA
--
-- Dua-duanya salah, dan dua-duanya diam-diam:
--
--   - Kalau `status` bertipe enum, Postgres mengurutkannya menurut
--     urutan DEKLARASI enum-nya. Urutan itu tidak di-track di repo mana
--     pun, jadi tidak ada satu berkas pun yang bisa dibaca untuk tahu
--     apa yang akan terjadi.
--   - Kalau suatu saat kolomnya jadi text, urutannya jatuh ke ABJAD:
--     Dibatalkan, Dibuat, Dikirim, Diterima Sebagian, Disetujui,
--     Selesai. Kelihatan seperti urutan yang disengaja, padahal PO yang
--     dibatalkan naik ke paling atas.
--
-- PostgREST juga tidak bisa `order by` sebuah ekspresi CASE, jadi
-- urutannya ditulis sebagai KOLOM.
--
-- KENAPA TRIGGER, BUKAN GENERATED COLUMN
--
-- Versi pertama skrip ini memakai `generated always as (case status
-- when 'Dibuat' then 1 ... end) stored`, dan DITOLAK database:
--
--   ERROR 22P02: invalid input value for enum po_status: "Dibatalkan"
--
-- Literal di dalam CASE dipaksa jadi po_status saat migrasi diurai, jadi
-- SATU label yang tidak ada di enum menggagalkan seluruh skrip. Artinya
-- skrip ini cuma jalan kalau penulisnya sudah tahu persis isi enum-nya,
-- padahal definisi tipe itu tidak di-track di repo mana pun. Itu
-- ketergantungan yang sama yang sudah bikin repot di tempat lain.
--
-- Versi ini membandingkan `status::text`, jadi label yang tidak dikenal
-- tidak menggagalkan apa pun, cuma jatuh ke 9 dan berakhir di bawah.
-- Cast itu cuma STABLE, jadi tidak boleh dipakai di generated column,
-- tapi di dalam fungsi trigger dan di UPDATE biasa dia sah.
--
-- Jaminannya sama dengan generated column: trigger BEFORE INSERT OR
-- UPDATE berlaku untuk SEMUA jalur tulis, termasuk update_po_tx dan
-- perubahan manual lewat SQL Editor. Alasan yang sama dengan audit
-- trail yang ditulis trigger, bukan helper yang harus diingat.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================

alter table public.purchase_orders
  add column if not exists status_urut smallint;

comment on column public.purchase_orders.status_urut is
  'Urutan status menurut ALUR pekerjaan (1 Dibuat s/d 6 Dibatalkan), '
  'bukan abjad dan bukan urutan deklarasi enum. Dipakai sebagai urutan '
  'bawaan daftar Purchase Orders supaya yang belum beres selalu di '
  'atas. Diisi trigger, jadi tidak ada jalur tulis yang bisa lupa. '
  'Status tak dikenal jatuh ke 9 dan berakhir di bawah.';


-- ============================================================
-- Satu-satunya tempat urutan itu ditulis
-- ============================================================
create or replace function public.po_status_urut(p_status text)
returns smallint
language sql
immutable
as $$
  select case p_status
    when 'Dibuat'            then 1
    when 'Disetujui'         then 2
    when 'Dikirim'           then 3
    when 'Diterima Sebagian' then 4
    when 'Selesai'           then 5
    when 'Dibatalkan'        then 6
    else 9
  end::smallint;
$$;

comment on function public.po_status_urut(text) is
  'Nomor urut satu status PO menurut alur pekerjaan. Menerima text, '
  'bukan po_status, supaya label yang belum ada di enum tidak bikin '
  'skrip ini gagal diurai.';


create or replace function public.set_po_status_urut()
returns trigger
language plpgsql
as $$
begin
  new.status_urut := public.po_status_urut(new.status::text);
  return new;
end;
$$;

drop trigger if exists trg_po_status_urut on public.purchase_orders;
create trigger trg_po_status_urut
  before insert or update on public.purchase_orders
  for each row execute function public.set_po_status_urut();


-- ============================================================
-- Audit trail berhenti mencatat kolom turunan ini
--
-- `trg_log_purchase_orders` memantau SEMUA kolom (TG_ARGV[2] kosong),
-- jadi tanpa ini backfill di bawah menghasilkan satu entri "Ubah" untuk
-- SETIAP PO, isinya `status_urut: null -> 1`. Sesudah itu pun tiap
-- perubahan status akan tercatat dua kali: sekali sebagai `status`
-- (yang berarti), sekali sebagai `status_urut` (yang cuma turunannya).
--
-- Karena itu kolomnya masuk daftar abaikan, tempat yang sama dengan
-- created_at & updated_at: sama-sama kolom teknis yang perubahannya
-- tidak berarti apa-apa bagi auditor.
--
-- Fungsinya ditulis ULANG UTUH dari 20260806, cuma satu baris yang
-- berubah. `create or replace function` mengembalikan atribut yang
-- tidak disebut ke bawaannya, jadi `security definer` dan
-- `set search_path = public` wajib ikut ditulis lagi, kalau tidak
-- fungsinya diam-diam jadi invoker dan seluruh audit trail berhenti
-- bekerja.
-- ============================================================
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modul     text := TG_ARGV[0];
  v_no_col    text := coalesce(TG_ARGV[1], '');
  v_pantau    text[] := case
                          when coalesce(TG_ARGV[2], '') = '' then null
                          else string_to_array(TG_ARGV[2], ',')
                        end;
  v_row       jsonb;
  v_old       jsonb;
  v_new       jsonb;
  v_aksi      text;
  v_org       uuid;
  v_doc_id    uuid;
  v_doc_no    text;
  v_label     text;
  v_diff      jsonb := '{}'::jsonb;
  v_kolom     text[] := '{}';
  v_key       text;
  v_dari      jsonb;
  v_ke        jsonb;
  v_uid       uuid := auth.uid();
  v_nama      text;
  v_email     text;
  v_ringkasan text;
  -- Kolom teknis: perubahannya tidak berarti apa-apa bagi auditor
  v_abaikan   text[] := array['created_at', 'updated_at', 'organization_id',
                              'status_urut'];
begin
  if TG_OP = 'DELETE' then
    v_row  := to_jsonb(OLD);
    v_aksi := 'Hapus';
  elsif TG_OP = 'INSERT' then
    v_row  := to_jsonb(NEW);
    v_aksi := 'Buat';
  else
    v_row  := to_jsonb(NEW);
    v_aksi := 'Ubah';
  end if;

  v_org := nullif(v_row->>'organization_id', '')::uuid;
  -- Baris tanpa organisasi tidak bisa ditempatkan di log mana pun
  if v_org is null then
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  v_doc_id := nullif(v_row->>'id', '')::uuid;
  if v_no_col <> '' then
    v_doc_no := nullif(v_row->>v_no_col, '');
  end if;
  v_label := coalesce(v_doc_no, left(coalesce(v_doc_id::text, '?'), 8));

  if TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    for v_key in select k from jsonb_object_keys(v_new) k loop
      continue when v_key = any(v_abaikan);
      continue when v_pantau is not null and not (v_key = any(v_pantau));
      continue when v_old->v_key is not distinct from v_new->v_key;

      -- Isi jsonb/array besar cukup ditandai berubah. Menyalinnya bulat-bulat
      -- membuat satu baris log berukuran puluhan kilobyte tanpa menambah
      -- informasi yang bisa dibaca orang.
      if jsonb_typeof(v_new->v_key) in ('object', 'array')
         or jsonb_typeof(v_old->v_key) in ('object', 'array') then
        v_dari := to_jsonb('(data)'::text);
        v_ke   := to_jsonb('(diubah)'::text);
      else
        v_dari := v_old->v_key;
        v_ke   := v_new->v_key;
      end if;

      v_diff  := v_diff || jsonb_build_object(
                   v_key, jsonb_build_object('dari', v_dari, 'ke', v_ke)
                 );
      v_kolom := v_kolom || v_key;
    end loop;

    -- Tidak ada perubahan nyata (mis. form disimpan ulang tanpa diubah,
    -- atau yang berubah cuma kolom di luar daftar pantau)
    if cardinality(v_kolom) = 0 then
      return NEW;
    end if;
  end if;

  if v_uid is not null then
    select p.nama, p.email into v_nama, v_email
    from profiles p
    where p.id = v_uid;
  end if;

  v_ringkasan := case
    when TG_OP = 'INSERT' then v_label || ' dibuat'
    when TG_OP = 'DELETE' then v_label || ' dihapus'
    else v_label || ' diubah: ' || array_to_string(v_kolom, ', ')
  end;

  insert into activity_logs (
    organization_id, user_id, user_nama, user_email,
    modul, tabel, aksi, dokumen_id, dokumen_no, ringkasan, perubahan
  ) values (
    v_org, v_uid,
    -- Perubahan lewat SQL Editor / service role tidak punya auth.uid()
    coalesce(v_nama, case when v_uid is null then 'Sistem' else 'Pengguna dihapus' end),
    v_email,
    v_modul, TG_TABLE_NAME, v_aksi, v_doc_id, v_doc_no, v_ringkasan,
    case when TG_OP = 'UPDATE' then v_diff else null end
  );

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;


-- Isi baris yang sudah ada.
update public.purchase_orders
   set status_urut = public.po_status_urut(status::text)
 where status_urut is distinct from public.po_status_urut(status::text);


-- Urutan bawaan halaman: status_urut lalu no_po, dan itu yang juga
-- dipakai .range() untuk memotong halaman. Tanpa index, tiap halaman
-- menyortir seluruh tabel dari nol.
create index if not exists purchase_orders_urut_idx
  on public.purchase_orders (organization_id, status_urut, no_po);
