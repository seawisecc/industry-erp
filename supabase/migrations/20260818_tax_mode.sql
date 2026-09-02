-- ============================================================
-- Perhitungan PPN: dua model harga + DPP Nilai Lain
--
-- Tarif PPN Indonesia 12%. Yang membuatnya terbaca seperti 11% adalah
-- DPP Nilai Lain (PMK 131/2024): dasar pengenaannya 11/12 dari harga
-- jual, jadi PPN = 12% x 11/12 x harga = 11% x harga. Angkanya sama
-- dengan menghitung 11% langsung, RINCIANNYA yang beda, dan rincian
-- itulah yang harus tercetak di faktur.
--
-- Dua model harga, dipilih per perusahaan:
--
--   Exclude : harga produk BELUM termasuk pajak. Pajak ditambahkan di
--             atas nilai setelah diskon, jadi tagihan client bertambah.
--   Include : harga produk SUDAH final, pajak ada di dalamnya. Tagihan
--             client tidak bertambah, pajaknya diurai dari harga.
--
-- Kenapa "Exclude"/"Include" dan bukan istilah Indonesia: di lapangan
-- orang memang menyebutnya "harga include PPN" / "exclude PPN", jadi
-- nilai datanya justru lebih terbaca begini.
--
-- Rumusnya cuma boleh ada di SATU tempat per sisi:
--   SQL        -> invoice_tax_calc() di bawah ini
--   TypeScript -> hitungTotalDokumen() di lib/invoiceMath.ts
-- Keduanya wajib ikut berubah bersamaan. Angka di layar yang berbeda
-- dengan angka yang dihitung ulang di SQL adalah bug terburuk di sini.
-- ============================================================


-- ============================================================
-- 1. Pengaturan per perusahaan
-- ============================================================
alter table public.organization_settings
  add column if not exists tax_mode text not null default 'Exclude';

alter table public.organization_settings
  add column if not exists tax_percent numeric not null default 12;

alter table public.organization_settings
  add column if not exists tax_dpp_nilai_lain boolean not null default true;

do $$
begin
  alter table public.organization_settings
    add constraint organization_settings_tax_mode_check
    check (tax_mode in ('Exclude', 'Include'));
exception
  when duplicate_object then null;
end $$;

comment on column public.organization_settings.tax_mode is
  'Exclude = harga produk belum termasuk pajak (pajak ditambahkan). '
  'Include = harga produk sudah final, pajak diurai dari harga.';
comment on column public.organization_settings.tax_percent is
  'Tarif PPN menurut regulasi. 12 sejak 1 Januari 2025, bukan tarif '
  'efektif 11 yang sudah memperhitungkan DPP Nilai Lain.';
comment on column public.organization_settings.tax_dpp_nilai_lain is
  'DPP dihitung 11/12 dari harga jual (PMK 131/2024). Mati = DPP sama '
  'dengan harga jual penuh.';


-- ============================================================
-- 2. Mode pajak DIBEKUKAN per dokumen
--
-- Pengaturan perusahaan boleh berubah kapan saja; dokumen yang sudah
-- terbit tidak boleh ikut bergeser angkanya. Karena itu modenya
-- disalin ke barisnya sendiri saat insert.
--
-- Diisi oleh trigger, BUKAN oleh aplikasi: create_sales_invoice_tx
-- dipanggil dari tiga jalur (Direct/POS, laku per outlet, laku per
-- pengiriman) dan yang lupa mengisinya tidak menimbulkan error apa pun,
-- cuma dokumen dengan pajak yang salah model.
-- ============================================================
alter table public.sales_invoices
  add column if not exists tax_mode text;

alter table public.sales_invoices
  add column if not exists tax_dpp_nilai_lain boolean;

-- Dokumen lama dihitung dengan model Exclude dan TANPA DPP Nilai Lain
-- (tarifnya waktu itu ditulis 11 dan dikenakan ke harga jual penuh).
-- Ditulis eksplisit supaya angkanya tetap persis sama sesudah migrasi
-- ini: yang berubah cuma cara menampilkannya, bukan nilainya.
update public.sales_invoices
   set tax_mode = coalesce(tax_mode, 'Exclude'),
       tax_dpp_nilai_lain = coalesce(tax_dpp_nilai_lain, false)
 where tax_mode is null or tax_dpp_nilai_lain is null;

create or replace function public.set_invoice_tax_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode       text;
  v_nilai_lain boolean;
begin
  if new.tax_mode is null or new.tax_dpp_nilai_lain is null then
    select s.tax_mode, s.tax_dpp_nilai_lain
      into v_mode, v_nilai_lain
      from organization_settings s
     where s.organization_id = new.organization_id;

    new.tax_mode := coalesce(new.tax_mode, v_mode, 'Exclude');
    new.tax_dpp_nilai_lain :=
      coalesce(new.tax_dpp_nilai_lain, v_nilai_lain, true);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_invoice_tax_mode on public.sales_invoices;
create trigger trg_set_invoice_tax_mode
  before insert on public.sales_invoices
  for each row execute function public.set_invoice_tax_mode();

comment on column public.sales_invoices.tax_mode is
  'Model pajak yang dipakai saat dokumen terbit, dibekukan di sini. '
  'Diisi trigger dari organization_settings.tax_mode.';
comment on column public.sales_invoices.tax_dpp_nilai_lain is
  'Aturan DPP yang berlaku saat dokumen terbit, dibekukan di sini. '
  'Dokumen sebelum migrasi 20260818 bernilai false.';


-- ============================================================
-- 3. Satu rumus pajak untuk seluruh sisi SQL
--
-- Cerminan persis hitungTotalDokumen() di lib/invoiceMath.ts:
--
--   diskon = subtotal * diskon%
--   netto  = subtotal - diskon             <- SUB TOTAL
--   exTax  = harga jual tanpa pajak        <- SUB TOTAL EXC TAX
--            Exclude: netto
--            Include: netto / (1 + tarif efektif)
--   dpp    = exTax * 11/12 kalau Nilai Lain menyala, kalau tidak exTax
--   pajak  = Include ? netto - exTax : netto * tarif efektif
--   total  = Include ? netto : netto + pajak
--
-- Pajak pada Include dihitung sebagai SISA, bukan dpp * tarif, supaya
-- exTax + pajak selalu persis netto. Nilainya identik secara matematis,
-- cuma tidak menyisakan selisih pembulatan yang tidak bisa dijelaskan
-- di dokumen pajak.
-- ============================================================
create or replace function public.invoice_tax_calc(
  p_subtotal          numeric,
  p_diskon_percent    numeric,
  p_pakai_tax         boolean,
  p_tax_percent       numeric,
  p_tax_mode          text,
  p_dpp_nilai_lain    boolean default true
) returns jsonb
language sql
immutable
as $$
  with dasar as (
    select
      coalesce(p_subtotal, 0)                                        as subtotal,
      coalesce(p_subtotal, 0) * coalesce(p_diskon_percent, 0) / 100  as diskon,
      coalesce(p_pakai_tax, false)                                   as pakai,
      coalesce(p_tax_mode, 'Exclude')                                as modus,
      case when coalesce(p_dpp_nilai_lain, true)
           then 11::numeric / 12 else 1 end                          as faktor,
      coalesce(p_tax_percent, 0)
        * case when coalesce(p_dpp_nilai_lain, true)
               then 11::numeric / 12 else 1 end                      as efektif
  ),
  hitung as (
    select *, subtotal - diskon as netto from dasar
  ),
  urai as (
    select *,
      case
        -- Pembagi tidak pernah boleh nol atau negatif; tarif segila itu
        -- diperlakukan sebagai tanpa pengurai.
        when pakai and modus = 'Include' and 1 + efektif / 100 > 0
          then netto / (1 + efektif / 100)
        else netto
      end as ex_tax
    from hitung
  )
  select jsonb_build_object(
    'subtotal', subtotal,
    'diskon',   diskon,
    'netto',    netto,
    'ex_tax',   ex_tax,
    'dpp',      case when pakai then ex_tax * faktor else netto end,
    'tax',      case
                  when not pakai then 0
                  when modus = 'Include' then netto - ex_tax
                  else netto * efektif / 100
                end,
    'total',    case
                  when not pakai then netto
                  when modus = 'Include' then netto
                  else netto + netto * efektif / 100
                end
  )
  from urai;
$$;

comment on function public.invoice_tax_calc(numeric, numeric, boolean, numeric, text, boolean) is
  'Satu-satunya rumus diskon & PPN di sisi SQL. Cerminan '
  'hitungTotalDokumen() di lib/invoiceMath.ts, dua-duanya wajib ikut '
  'berubah bersamaan.';


-- ============================================================
-- 4. Aturan pajak perusahaan, untuk dipakai RPC konsinyasi
-- ============================================================
create or replace function public.org_tax_mode(p_organization_id uuid)
returns text
language sql
stable
as $$
  select coalesce(
    (select tax_mode from organization_settings
      where organization_id = p_organization_id),
    'Exclude'
  );
$$;

create or replace function public.org_tax_dpp_nilai_lain(p_organization_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select tax_dpp_nilai_lain from organization_settings
      where organization_id = p_organization_id),
    true
  );
$$;


-- ============================================================
-- 5. RPC konsinyasi ikut memakai rumus yang sama
--
-- Dua fungsi ini menghitung sendiri total Proforma-nya (harganya dari
-- consignment_items, bukan dari layar), jadi merekalah yang harus tahu
-- model pajaknya. Isinya sama dengan 20260803 kecuali blok hitungan.
--
-- Keduanya SECURITY INVOKER seperti aslinya, jadi tidak ada atribut
-- yang perlu ditulis ulang di sini.
-- ============================================================
create or replace function public.report_outlet_sale_tx(
  p_organization_id uuid,
  p_client_id       uuid,
  p_lines           jsonb,   -- [{product_id, varian_ukuran, qty, harga}]
  p_opts            jsonb    -- {diskon_percent, pakai_tax, tax_percent, top_days, tanggal, jatuh_tempo, dibuat_oleh}
) returns uuid
language plpgsql
as $$
declare
  v_line      record;
  v_harga     numeric;
  v_items     jsonb := '[]'::jsonb;
  v_subtotal  numeric := 0;
  v_hasil     jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Isi minimal satu produk yang laku';
  end if;

  for v_line in
    select (l->>'product_id')::uuid  as product_id,
           nullif(l->>'varian_ukuran', '') as varian,
           (l->>'qty')::numeric      as qty,
           nullif(l->>'harga', '')::numeric as harga
    from jsonb_array_elements(p_lines) l
  loop
    if v_line.qty is null or v_line.qty <= 0 then
      raise exception 'Qty harus lebih dari 0';
    end if;

    -- Potong stok dulu; kalau baris mana pun gagal, seluruh transaksi
    -- di-rollback termasuk invoice, tidak ada lagi stok hilang tanpa dokumen.
    v_harga := consignment_take(
      p_organization_id, p_client_id, v_line.product_id,
      v_line.varian, v_line.qty, 'qty_terjual');

    if v_line.harga is not null and v_line.harga > 0 then
      v_harga := v_line.harga;
    end if;

    v_subtotal := v_subtotal + v_line.qty * coalesce(v_harga, 0);
    v_items := v_items || jsonb_build_object(
      'product_id',    v_line.product_id,
      'varian_ukuran', v_line.varian,
      'qty',           v_line.qty,
      'harga',         coalesce(v_harga, 0)
    );
  end loop;

  v_hasil := invoice_tax_calc(
    v_subtotal,
    coalesce((p_opts->>'diskon_percent')::numeric, 0),
    coalesce((p_opts->>'pakai_tax')::boolean, false),
    coalesce((p_opts->>'tax_percent')::numeric, 0),
    org_tax_mode(p_organization_id),
    org_tax_dpp_nilai_lain(p_organization_id)
  );

  return create_sales_invoice_tx(
    p_organization_id,
    jsonb_build_object(
      'tipe',           'Proforma',
      'sumber',         'Konsinyasi',
      'client_id',      p_client_id,
      'tanggal',        p_opts->>'tanggal',
      'diskon_percent', coalesce((p_opts->>'diskon_percent')::numeric, 0),
      'pakai_tax',      coalesce((p_opts->>'pakai_tax')::boolean, false),
      'tax_percent',    coalesce((p_opts->>'tax_percent')::numeric, 0),
      'subtotal',       v_subtotal,
      'total',          (v_hasil->>'total')::numeric,
      'top_days',       p_opts->>'top_days',
      'jatuh_tempo',    p_opts->>'jatuh_tempo',
      'dibuat_oleh',    p_opts->>'dibuat_oleh'
    ),
    v_items
  );
end;
$$;


create or replace function public.report_consignment_sale_tx(
  p_organization_id uuid,
  p_consignment_id  uuid,
  p_items           jsonb,   -- [{consignment_item_id, qty_laku}]
  p_opts            jsonb
) returns uuid
language plpgsql
as $$
declare
  v_cons      record;
  v_it        record;
  v_ci        record;
  v_sisa      numeric;
  v_items     jsonb := '[]'::jsonb;
  v_subtotal  numeric := 0;
  v_hasil     jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));

  select id, client_id, status into v_cons
  from consignments
  where id = p_consignment_id and organization_id = p_organization_id;

  if not found then
    raise exception 'Konsinyasi tidak ditemukan';
  end if;
  if v_cons.status <> 'Aktif' then
    raise exception 'Konsinyasi sudah selesai';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal satu item laku';
  end if;

  for v_it in
    select (x->>'consignment_item_id')::uuid as ci_id,
           (x->>'qty_laku')::numeric         as qty
    from jsonb_array_elements(p_items) x
  loop
    if v_it.qty is null or v_it.qty <= 0 then
      continue;
    end if;

    select id, product_id, varian_ukuran, qty_kirim, qty_terjual, qty_retur, harga_jual
      into v_ci
    from consignment_items
    where id = v_it.ci_id
      and consignment_id = p_consignment_id
      and organization_id = p_organization_id
    for update;

    if not found then
      raise exception 'Item konsinyasi tidak ditemukan';
    end if;

    v_sisa := v_ci.qty_kirim - v_ci.qty_terjual - v_ci.qty_retur;
    if v_it.qty > v_sisa then
      raise exception 'Qty laku melebihi sisa di lokasi konsinyasi (sisa % pcs)', v_sisa;
    end if;

    update consignment_items
      set qty_terjual = qty_terjual + v_it.qty
      where id = v_ci.id;

    v_subtotal := v_subtotal + v_it.qty * v_ci.harga_jual;
    v_items := v_items || jsonb_build_object(
      'product_id',    v_ci.product_id,
      'varian_ukuran', v_ci.varian_ukuran,
      'qty',           v_it.qty,
      'harga',         v_ci.harga_jual
    );
  end loop;

  if jsonb_array_length(v_items) = 0 then
    raise exception 'Minimal satu item laku';
  end if;

  v_hasil := invoice_tax_calc(
    v_subtotal,
    coalesce((p_opts->>'diskon_percent')::numeric, 0),
    coalesce((p_opts->>'pakai_tax')::boolean, false),
    coalesce((p_opts->>'tax_percent')::numeric, 0),
    org_tax_mode(p_organization_id),
    org_tax_dpp_nilai_lain(p_organization_id)
  );

  return create_sales_invoice_tx(
    p_organization_id,
    jsonb_build_object(
      'tipe',           'Proforma',
      'sumber',         'Konsinyasi',
      'client_id',      v_cons.client_id,
      'consignment_id', p_consignment_id,
      'tanggal',        p_opts->>'tanggal',
      'diskon_percent', coalesce((p_opts->>'diskon_percent')::numeric, 0),
      'pakai_tax',      coalesce((p_opts->>'pakai_tax')::boolean, false),
      'tax_percent',    coalesce((p_opts->>'tax_percent')::numeric, 0),
      'subtotal',       v_subtotal,
      'total',          (v_hasil->>'total')::numeric,
      'top_days',       p_opts->>'top_days',
      'jatuh_tempo',    p_opts->>'jatuh_tempo',
      'dibuat_oleh',    p_opts->>'dibuat_oleh'
    ),
    v_items
  );
end;
$$;


-- ============================================================
-- 6. Perbaikan data
--
-- (a) PT Damar Nubio Aestetik memakai harga final: harga jual produknya
--     sudah termasuk PPN, jadi invoice-nya tidak boleh menambahkan
--     pajak lagi di atas harga.
--
-- (b) Proforma DNAlab yang BELUM pernah dibayar sepeser pun ikut
--     dihitung ulang dengan model itu. Dokumen yang sudah punya baris
--     sales_payments sengaja tidak disentuh: totalnya adalah angka yang
--     sudah dipakai orang untuk membayar, dan mengubahnya membuat
--     ledger cicilan tidak cocok lagi dengan tagihannya.
--
-- Perusahaan lain tetap Exclude. Tarif 12 + DPP Nilai Lain sudah
-- terpasang lewat default kolom di bagian 1, dan itu TIDAK mengubah
-- total mana pun: 12% x 11/12 sama dengan 11% yang dipakai selama ini.
-- Yang berubah cuma rincian DPP yang tercetak di faktur.
-- ============================================================
update public.organization_settings s
   set tax_mode = 'Include',
       updated_at = now()
 from public.organizations o
where o.id = s.organization_id
  and o.nama ilike '%Damar Nubio%';

update public.sales_invoices si
   set tax_mode = 'Include',
       -- Dokumen ini terbit sebelum ada kolom aturan DPP, jadi ikut
       -- dinaikkan ke aturan yang berlaku sekarang.
       tax_percent = 12,
       tax_dpp_nilai_lain = true,
       total = case
                 when si.pakai_tax
                   -- Include: harga sudah final, total berhenti di nilai
                   -- setelah diskon. Pajaknya ada di dalam angka itu.
                   then si.subtotal - si.subtotal * coalesce(si.diskon_percent, 0) / 100
                 else si.total
               end
  from public.organizations o
 where o.id = si.organization_id
   and o.nama ilike '%Damar Nubio%'
   and si.tax_mode = 'Exclude'
   and not exists (
     select 1 from public.sales_payments p where p.invoice_id = si.id
   );
