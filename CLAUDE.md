@AGENTS.md

# Arsitektur transaksi (Supabase RPC)

## ⚠️ Urutan deploy: SQL DULU, baru aplikasi

Kode aplikasi memanggil fungsi Postgres yang definisinya ada di
`supabase/migrations/`. **Jalankan migrasi ke database sebelum men-deploy
aplikasi.** Kalau terbalik, seluruh alur konsinyasi, receiving, pembatalan
invoice, edit PO, dan pembayaran gagal dengan error "function not found".

Migrasinya `CREATE OR REPLACE` dan tidak menyentuh tabel, jadi aman
dijalankan berulang.

Kalau menambah RPC baru, berlaku aturan yang sama: SQL naik lebih dulu,
baru kode yang memanggilnya.

## Pola: satu advisory lock per organisasi

Semua fungsi yang mengubah stok, penomoran dokumen, atau saldo pembayaran
mengambil lock yang sama di awal:

```sql
perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
```

Konsekuensinya, dan ini yang harus dijaga:

- **Lock-nya re-entrant dalam satu transaksi.** Fungsi boleh memanggil
  fungsi lain yang mengambil lock yang sama — mis. `report_outlet_sale_tx`
  memanggil `create_sales_invoice_tx`. Jangan duplikasi logika penomoran
  invoice, panggil saja fungsinya.
- **Serialisasi per organisasi.** Dua request dari company yang sama
  antre; company berbeda jalan paralel.
- **Semua UPDATE qty harus relatif**, `set qty = qty + n`, bukan nilai
  hasil hitung di TypeScript. Pola "baca di JS → tambah → tulis balik"
  adalah sumber lost update dan sudah dihapus dari codebase — jangan
  dimasukkan lagi.

Konsekuensi praktis: **jangan menjahit urutan tulis multi-langkah di
TypeScript.** `supabase-js` tidak punya transaksi, jadi langkah kedua yang
gagal meninggalkan langkah pertama yang sudah terlanjur. Kalau sebuah alur
menyentuh lebih dari satu tabel dan harus utuh, tulis RPC baru.

Pesan `raise exception` dari SQL sampai ke `error.message` di client, lalu
dikembalikan sebagai nilai lewat `ActionResult` (`lib/actionResult.ts`) —
jangan `throw` dari server action, pesannya disensor di build production.

## Daftar RPC

Sudah ada sebelumnya (definisinya hanya di project Supabase, tidak
di-track di repo):

| Fungsi | Guna |
| --- | --- |
| `create_consignment_tx` | Cek stok + penomoran CSG + insert pengiriman |
| `create_sales_invoice_tx` | Cek stok + penomoran INV + insert invoice & itemnya |
| `create_production` | Potong bahan FEFO + hitung HPP real + insert batch |
| `cancel_production` | Kembalikan bahan ke batch asal, hapus batch |
| `create_stock_adjustment` | Stok awal & opname, tambah batch / potong FEFO |
| `get_finished_stock` | Agregat stok produk jadi per produk+varian |
| `fg_available` | Sisa stok jual satu produk+varian |

Ditambahkan di `supabase/migrations/20260803_transactional_rpcs.sql` (12):

| Fungsi | Guna |
| --- | --- |
| `varian_key` | Normalisasi varian — `null`, `""`, dan `-` dianggap sama. Harus konsisten dengan sisi TypeScript |
| `consignment_take` | Distribusi FIFO qty laku/retur lintas pengiriman di satu outlet, baris dikunci `FOR UPDATE` |
| `report_outlet_sale_tx` | Laku di outlet: potong stok **+** terbitkan Proforma, satu transaksi |
| `retur_outlet_tx` | Retur di outlet, barang kembali ke stok produk jadi |
| `report_consignment_sale_tx` | Laku dari satu pengiriman tertentu + Proforma |
| `close_consignment_tx` | Tutup konsinyasi, sisa yang tak laku jadi retur |
| `create_receiving_tx` | Header faktur + batch stok + `qty_diterima` + status PO |
| `update_po_tx` | Ganti header & seluruh baris item PO |
| `cancel_invoice_tx` | Hapus pembayaran → item → header invoice |
| `recompute_invoice_status` | Hitung ulang status bayar dari ledger cicilan |
| `record_sales_payment_tx` | Cek sisa tagihan + insert cicilan + hitung ulang status |
| `delete_sales_payment_tx` | Hapus cicilan + hitung ulang status |

## Aturan yang tertanam di RPC, jangan dilanggar dari aplikasi

- **`sales_invoices.tipe` monoton.** Proforma naik jadi Invoice begitu
  lunas, dan sesudah itu tidak pernah turun lagi. Dokumen yang sudah
  terbit tidak boleh jadi Proforma lagi cuma karena cicilan dihapus.
  Logikanya ada di `recompute_invoice_status`.
- **Batch QA `Hold`/`Rejected` tidak pernah masuk stok jual**, jadi
  pembatalannya tidak boleh dibandingkan dengan stok tersedia
  (lihat `cancelProduction` di `app/(app)/production/actions.ts`).
- **Tanggal "hari ini" dikirim dari aplikasi**, bukan `current_date` di
  SQL. Server berjalan di UTC; `lib/dates.ts` yang menghitung tanggal
  kalender di zona operasional.

# Pola UI tabel

Semua tabel daftar memakai `components/DataTable.tsx`. Jangan menulis
`<table>` baru dari nol — kalau butuh sesuatu yang belum didukung,
tambahkan prop di komponennya supaya seluruh aplikasi ikut.

## Satu definisi kolom, dua bentuk tampilan

Satu array `columns` menghasilkan tabel (≥768px) **dan** kartu per baris
(<768px). Tidak ada dua markup yang harus dijaga sinkron. `role` per kolom
yang menentukan posisinya di kartu:

| `role` | Di kartu HP |
| --- | --- |
| `title` | judul kartu |
| `subtitle` | baris kecil di bawah judul (kode/nomor) |
| `badge` | pil status di kanan judul |
| `primary` | grid fakta, tampil di muka |
| `secondary` (default) | di balik `<details>` "Detail selengkapnya" |
| `actions` | grup ikon di kaki kartu |

Prop yang ada karena kebutuhan nyata, bukan spekulasi:

- `cardCell` — versi lain khusus kartu, saat sel tabelnya mengandung
  `truncate`/`max-w` yang tidak masuk akal di kartu.
- `expandable={false}` — **wajib untuk tabel berisi input.** Field yang
  harus diisi tidak boleh sembunyi di balik satu tap lagi; user tidak
  akan tahu ada yang terlewat.
- `chrome="bare"` — tabel yang sudah berada di dalam panel `.glass`.
  Kaca di atas kaca membuat tepinya menumpuk.
- `footer` — baris `<tfoot>`; di HP dirender ulang jadi kartu ringkasan.

**Tabel berkelompok tidak dijadikan kartu.** Formula per fase
(`products/[id]`) dan lembar uji parameter QC/QA punya baris header grup —
bentuk kartu menghapus pengelompokan yang justru jadi isi dokumennya.
Yang itu tetap `<table>` biasa, cukup diberi `sticky-col` pada kolom
pertamanya.

## Sticky: tiga jebakan yang mahal kalau dilanggar

**1. Sticky header butuh batas tinggi.** `top: 0` berjangkar ke scroll
container terdekat, bukan ke layar. Pembungkus tabel punya
`overflow-x-auto` — dan begitu satu sumbu bukan `visible`, sumbu satunya
ikut jadi `auto` — jadi container itulah jangkarnya. Selama tingginya
mengikuti isi, dia tidak pernah ter-scroll sendiri dan headernya ikut
hanyut bersama halaman. Karena itu `.dt-table` punya `maxHeight`
(default `calc(100dvh - 6rem)`). Menyetel `maxHeight={false}` mematikan
sticky header, bukan cuma melonggarkan tinggi.

**2. Latar sel sticky harus PEKAT, bukan `.glass` yang 0.55.** Sudah
dicoba 0.94 + blur: sisa 6% tetap terbaca sebagai teks hantu yang ikut
bergerak. Blur tidak menolong — `backdrop-filter` pada sel tabel tidak
menghasilkan backdrop root di Chrome, dan Lightning CSS membuang properti
tak berprefiksnya (`.glass` pun sebenarnya hanya jalan lewat
`-webkit-`). Warnanya `#F7F5F1`, perkiraan panel `.glass` di atas latar
`#EDE9E0`.

**3. Garisnya pakai `box-shadow: inset`, bukan `border`.** Preflight
Tailwind menyetel `border-collapse: collapse`; di mode itu border sel jadi
milik "border grid" tabel dan tidak ikut menempel bersama selnya, jadi
garisnya putus begitu header digeser.

Urutan z-index — sudut menempel di dua sumbu sekaligus, jadi harus paling
atas: sudut `4`, header & baris total `3`, kolom pertama `2`. Aturan
sudutnya ditulis sebagai CSS biasa (bukan `@utility`) supaya tidak
bergantung urutan emit Tailwind: aturan tanpa layer selalu menang atas
utility ber-layer.

## Aksi baris: ikon, bukan teks

`components/RowActions.tsx`. `label` wajib — dipakai sekaligus sebagai
`aria-label` dan isi tooltip. Tooltip sengaja muncul di **kiri** tombol:
pembungkus tabel `overflow-x-auto` membuat sumbu Y ikut `auto`, jadi
tooltip di atas/bawah terpotong.

Pengecualian: **CTA primer tetap teks** — "Uji & Putuskan", "Tinjau &
Luluskan", "Bayar". Ikon telanjang untuk aksi utama menurunkan
discoverability.

# State klien: dua pola yang wajib diikuti

## Baca `localStorage` / `matchMedia` lewat `useSyncExternalStore`

Nilainya tidak ada di server, jadi tidak bisa dipakai sebagai initial
state biasa — server dan klien render beda dan hidrasinya bentrok.
Membacanya di `useEffect` lalu `setState` memang benar hasilnya, tapi
melanggar `react-hooks/set-state-in-effect` dan memaksa satu render
tambahan sesudah layar terlanjur dilukis.

`useSyncExternalStore` dibuat untuk ini: React memakai `getServerSnapshot`
saat render server & hidrasi, lalu berpindah ke `getSnapshot` tanpa
dianggap bentrok. Contoh terpakai: `components/SidebarNav.tsx`
(preferensi minimize), `app/kenapa/page.tsx` (prefers-reduced-motion),
`ExecuteForm` (draft).

**`getSnapshot` wajib mengembalikan nilai yang sama persis selama tidak
ada perubahan.** Kalau isinya di-`JSON.parse` tiap panggilan, hasilnya
objek baru terus dan React me-render tanpa henti. Cache hasilnya
(lihat `draftAwal` di `ExecuteForm`), dan batalkan cache-nya di unmount,
bukan di jalur tulis.

## Guard "render pertama" jangan pakai flag sekali pakai

React StrictMode (aktif default di dev) menjalankan effect → cleanup →
effect lagi. Flag `useRef(true)` yang di-*consume* di putaran pertama
sudah habis di putaran kedua, sehingga effect-nya jalan penuh padahal
belum ada perubahan user.

Ini pernah **merusak data**: autosave draft di `ExecuteForm` menulis form
yang masih kosong ke `localStorage`, menimpa isian user yang mau
diselamatkan. Perbaikannya membandingkan isi, bukan flag:

```ts
const sidikJari = JSON.stringify(isi);          // tanpa savedAt
if (isiAwal.current === null) { isiAwal.current = sidikJari; return; }
if (sidikJari === isiAwal.current) return;      // belum ada perubahan nyata
// …baru tulis
```

Berapa kali pun effect diulang, selama isinya sama dengan kondisi awal
tidak ada yang ditulis.

# Known issue

**Sidebar berkedip lebar → sempit saat muat pertama.** Preferensi minimize
ada di `localStorage`, yang tidak terbaca di server, jadi HTML pertama
selalu dirender lebar lalu dikoreksi di klien. `useSyncExternalStore`
menghapus bentrok hidrasi dan render sesudah paint, tapi **tidak**
menghapus kedipannya. Perbaikan sebenarnya: pindahkan preferensi ke cookie
supaya server bisa merender lebar yang benar sejak awal. Belum dikerjakan.
