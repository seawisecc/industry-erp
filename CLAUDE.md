@AGENTS.md

# Arsitektur transaksi (Supabase RPC)

## ⚠️ Urutan deploy: SQL DULU, baru aplikasi

Kode aplikasi memanggil fungsi Postgres yang definisinya ada di
`supabase/migrations/`. **Jalankan migrasi ke database sebelum men-deploy
aplikasi.** Kalau terbalik, seluruh alur konsinyasi, receiving, pembatalan
invoice, edit PO, dan pembayaran gagal dengan error "function not found".

Migrasinya `CREATE OR REPLACE` / `create table if not exists` /
`add column if not exists`, jadi aman dijalankan berulang.

Kalau menambah RPC baru, berlaku aturan yang sama: SQL naik lebih dulu,
baru kode yang memanggilnya.

**Antar-migrasi ada urutan.** Nama filenya bertanggal dan harus dijalankan
menurut urutan itu: `20260806_activity_logs.sql` mendefinisikan
`log_activity()`, dan migrasi sesudahnya memasang trigger yang memanggil
fungsi itu. Menjalankan yang belakangan lebih dulu gagal di baris
`create trigger`.

## Pola: satu advisory lock per organisasi

Semua fungsi yang mengubah stok, penomoran dokumen, atau saldo pembayaran
mengambil lock yang sama di awal:

```sql
perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 0));
```

Konsekuensinya, dan ini yang harus dijaga:

- **Lock-nya re-entrant dalam satu transaksi.** Fungsi boleh memanggil
  fungsi lain yang mengambil lock yang sama, mis. `report_outlet_sale_tx`
  memanggil `create_sales_invoice_tx`. Jangan duplikasi logika penomoran
  invoice, panggil saja fungsinya.
- **Serialisasi per organisasi.** Dua request dari company yang sama
  antre; company berbeda jalan paralel.
- **Semua UPDATE qty harus relatif**, `set qty = qty + n`, bukan nilai
  hasil hitung di TypeScript. Pola "baca di JS → tambah → tulis balik"
  adalah sumber lost update dan sudah dihapus dari codebase. Jangan
  dimasukkan lagi.

Konsekuensi praktis: **jangan menjahit urutan tulis multi-langkah di
TypeScript.** `supabase-js` tidak punya transaksi, jadi langkah kedua yang
gagal meninggalkan langkah pertama yang sudah terlanjur. Kalau sebuah alur
menyentuh lebih dari satu tabel dan harus utuh, tulis RPC baru.

Pesan `raise exception` dari SQL sampai ke `error.message` di client, lalu
dikembalikan sebagai nilai lewat `ActionResult` (`lib/actionResult.ts`),
jangan `throw` dari server action, pesannya disensor di build production.

## RLS: pakai fungsi helper, jangan tulis subquery sendiri

Definisi tabel dan policy TIDAK di-track di repo, jadi ini tidak bisa
dibaca dari kode mana pun. Policy di project ini memakai tiga fungsi:

```sql
using (
  is_authenticated_active()
  and (is_super_admin() or organization_id = current_user_org())
)
```

Menulis ulang `select organization_id from profiles where id = auth.uid()`
inline memang jalan, tapi bikin policy tabel baru beda bentuk dengan
puluhan tabel lain, dan itu yang harus disamakan manual sebelum skripnya
bisa dipakai. Tabel baru: pakai ketiga helper itu sejak awal.

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

`get_finished_stock` dan `fg_available` dulu ada di sini juga. Sejak
`20260810_finished_goods_opname` keduanya di-track di repo dan isinya
cuma membungkus `fg_stock_calc`.

Ditambahkan di `supabase/migrations/20260803_transactional_rpcs.sql` (12):

| Fungsi | Guna |
| --- | --- |
| `varian_key` | Normalisasi varian: `null`, `""`, dan `-` dianggap sama. Harus konsisten dengan sisi TypeScript |
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

Modul yang ditambahkan sesudahnya, satu migrasi per modul:

| Migrasi | Fungsi | Guna |
| --- | --- | --- |
| `20260805_material_issues` | `create_material_issue_tx` | Pemakaian bahan di luar produksi, potong FEFO + biaya per lot |
| | `cancel_material_issue_tx` | Kembalikan qty ke batch asal, hapus dokumen |
| `20260806_activity_logs` | `log_activity` | Fungsi trigger umum audit trail (lihat bab Audit trail) |
| | `log_formula_change` | Trigger per-PERNYATAAN untuk `product_formulas` + snapshot formula |
| `20260807_purchase_returns` | `create_purchase_return_tx` | Retur ke supplier: potong stok **atau** tidak (lihat aturan QC), kurangi hutang |
| | `cancel_purchase_return_tx` | Kembalikan qty ke kolom asalnya, pulihkan hutang |
| `20260808_client_prices` | `save_client_prices_tx` | Ganti seluruh daftar harga khusus satu client, utuh |
| | `log_client_price_change` | Trigger per-pernyataan + snapshot daftar harga |
| `20260809_stock_opname` | `create_stock_opname_tx` | Buka opname + POTRET stok sistem seluruh item dalam cakupan |
| | `save_opname_count_tx` | Simpan progres hitung fisik, boleh berkali-kali |
| | `finish_stock_opname_tx` | Tutup opname, selisih → `create_stock_adjustment` |
| | `cancel_stock_opname_tx` | Hapus opname yang belum ditutup |
| `20260810_finished_goods_opname` | `fg_stock_calc` | **Satu-satunya** rumus stok produk jadi. Filter produk/varian opsional, jadi dipakai agregat layar maupun penjaga per-baris |
| | `get_finished_stock` | Pembungkus tanpa filter, untuk layar & form penjualan |
| | `fg_available` | Pembungkus berfilter, untuk penjaga anti-oversell |
| | `create_stock_opname_tx` | Diperluas: cakupan `Produk Jadi` dan null (semua golongan) |
| | `finish_stock_opname_tx` | Diperluas: selisih bahan → adjustment, selisih produk jadi → `finished_goods_adjustments` |
| | `save_opname_count_tx` | Dicocokkan lewat id baris opname, bukan `item_id` |

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

# Akuntansi stok: satu barang keluar sekali

Barang bisa keluar lewat produksi, pemakaian di luar produksi, retur ke
supplier, pemusnahan, dan adjustment turun. Yang gampang salah adalah
menghitungnya dua kali.

**Batch yang ditolak QC stoknya SUDAH nol.** `decideQc` menulis
`qty_sisa = 0`, `qty_karantina = 0`, lalu mencatat `batch_dispositions`
bertipe `QC Reject`. Jadi barangnya secara pembukuan sudah keluar, walau
fisiknya masih ada di gudang menunggu dikirim balik.

Konsekuensinya di retur pembelian: dokumen retur untuk lot yang ditolak QC
**tidak boleh memotong stok lagi**, cuma mengurangi hutang. Karena itu tiap
baris `purchase_return_items` menyimpan asal potongannya
(`qty_dari_karantina` / `qty_dari_sisa`), nol dua-duanya untuk lot yang
sudah hangus. Itu juga yang membuat pembatalan retur bisa mengembalikan qty
ke kolom yang persis benar.

Aturan turunannya untuk laporan: **Stock Movement menjumlahkan
`qty_dari_karantina + qty_dari_sisa`, BUKAN `qty`.** Memakai `qty` akan
menghitung barang yang sama dua kali: sekali lewat pemusnahan QC, sekali
lewat retur.

## Peringatan stok produksi muncul di awal, tapi tidak menghalangi

Stok bahan baru terpotong di Input Hasil (`create_production`). Tanpa
peringatan lebih awal, kekurangan bahan baru ketahuan setelah ruahan
terlanjur dibuat dan penimbangan selesai dicatat.

Karena itu `lib/stokCek.ts` menghitung kekurangan dari isian layar, dan
`components/StokKurangAlert.tsx` menampilkannya di dua titik: form Plan
(sebelum plan disimpan) dan layar Execution (ikut berubah tiap angka
timbangan diketik).

Dua aturan yang mengikat:

- **Pembandingnya `purchase_batches.qty_sisa`, bukan qty_sisa +
  qty_karantina.** Itu angka yang sama yang dipakai RPC saat memotong.
  Ikut menghitung karantina akan membuat layar bilang "cukup" untuk
  barang yang tetap ditolak RPC, dan peringatan yang salah lebih buruk
  daripada tidak ada peringatan.
- **Peringatan, bukan penghalang.** Plan tetap boleh disimpan dan
  penimbangan tetap boleh dicatat: bahannya bisa saja baru datang
  menjelang tanggal produksi. Yang dicegah cuma satu, orang mulai
  bekerja tanpa tahu.

Karena layar produksi memakai daftar item untuk mencari stok, **query
item-nya tidak boleh menyaring `aktif = true`**. Bahan yang
dinonaktifkan setelah formulanya dibuat akan terbaca stok nol dan
memunculkan "kurang" untuk barang yang ada. Penyaringan aktif dilakukan
di pemilih Adjusting saja.

## Stok produk jadi tidak disimpan tapi dihitung, dan rumusnya cuma satu

Bahan punya baris `purchase_batches` yang bisa dinaikkan atau diturunkan.
Produk jadi tidak punya apa pun seperti itu: angkanya selalu hasil hitung

```
available = produksi - konsinyasi - terjual langsung + koreksi
```

Karena itu **`create_stock_adjustment` tidak bisa dipakai untuk mengoreksi
produk jadi.** Selisih opname produk jadi ditulis sebagai baris
`finished_goods_adjustments` (`qty_delta`, boleh negatif), yaitu komponen
keempat rumus di atas.

Rumus itu dulu ditulis tiga kali: `get_finished_stock` untuk layar,
`fg_available` untuk penjaga anti-oversell, dan salinan TypeScript di
`lib/salesStock.ts`. Tiga salinan berarti tiga kesempatan untuk lupa
menambahkan komponen baru, dan **yang terlupa menghasilkan bug terburuk
yang mungkin terjadi di sini: angka di layar berbeda dengan angka yang
dipakai sistem saat menolak penjualan.** Sekarang di sisi database cuma
ada `fg_stock_calc`; dua fungsi lainnya membungkusnya. Salinan TypeScript
tetap ada karena dipakai kalau RPC belum terpasang, dan wajib ikut diubah
setiap rumusnya bergerak.

Konsekuensinya kalau menambah jalur keluar-masuk produk jadi yang baru:
tambahkan sebagai `union all` di `fg_stock_calc`, lalu cerminkan di
fallback `lib/salesStock.ts`. Jangan menambahkan penyesuaian di pemanggil.

# Audit trail ditulis trigger, bukan aplikasi

`activity_logs` diisi oleh trigger Postgres (`log_activity`), bukan helper
yang dipanggil dari server action. Dua alasan, dan dua-duanya menentukan:

- Log yang ditulis dari TypeScript sesudah RPC berhasil adalah tulisan
  KEDUA di luar transaksi. Gagal di situ = dokumen ada, jejaknya tidak.
- Helper harus *diingat* di tiap jalur kode baru. Yang lupa tidak ketahuan
  sampai auditnya jalan. Trigger berlaku untuk semua jalur: server action,
  RPC, bahkan perubahan manual lewat SQL Editor.

**Log-nya tidak bisa disunting siapa pun.** `activity_logs` cuma punya
policy `select`; penulisan hanya lewat fungsi `SECURITY DEFINER`. Jangan
menambahkan policy insert/update/delete "supaya gampang". Log yang bisa
diedit bukan audit trail.

Tiga hal yang menjaga isinya tetap terbaca:

- **`TG_ARGV[2]` = daftar kolom yang dipantau.** Wajib untuk tabel yang
  sering di-UPDATE karena hal rutin: `purchase_batches.qty_sisa` berubah
  tiap pemotongan FEFO, dan tanpa filter itu log tenggelam.
- **Tabel baris anak tidak dipantau** (`po_items`, `sales_invoice_items`,
  `consignment_items`). Setiap alur yang mengubahnya pasti ikut menyentuh
  header-nya, jadi kejadiannya sudah tercatat sekali dengan nomor dokumen
  yang benar.
- **Nilai jsonb/array besar ditandai `(diubah)`, tidak disalin.** Diff
  `execution_data` utuh berukuran puluhan kilobyte tanpa menambah satu pun
  informasi yang bisa dibaca orang.

**Tabel yang isinya diganti utuh (hapus lalu sisip) pakai trigger
`FOR EACH STATEMENT`, bukan per baris.** `product_formulas` dan
`client_prices` disimpan dengan cara itu, jadi trigger per-baris
menghasilkan 2N entri untuk satu kali simpan. Versi statement menghasilkan
satu entri per pernyataan dan pada penyisipan ikut menyimpan SNAPSHOT
hasil akhirnya, snapshot itulah yang bernilai untuk audit CPKB. Efek
sampingnya diterima: satu kali edit tampil sebagai sepasang entri (Hapus
lalu Ubah), karena memang begitu yang terjadi di database.

# Jebakan Postgres yang sudah dibayar mahal

- **Tidak ada agregat `min(uuid)`.** Untuk mengambil satu nilai dari
  transition table atau subquery, pakai `limit 1`, bukan `min(id)`.
- **`now()` mengembalikan waktu MULAI transaksi, bukan waktu insert.**
  Jadi "ambil baris terbaru milik organisasi ini" BUKAN cara yang aman
  untuk menemukan baris yang barusan kamu buat: dua transaksi bisa mulai
  hampir bersamaan lalu bergantian memegang advisory lock dengan urutan
  terbalik dari urutan `now()`-nya. Cari lewat penanda unik yang kamu tulis
  sendiri: `finish_stock_opname_tx` mencocokkan `catatan` yang memuat
  nomor opname.
- **Foreign key di tabel audit bisa membatalkan operasi yang diauditnya.**
  `activity_logs.user_id` sengaja TANPA FK ke `profiles`: menghapus
  pengguna memicu trigger yang menulis baris ber-`user_id` pelakunya, dan
  pada penghapusan diri sendiri FK-nya gagal lalu MEMBATALKAN penghapusan.
  Nama & email di-snapshot, jadi tidak ada yang hilang.
- **Expression index butuh fungsi `IMMUTABLE`.** `client_prices` unik atas
  `varian_key(varian)`. Itu jalan karena `varian_key` dideklarasikan
  `immutable`. Fungsi baru yang dipakai di index harus sama.
- **`pg_get_function_identity_arguments()` ikut menyertakan NAMA
  parameter**, jadi hasilnya `p_org uuid, p_product uuid, p_varian text`,
  bukan `uuid, uuid, text`. Untuk membandingkan daftar TIPE saja pakai
  `oidvectortypes(p.proargtypes)`. Ini menghentikan migrasi
  `20260810_finished_goods_opname` di percobaan pertama.
- **`create or replace function` MENGEMBALIKAN atribut yang tidak
  disebut ke nilai bawaan.** Mengganti isi fungsi `security definer`
  tanpa menuliskan ulang `security definer`-nya diam-diam menjadikannya
  invoker. Kalau mengganti fungsi yang definisinya tidak diketahui, baca
  dulu `prosecdef` & `proconfig` dari `pg_proc` lalu pasang kembali.
  Fungsi yang di-DROP dan dibuat ulang kehilangan keduanya juga.
- **`substring(no from length(prefix)+1)::int` untuk penomoran, bukan
  regex digit-terakhir.** `'MI.202608001'` akan terbaca `202608001` kalau
  memakai `\d+$`.

# Pola UI tabel

Semua tabel daftar memakai `components/DataTable.tsx`. Jangan menulis
`<table>` baru dari nol. Kalau butuh sesuatu yang belum didukung,
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

- `cardCell`: versi lain khusus kartu, saat sel tabelnya mengandung
  `truncate`/`max-w` yang tidak masuk akal di kartu.
- `expandable={false}`: **wajib untuk tabel berisi input.** Field yang
  harus diisi tidak boleh sembunyi di balik satu tap lagi; user tidak
  akan tahu ada yang terlewat.
- `chrome="bare"`: tabel yang sudah berada di dalam panel `.glass`.
  Kaca di atas kaca membuat tepinya menumpuk.
- `footer`: baris `<tfoot>`; di HP dirender ulang jadi kartu ringkasan.
- `groupBy`: sisipkan baris pemisah antar kelompok baris yang berurutan
  (mis. "Fase A · 3 bahan" di penimbangan produksi); di HP jadi judul kecil
  di atas tiap kelompok kartu. **Barisnya tidak diurutkan ulang di sini**:
  yang berurutan dengan kunci sama digabung, urutannya tetap tanggung jawab
  pemanggil.

**Tabel berkelompok yang punya subtotal per grup tetap `<table>` biasa.**
Formula per fase di `products/[id]` dan lembar uji parameter QC/QA punya
angka subtotal di baris headernya, dan `groupBy` cuma menyediakan satu sel
melintang penuh. Yang itu cukup diberi `sticky-col` pada kolom pertamanya.

**Jangan taruh combobox di dalam DataTable.** Pembungkusnya
`overflow-auto`, jadi daftar saran yang muncul di bawah input akan
terpotong. Baris form yang butuh ketik-cari pakai grid biasa. Lihat
bagian Adjusting di `ExecuteForm` dan `MaterialIssueForm`.

**Dialog yang dibuka dari sel tabel WAJIB lewat `createPortal` ke
`document.body`.** `position: fixed` berjangkar ke viewport hanya selama
tidak ada leluhur yang punya `transform`, `filter`, atau
`backdrop-filter`; salah satunya membuat leluhur itu jadi containing
block-nya. Pembungkus `.dt-table` punya dua-duanya sekaligus,
`backdrop-filter` dari `.glass` dan `overflow-auto`, jadi `fixed inset-0`
di dalam sel bukan cuma menempel di panel tabel, tapi ikut terpotong
scroll container-nya. Gejalanya: overlay gelap cuma menutupi area tabel
dan tombol di kaki dialog hilang di balik tepi panel. Contoh yang benar:
`CancelTxButton`, `PaymentPanel`, `OutletActions`, `CompanyToggle`,
`ExpiryActions`.

## Sticky: tiga jebakan yang mahal kalau dilanggar

**1. Sticky header butuh batas tinggi.** `top: 0` berjangkar ke scroll
container terdekat, bukan ke layar. Pembungkus tabel punya
`overflow-x-auto` (dan begitu satu sumbu bukan `visible`, sumbu satunya
ikut jadi `auto`), jadi container itulah jangkarnya. Selama tingginya
mengikuti isi, dia tidak pernah ter-scroll sendiri dan headernya ikut
hanyut bersama halaman. Karena itu `.dt-table` punya `maxHeight`
(default `calc(100dvh - 6rem)`). Menyetel `maxHeight={false}` mematikan
sticky header, bukan cuma melonggarkan tinggi.

**2. Latar sel sticky harus PEKAT, bukan `.glass` yang 0.55.** Sudah
dicoba 0.94 + blur: sisa 6% tetap terbaca sebagai teks hantu yang ikut
bergerak. Blur tidak menolong: `backdrop-filter` pada sel tabel tidak
menghasilkan backdrop root di Chrome, dan Lightning CSS membuang properti
tak berprefiksnya (`.glass` pun sebenarnya hanya jalan lewat
`-webkit-`). Warnanya `#F7F5F1`, perkiraan panel `.glass` di atas latar
`#EDE9E0`.

**3. Garisnya pakai `box-shadow: inset`, bukan `border`.** Preflight
Tailwind menyetel `border-collapse: collapse`; di mode itu border sel jadi
milik "border grid" tabel dan tidak ikut menempel bersama selnya, jadi
garisnya putus begitu header digeser.

Urutan z-index. Sudut menempel di dua sumbu sekaligus, jadi harus paling
atas: sudut `4`, header & baris total `3`, kolom pertama `2`. Aturan
sudutnya ditulis sebagai CSS biasa (bukan `@utility`) supaya tidak
bergantung urutan emit Tailwind: aturan tanpa layer selalu menang atas
utility ber-layer.

## Aksi baris: ikon, bukan teks

`components/RowActions.tsx`. `label` wajib: dipakai sekaligus sebagai
`aria-label` dan isi tooltip. Tooltip sengaja muncul di **kiri** tombol:
pembungkus tabel `overflow-x-auto` membuat sumbu Y ikut `auto`, jadi
tooltip di atas/bawah terpotong.

Pengecualian: **CTA primer tetap teks** seperti "Uji & Putuskan", "Tinjau &
Luluskan", "Bayar". Ikon telanjang untuk aksi utama menurunkan
discoverability.

## Pemilih ketik-cari, bukan `<select>` panjang

`components/ClientPicker.tsx` dan `components/ProductPicker.tsx`. Daftar
produk jadi punya satu baris per kombinasi produk × varian, jadi
`<select>`-nya bisa ratusan baris. Keduanya membatasi jumlah saran yang
dirender (30) supaya tetap ringan.

`ProductPicker` menandai baris **jasa** dengan pil, bukan angka stok.
jasa tidak punya stok dan "stok 0" di sebelahnya menyesatkan. Prop
`showStock={false}` untuk layar yang ketersediaan barangnya tidak relevan
(mis. menyusun daftar harga khusus client).

**Kartu yang memuat picker perlu `relative` + `z-index` lebih tinggi
daripada kartu di bawahnya.** Efek `.glass` membentuk stacking context,
jadi tanpa itu daftar sarannya tertimbun panel berikutnya. Lihat
`InvoiceForm` (`z-40` untuk kartu header, `z-10` untuk kartu item).

# Bahasa antarmuka

Aplikasinya dwibahasa dengan pembagian yang tegas. Kalau menambah layar
baru, ikuti kolom kanan:

| Bagian | Bahasa | Contoh |
| --- | --- | --- |
| Menu, sub-menu, kartu navigasi shell | **Inggris** | Stock Items, Purchase Return, Activity Log |
| Judul halaman DAFTAR / hub | **Inggris** | Sales Payments, Expiry Control, Product Margin |
| Judul halaman FORM / aksi | Indonesia | Tambah Client, Buat Purchase Order, Opname Baru |
| Judul seksi di dalam halaman | Indonesia | Penimbangan Bahan, Produk yang Dijual |
| Header kolom tabel | Indonesia | Kode, Stok Sisa, Jatuh Tempo |
| Tombol, teks penjelas, pesan error | Indonesia | Simpan, Cetak, "Stok tidak cukup" |
| Nilai data (status, kategori) | Indonesia | Dibuat, Lunas, Karantina, R&D |
| Dokumen cetak | Indonesia | BUKTI PENERIMAAN BARANG |

`subtitle` kartu navigasi tetap Indonesia walau `title`-nya Inggris. Itu
kalimat penjelas, bukan nama menu.

Nilai data ada di database dan divalidasi di SQL, jadi mengubah bahasanya
butuh migrasi data, bukan sekadar ganti teks. Jangan diutak-atik.

## Jangan pakai tanda hubung panjang

Em dash (`—`) dan en dash (`–`) **tidak dipakai di mana pun**: teks UI,
dokumen cetak, komentar kode, migrasi SQL, maupun file `.md` ini.
Alasannya bukan selera. Tanda itu jarang diketik orang Indonesia di
keyboard biasa, jadi kehadirannya membuat tulisan terbaca sebagai hasil
generator, dan itu merusak kepercayaan pada dokumen yang justru harus
terlihat terbit dari perusahaan.

Gantinya, pilih yang paling pas menurut fungsi kalimatnya:

| Fungsi | Pakai | Contoh |
| --- | --- | --- |
| Judul lalu penjelasan | titik dua | `Tabel daftar: satu definisi kolom` |
| Anak kalimat lanjutan | koma | `Stok dihitung, bukan disimpan` |
| Kalimat baru | titik | `Angkanya snapshot. Layar wajib menyebut kapan diambil` |
| Sisipan | kurung | `punya overflow-x-auto (dan itu membuat sumbu Y ikut auto), jadi ...` |
| Pemisah antar nilai di UI | titik tengah `·` | `Kode · Supplier · Lot` |
| Rentang angka | `s/d` atau `sampai` | `10 s/d 20 kg` |

Tanda hubung biasa (`-`) tetap boleh untuk kata majemuk (`rata-rata`)
dan sebagai penanda "kosong" di sel tabel.

# Konfirmasi sebelum menyimpan

Setiap layar yang MENULIS data bertanya dulu lewat `components/ConfirmSave.tsx`,
baik saat menambah maupun mengubah. Form baru wajib ikut, jangan bikin dialog
sendiri dan jangan pakai `confirm()` bawaan browser (tampilannya lepas dari
aplikasi dan tidak bisa memuat ringkasan).

```tsx
const konfirmasi = useConfirmSave();

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (loading) return;

  const lanjut = await konfirmasi.minta({
    judul: isEdit ? "Simpan perubahan client ini?" : "Tambah client baru?",
    ringkasan: [{ label: "Company / Brand", nilai: company }],
  });
  if (!lanjut) return;

  setLoading(true);
  ...
}

<form onSubmit={handleSubmit}>… {konfirmasi.dialog}</form>
```

Empat aturan yang membuatnya berguna, bukan sekadar penghalang:

- **Panggil di dalam `handleSubmit`, bukan di `onClick` tombolnya.** Validasi
  bawaan browser (`required`) jalan sebelum `onSubmit`, jadi dialognya cuma
  muncul untuk form yang sudah sah. Membungkus tombolnya membalik urutan itu:
  user mengkonfirmasi dulu, baru diberi tahu ada kolom kosong.
- **Panggil SESUDAH validasi manual, SEBELUM `setLoading(true)`.** Kalau
  loading dinyalakan duluan, tombolnya berputar selama dialog terbuka dan
  tetap berputar sesudah user menekan Batal.
- **`ringkasan` diisi hal yang bisa dicek sekilas**: nama, nomor dokumen,
  jumlah baris, total rupiah. Dialog yang isinya cuma "Yakin?" dalam sebulan
  akan diklik tanpa dibaca, dan sesudah itu dia cuma menambah satu klik tanpa
  mencegah apa pun.
- **`nada: "bahaya"` khusus yang memotong stok atau tidak bisa dibatalkan**
  (produksi, retur, pemakaian bahan, penyesuaian stok, tutup opname, reject
  QC/QA). Kalau semua dialog merah, warnanya berhenti berarti apa-apa.

Pengecualian yang disengaja: panel yang SUDAH berupa dialog sendiri
(`OutletActions`, `ExpiryActions`, `PaymentPanel`, `CompanyToggle`,
`CancelTxButton`). Membuka dialog di atas dialog membuat tumpukan yang
membingungkan, dan panelnya sendiri sudah menuntut dua langkah sadar.

# State klien: tiga pola yang wajib diikuti

## Baca `localStorage` / `matchMedia` lewat `useSyncExternalStore`

Nilainya tidak ada di server, jadi tidak bisa dipakai sebagai initial
state biasa: server dan klien render beda dan hidrasinya bentrok.
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

## State yang bereaksi atas state lain: kerjakan di handler

Mengganti client di `InvoiceForm` harus mengisi ulang harga baris yang
belum disentuh user. Godaannya menaruh itu di `useEffect` yang mengawasi
`clientId`. Jangan. Sama seperti dua pola di atas: melanggar
`react-hooks/set-state-in-effect` dan menambah satu render sesudah layar
terlanjur dilukis. Kerjakan di `onChange`-nya (`gantiClient`).

Yang membuatnya benar bukan lokasinya saja, tapi **menandai baris yang
sudah disentuh user** (`hargaManual`). Tanpa itu, ganti client di tengah
pengisian akan menimpa angka yang sengaja dinegosiasikan.

# Batas server/klien di `lib/`

Sebagian file `lib/` meng-import `@/lib/supabase/server`. Mengambil NILAI
(bukan `type`) dari file seperti itu ke dalam komponen `"use client"` akan
menyeret klien Supabase sisi server ikut ke bundle browser.

Karena itu `lib/clientPrice.ts` ada terpisah dari `lib/salesOptions.ts`:
isinya cuma penghitung kunci dan tipe, tanpa import server, supaya
`InvoiceForm` dan `ConsignmentForm` bisa memakainya. Kalau butuh helper
kecil yang dipakai dua sisi, taruh di file sendiri yang bersih dari import
server. Jangan menambahkannya ke file yang sudah menyentuh database.

`import type { … }` dari file server tetap aman: tipe dihapus saat
kompilasi.

# PWA: boleh dipasang, tidak boleh menyimpan data

Aplikasinya bisa dipasang lewat Chrome (Install) maupun Add to Home Screen di
iOS. Empat berkas yang membentuknya:

| Berkas | Guna |
| --- | --- |
| `app/manifest.ts` | Terbit di `/manifest.webmanifest`, `<link rel="manifest">` disisipkan Next otomatis |
| `public/sw.js` | Service worker: syarat install di Chrome + jaring pengaman offline |
| `public/offline.html` | Layar "tidak ada koneksi", statis, tanpa data |
| `components/ServiceWorkerRegister.tsx` | Pendaftar sw.js, dipasang di root layout |

Ikonnya `public/icon-192.png`, `icon-512.png`, dan `icon-maskable-512.png`,
ketiganya hasil render `app/icon.svg`. Yang maskable punya latar penuh dengan
logo di 58% tengah, karena Android memotong ikon jadi lingkaran.

Empat aturan yang menentukan, dan semuanya gampang dilanggar tanpa sadar:

- **Service worker ini sengaja tidak menyimpan satu pun halaman.** Ini ERP
  multi-company di balik login: halaman yang tersimpan di disk akan terbaca
  lagi oleh orang berikutnya yang memakai komputer yang sama, dan angka stok
  yang basi lebih berbahaya daripada layar kosong. Yang boleh masuk cache cuma
  `/_next/static/*` (ber-hash, tidak mungkin basi untuk URL yang sama) dan
  `offline.html`. Kalau nanti tergoda menambah "offline mode" sungguhan,
  yang harus dijawab lebih dulu bukan soal teknis: bagaimana cache dibuang
  saat logout dan saat ganti organisasi.
- **`start_url` wajib `/`.** Alasannya persis sama dengan bab di bawah ini:
  user tanpa akses Dashboard akan terjebak di layar "Tidak Punya Akses" tiap
  kali membuka aplikasi dari home screen. Karena itu juga manifest-nya TIDAK
  punya `shortcuts`: tiap shortcut adalah halaman tetap, dan tidak ada satu
  pun modul yang pasti boleh dibuka semua orang.
- **`/manifest.webmanifest`, `/sw.js`, dan `/offline.html` harus ada di daftar
  kecuali `proxy.ts`.** Browser mengambil manifest tanpa cookie sama sekali,
  jadi kalau proxy ikut menjaganya yang diterima cuma redirect ke `/login`,
  dan tombol Install tidak pernah muncul. Gejalanya membingungkan karena
  aplikasinya sendiri jalan normal.
- **Di dev, service worker dicabut, bukan didaftarkan.** Service worker sisa
  `npm start` di localhost akan menyajikan chunk lama ke `npm run dev` di port
  yang sama, dan gejalanya menyesatkan: perubahan kode seperti tidak
  berpengaruh. Konsekuensinya, menguji tombol Install harus lewat
  `npm run build && npm start` atau di deploy Vercel, bukan `npm run dev`.

`theme_color` di manifest dan `viewport.themeColor` di `app/layout.tsx` adalah
angka yang sama (`#1E3327`) di dua tempat. Ubah dua-duanya.

# Hak akses modul: jangan pernah menuju halaman tetap

Hak akses per user disimpan di `profiles.allowed_modules`, dan
`lib/modules.ts` yang menerjemahkannya. Satu hal yang gampang dilupakan
dan sudah sekali menghasilkan jebakan: **Dashboard adalah modul biasa
yang bisa TIDAK diberikan.** Dia kebetulan yang pertama di daftar, bukan
halaman istimewa.

Karena itu **tidak boleh ada kode yang mengarahkan orang ke
`/dashboard`**, baik sesudah login, sebagai tombol "kembali", maupun
sebagai tujuan darurat. Yang benar `/` , dan `app/page.tsx` yang
menghitung tujuannya di server lewat `landingPath()`: modul pertama yang
boleh dibuka user itu menurut urutan `MODULES`.

Pelanggarannya menghasilkan kebuntuan, bukan sekadar layar jelek. Petugas
QC yang tidak punya akses dashboard dilempar ke sana sesudah login, kena
layar "Tidak Punya Akses", lalu menekan tombol yang mengarah balik ke
`/dashboard` dan kembali ke layar yang sama. Di HP sidebar sembunyi di
balik hamburger, jadi dia benar-benar terjebak.

Aturan turunannya:

- **Komponen klien tidak tahu hak akses siapa pun.** `error.tsx`,
  `AccessGuard`, halaman login: kalau butuh mengirim orang "pulang",
  kirim ke `/` dan biarkan server yang memutuskan.
- **`/notifications` adalah jaring pengaman, jaga tetap begitu.** Dia
  sengaja TIDAK terdaftar di `MODULES`, sehingga `canAccessModule`
  selalu meloloskannya dan setiap orang yang berhasil login pasti punya
  minimal satu halaman yang bisa dibuka. Menambahkannya ke `MODULES`
  akan membuat akun tanpa modul terkunci di luar tanpa jalan keluar.
- **Menambah modul baru cukup di `MODULES`.** Sidebar, penjaga akses,
  checklist di form Pengguna, dan perhitungan pendaratan semuanya
  membaca daftar yang sama.

# Known issue

**Sidebar berkedip lebar → sempit saat muat pertama.** Preferensi minimize
ada di `localStorage`, yang tidak terbaca di server, jadi HTML pertama
selalu dirender lebar lalu dikoreksi di klien. `useSyncExternalStore`
menghapus bentrok hidrasi dan render sesudah paint, tapi **tidak**
menghapus kedipannya. Perbaikan sebenarnya: pindahkan preferensi ke cookie
supaya server bisa merender lebar yang benar sejak awal. Belum dikerjakan.

**Menu Notifications tidak punya badge jumlah.** Itu yang biasanya membuat
notification center dipakai, tapi sidebar dirender di setiap halaman.
Badge berarti menjalankan tujuh query `lib/notifikasi.ts` di tiap navigasi.
Perbaikan sebenarnya: hitungan yang di-cache (materialized view atau cache
ber-TTL pendek), bukan query langsung. Belum dikerjakan.

**Retur atas faktur yang sudah Lunas belum jadi piutang balik.** Secara
akuntansi supplier jadi berhutang, tapi `receivings.total_retur` cuma
mengurangi tagihan yang tersisa dan berhenti di nol. RPC menolak retur
melebihi nilai faktur, jadi datanya tidak ngawur. Klaimnya saja yang harus
diurus di luar sistem. Butuh modul nota kredit / saldo supplier.

**Riwayat versi formula belum bisa dibandingkan.** Snapshot tiap kali
formula disimpan sudah ada di `activity_logs.perubahan`, tapi belum ada
layar yang menampilkan dua versi berdampingan.

**`activity_logs` tumbuh cepat dari import CSV.** Satu baris log per item
yang diimpor. Itu perilaku yang benar untuk audit trail; kalau tabelnya
jadi berat, jawabannya kebijakan retensi, bukan mengurangi trigger.

**Koreksi stok produk jadi cuma bisa lahir dari opname.**
`finished_goods_adjustments` tidak punya layar buat/hapus sendiri, dan
opname yang sudah ditutup tidak bisa dibatalkan. Jadi koreksi yang salah
hanya bisa diluruskan lewat opname berikutnya, bukan dibatalkan. Itu
cukup untuk sekarang dan aman untuk audit, tapi kalau nanti dibuat layar
manual, pembatalannya harus ikut dipikirkan.

**Satuan baris produk jadi di lembar opname di-hardcode `pcs`.** Produk
jadi tidak menyimpan satuan jual per varian, jadi lembar hitung dan layar
opname menuliskan `pcs`. Angkanya benar, labelnya yang bisa menyesatkan
kalau ada produk yang dihitung dalam satuan lain.
