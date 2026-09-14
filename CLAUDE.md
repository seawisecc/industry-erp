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
| `20260817_client_discounts` | `save_client_prices_tx` | Diperluas: baris boleh berisi harga saja, diskon saja, atau dua-duanya |
| | `log_client_price_change` | Snapshot audit ikut memuat `diskon_persen` |
| `20260818_tax_mode` | `invoice_tax_calc` | **Satu-satunya** rumus diskon & PPN di sisi SQL: dua model harga + DPP Nilai Lain |
| | `org_tax_mode` | Model harga yang berlaku di satu organisasi |
| | `org_tax_dpp_nilai_lain` | Aturan DPP yang berlaku di satu organisasi |
| | `set_invoice_tax_mode` | Trigger BEFORE INSERT: membekukan model pajak di tiap invoice |
| | `report_outlet_sale_tx` | Diperluas: totalnya lewat `invoice_tax_calc` |
| | `report_consignment_sale_tx` | Diperluas: totalnya lewat `invoice_tax_calc` |
| `20260820_consignment_sale_lines` | `consignment_take` | Diganti tipe kembaliannya jadi `jsonb`: harga **+** pembagian FIFO-nya |
| | `report_outlet_sale_tx` | Diperluas: menulis `consignment_sale_lines` |
| | `report_consignment_sale_tx` | Diperluas: menulis `consignment_sale_lines` |
| | `retur_outlet_tx` | Menyesuaikan bentuk kembalian `consignment_take` |
| | `cancel_invoice_tx` | Diperluas: invoice konsinyasi mengembalikan qty ke pengiriman asalnya |
| `20260821_opname_varian_yatim` | `create_stock_opname_tx` | Diperluas: lembar opname produk jadi berhenti memuat varian yatim yang stoknya nol |
| `20260822_purchase_tax_mode` | `sync_supplier_tax_mode` | Trigger: bawaan pajak supplier ikut dokumen terakhir |
| | `update_po_tx` | Diperluas: ikut menulis `tax_mode` & `tax_dpp_nilai_lain` |
| | `create_receiving_tx` | Diperluas: total lewat `invoice_tax_calc`, HPP batch disimpan tanpa pajak |
| | `create_purchase_return_tx` | Diperluas: nilai retur ikut model faktur, baris dinilai `harga_faktur` |
| `20260823_rnd_formulas` | `rnd_tulis_baris` | Penulis baris anak formula, dipakai bersama alur simpan & salin-revisi |
| | `save_rnd_formula_tx` | Buat formula baru (+ penomoran) atau ganti seluruh isinya |
| | `save_rnd_result_tx` | Catatan hasil develop + hasil uji per parameter, Draft naik jadi Trial |
| | `revise_rnd_formula_tx` | Salin formula jadi versi berikutnya, nomor turunan dari INDUK |
| | `approve_rnd_formula_tx` | Tandai formula yang berlaku, versi lama turun jadi Arsip |
| | `delete_rnd_formula_tx` | Hapus percobaan yang batal, tolak yang punya turunan |
| `20260824_rnd_material_source` | `rnd_tulis_baris` | Diperluas: baris formula & kemasan menunjuk `material_id` ATAU `item_id` |
| | `save_rnd_formula_tx` | Diperluas: kunci bahan dobel dihitung dari material dulu, baru item |
| | `revise_rnd_formula_tx` | Diperluas: ikut menyalin kolom sumber yang baru |
| `20260825_material_harga_moq` | (tanpa RPC) | `materials.harga_referensi` & `materials.moq`, plus backfill MOQ dari item yang ter-link |
| `20260826_material_inci_import` | `import_material_inci_tx` | Import CSV komposisi INCI: ganti utuh komposisi tiap material yang disebut di file, material lain tidak disentuh |
| `20260827_receiving_biaya_kirim` | `create_receiving_tx` | Diperluas: diskon faktur (mengurangi DPP) & biaya kirim (di luar pajak) |
| `20260828_po_status_urut` | (tanpa RPC) | `purchase_orders.status_urut`, kolom generated untuk urutan bawaan daftar PO |
| `20260829_kirim_ke_hpp` | `create_receiving_tx` | Diperluas: opsi biaya kirim ikut dibebankan ke HPP batch |

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

# Jam di layar & di kertas: `lib/dates.ts`, bukan `toLocaleTimeString`

Aturannya perpanjangan dari `localDateStr`, tapi jamnya jauh lebih
gampang lolos karena angkanya tetap kelihatan wajar. Komponen SERVER
yang menulis `new Date(iso).toLocaleTimeString("id-ID", ...)` tanpa
`timeZone` mencetak jam UTC.

Itu sudah sampai ke kertas. Batch record produksi mencetak jam mulai &
selesai tiap langkah, dan langkah yang dikerjakan **09.04 WITA tercetak
01.04**. Tidak ada error, tidak ada tanda tanya, cuma delapan jam
meleset, di dokumen CPKB yang ditandatangani operator. Yang membuatnya
tidak ketahuan berbulan-bulan: layar Execution yang mencatat jamnya
adalah komponen KLIEN, jadi di situ angkanya benar. Salah satu dari dua
sisi benar adalah kondisi terburuk, karena orang yang mengisi tidak
pernah melihat angka yang salah.

| Fungsi di `lib/dates.ts` | Keluaran |
| --- | --- |
| `localTimeStr(iso)` | `09:04` |
| `localDateTimeStr(iso)` | `3 Sep 2026, 09:04` |

Dua hal yang menentukan bentuknya:

- **Pemisahnya titik dua, bukan titik.** `id-ID` memakai titik
  (`09.04`), dan di sebelah kolom angka lain itu terbaca seperti
  bilangan desimal. Jam 24 dipaksa lewat `hourCycle: "h23"`, jadi tidak
  pernah ada AM/PM yang harus ditebak.
- **Klien pun memakainya.** `lib/dates.ts` bersih dari import server,
  jadi `ExecuteForm` ikut memanggilnya. Jam yang dilihat operator waktu
  menekan Mulai wajib sama persis dengan yang tercetak, dan zona browser
  tidak menjamin itu.

Kalau menambah layar yang memuat jam, pakai kedua fungsi itu. Halaman
cetak yang sudah benar sejak awal (`label`, `nota`) memakai
`Intl.DateTimeFormat` ber-`timeZone: APP_TIMEZONE` sendiri; itu boleh
tetap, yang tidak boleh cuma `toLocaleTimeString` telanjang.

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

## Nama varian adalah kunci stok, jadi tidak boleh diganti diam-diam

Stok produk jadi menempel pada NAMA variannya: tiap mutasi (produksi,
konsinyasi, penjualan, koreksi opname) menyimpan `varian_ukuran` sebagai
teks, bukan foreign key ke `product_variants`. Konsekuensinya keras dan
tidak kelihatan waktu terjadi: **mengganti nama varian tidak memindahkan
stoknya.** Stok lama tetap terhitung ada, tapi kehilangan pasangannya di
master, jadi tidak punya harga jual dan tidak bisa dijual.

Ini bukan skenario karangan. Pernah terjadi ke tujuh produk sekaligus:
opname dibuat saat varian bernama `250 ml`, tiga belas menit kemudian
produknya disunting jadi `220 ml`, lalu opname ditutup dan menulis
koreksinya ke nama lama. Ketahuannya berminggu-minggu kemudian waktu
harga tidak mau terisi di form konsinyasi.

Penjaganya di `updateProduct` (`assertVarianBerstokTidakHilang`), BUKAN
cuma di layar: alurnya bisa dipanggil dari mana saja dan kerusakannya
tidak menimbulkan error apa pun saat terjadi. Dia menolak simpan kalau
ada varian yang stoknya bukan nol hilang dari daftar. Dipanggil SEBELUM
tulisan pertama, karena `supabase-js` tidak punya transaksi dan penjaga
di tengah akan meninggalkan header produk yang sudah terlanjur berubah.

Jalan keluarnya sengaja tiga langkah, dan itu yang ditulis di pesan
errornya: tambah varian baru tanpa menghapus yang lama, pindahkan stoknya
lewat Stock Opname produk jadi, baru hapus varian lamanya. Semuanya lewat
dokumen yang tercatat, tidak ada perpindahan stok yang lahir diam-diam
dari penyuntingan master.

**Varian lama yang stoknya sudah habis boleh dihapus**, memang begitu
cara membersihkannya. Dia juga tidak lagi muncul sebagai pilihan di form
penjualan (`getSalesOptions` menyaringnya), karena baris tanpa harga yang
namanya mirip dengan varian yang benar cuma jadi jebakan salah pilih.

**Di Finished Goods, varian yatim yang SELURUH kolomnya nol
disembunyikan.** Perpindahan stok lewat opname meninggalkan sepasang
koreksi di nama lama (`+462` waktu stok awal dicatat, `-462` waktu
dipindahkan), jadi nama lamanya tetap punya baris di `fg_stock_calc`
walau tidak ada barangnya. Di DNAlab itu tujuh baris tanpa harga, persis
jebakan salah pilih yang sama.

Syaratnya sengaja SELURUH kolom nol, bukan cuma `tersedia = 0`. Varian
yatim yang pernah diproduksi lalu habis terjual tetap tampil: angkanya
nol tapi riwayatnya tidak, dan varian yatim yang punya mutasi adalah
gejala nama yang diganti saat stoknya masih jalan, hal yang justru tidak
boleh hilang diam-diam dari layar. Yang disembunyikan tetap bisa dilihat
lewat filter "Tampilkan varian yatim", dan jumlahnya ditulis di bawah
kotak cari supaya tidak ada baris yang lenyap tanpa keterangan.

**Lembar Stock Opname memakai syarat yang lebih ketat: `available <> 0`.**
Bedanya disengaja, karena kedua layar menjawab pertanyaan yang berbeda.
Finished Goods menjawab "apa riwayatnya", jadi varian yatim yang pernah
bergerak tetap tampil. Lembar opname menjawab "apa yang harus dihitung
di gudang", dan di situ nama yang tidak ada barangnya bukan cuma
mubazir: lembarnya dipakai sambil memegang barang, dan dua baris
`250 ml` dan `220 ml` untuk produk yang sama adalah undangan salah
tulis yang baru ketahuan sesudah opname ditutup dan koreksinya
terlanjur jadi stok.

Varian yatim yang stoknya BELUM nol tetap ikut, termasuk yang minus:
itu justru barang yang perlu diluruskan, dan opname adalah satu-satunya
pintu untuk meluruskannya. Aturannya ada di dua tempat yang harus
bergerak bersamaan, `create_stock_opname_tx` (20260821) dan perkiraan
jumlah baris di layar Opname Baru. Perkiraan yang meleset dari jumlah
baris yang benar-benar terbentuk membuat orang mengira ada item yang
tidak ikut terhitung.

**Opname yang sudah ditutup tidak pernah disentuh.** Barisnya adalah
potret stok pada hari itu, bukan daftar yang boleh dirapikan
belakangan.

**Penyaring baris dipasang SEBELUM cabang pencarian, bukan di dalam
salah satunya.** Bentuk halaman yang datanya utuh di memori adalah
`const cocok = needle ? sumber.filter(...) : sumber`, dan versi pertama
penyaring varian yatim ini cuma mengganti `sumber` di cabang pencarian.
Akibatnya keterangan "7 varian disembunyikan" muncul, hitungannya tetap
40, dan barisnya tetap ada, tapi begitu kotak cari diisi filternya
mendadak jalan. Layar yang mengaku sudah menyaring padahal belum lebih
buruk daripada layar yang tidak menyaring sama sekali: yang pertama
membuat orang berhenti curiga.

Konsekuensinya kalau menambah jalur keluar-masuk produk jadi yang baru:
tambahkan sebagai `union all` di `fg_stock_calc`, lalu cerminkan di
fallback `lib/salesStock.ts`. Jangan menambahkan penyesuaian di pemanggil.

# Harga & MOQ di master Material: yang nyata menang atas yang diketik

Harga bahan dulu cuma lahir dari pembelian
(`purchase_batches.harga_per_unit`). Itu benar untuk biaya, tapi
meninggalkan lubang persis di tempat R&D bekerja: bahan yang BELUM
PERNAH DIBELI tidak punya harga sama sekali, jadi perkiraan biaya
formula menghitungnya sebagai nol. Formula yang setengah bahannya belum
pernah dibeli akan tampak murah, dan angka itulah yang dipakai menyusun
penawaran.

Karena itu `materials` punya dua kolom sendiri, `harga_referensi` dan
`moq`. Aturan pakainya satu kalimat:

| Angka | Yang dipakai sistem |
| --- | --- |
| harga | pembelian terakhir; kalau belum pernah dibeli baru `materials.harga_referensi` |
| MOQ | `items.moq` kalau materialnya sudah punya item; kalau belum baru `materials.moq` |

Dua urutan itu kelihatan sama tapi alasannya berbeda, dan bedanya perlu
diingat waktu menambah pembaca baru:

- **Harga**: dua angkanya beda JENIS. Yang satu fakta (uang yang
  benar-benar keluar), yang satu tebakan manusia dari penawaran
  supplier. Fakta menang, selalu.
- **MOQ**: dua-duanya angka ketikan. Yang menang `items.moq` bukan
  karena lebih benar, tapi karena dialah yang benar-benar dipakai PPIC
  Planner, Guide Order, dan validasi qty di `createPO`. Kalau yang
  dipakai penjaga berbeda dengan yang tampil di master, orang akan
  membetulkan angka yang salah.

## `harga_referensi` TIDAK PERNAH jadi HPP

Ini batas yang tidak boleh dilanggar. HPP tetap cuma dari
`harga_per_unit` seperti yang tertulis di bab Dua harga per batch.
`harga_referensi` berhenti di perkiraan biaya R&D dan di kolom harga
acuan layar Materials.

Kalau dia sampai bocor ke biaya produksi atau nilai stok, yang terjadi
persis bug terburuk yang dijaga di seluruh dokumen ini: angka di layar
berbeda dengan angka yang dihitung ulang sistem, dan kali ini
sumbernya angka yang diketik orang berbulan-bulan lalu dari penawaran
yang sudah kedaluwarsa.

**Disimpan TANPA PPN**, sama seperti `harga_per_unit`. Penawaran
supplier sering sudah memuat PPN, dan menyalinnya bulat-bulat membuat
perkiraan biaya menggelembung sekitar 11% tanpa ada yang menyadarinya.
Kalimat itu ditulis di bawah kolomnya, bukan cuma di sini.

## Kolom yang tidak berlaku harus MENGATAKAN dirinya tidak berlaku

Konsekuensi yang paling gampang dilanggar. Begitu sebuah material sudah
pernah dibeli, `harga_referensi` berhenti dipakai; begitu materialnya
punya item, `materials.moq` berhenti dipakai. Kolomnya tetap bisa
diketik, dan kolom yang bisa diketik tapi tidak berpengaruh apa-apa
adalah bentuk kebohongan layar yang paling sering terjadi.

Karena itu form Material selalu menulis satu baris "Berlaku sekarang"
di bawah kedua kolom itu: angka mana yang dipakai, dari mana asalnya,
dan di mana mengubahnya. Nilainya dihitung di server (`BerlakuSekarang`
di `MaterialForm.tsx`), bukan ditebak di klien, karena harga terakhir
cuma ada di `purchase_batches`.

Layar daftar Materials menulis hal yang sama dengan cara lebih pendek:
harga yang berasal dari referensi diberi keterangan kecil "harga
referensi" di bawah angkanya. Tanpa itu, dua baris yang tampak sama
sebenarnya satu fakta dan satu tebakan.

**Kolom Harga Acuan di daftar Materials tidak dapat tombol urut**,
alasan yang sama dengan "Harga Terakhir" di Stock Items: angkanya lahir
dari query kedua yang cuma mengambil baris halaman ini.

## Rumus MOQ cuma ada di `lib/moq.ts`

Aturannya satu kalimat, "qty pesan harus minimal MOQ dan kelipatannya",
tapi dia hidup di LIMA tempat: PPIC Planner, Guide Order (saran qty
sekaligus penjaganya), validasi `createPO` di server, dan simulasi
produksi di R&D. Sebelum file ini ada, rumusnya disalin di tiap tempat.

Yang berbahaya bukan barisnya panjang, melainkan `- 1e-9` di dalamnya.
Toleransi galat float itu gampang ikut hilang waktu disalin, dan
tanpanya kebutuhan yang lahir dari perkalian persen (mis.
`24,999999999999996`) dibulatkan ke atas jadi DUA KALI MOQ. PO terbit
dua kali lipat dari yang dimaui, dan tidak ada error apa pun.

| Fungsi | Guna |
| --- | --- |
| `bulatkanMoq(kurang, moq)` | qty yang harus dipesan supaya menutupi kekurangan sekaligus memenuhi MOQ |
| `periksaMoq(qty, moq)` | alasan pelanggaran (`minimum` / `kelipatan`), null bila sah |
| `adaMoq(moq)` | MOQ-nya benar-benar berlaku, bukan null atau nol |

`periksaMoq` mengembalikan ALASANNYA, bukan boolean, karena dua
pelanggarannya diperbaiki dengan cara yang berbeda: "belum sampai
minimum" dan "bukan kelipatan" butuh kalimat yang berbeda di layar.

File ini bersih dari import server, dan itu bukan kebetulan: penjaga di
layar (Guide Order) dan penjaga di server action (`createPO`) memakai
fungsi yang sama persis. Kalau tidak, form bisa mengizinkan qty yang
ditolak server, atau sebaliknya menolak qty yang sebenarnya sah.

## MOQ ikut turun waktu material didaftarkan jadi item

`createItemsFromMaterials` menyalin `materials.moq` ke `items.moq`.
MOQ adalah syarat SUPPLIER yang biasanya sudah diketahui sejak
penawaran pertama, jauh sebelum barangnya masuk gudang, dan mengetiknya
ulang di layar pembuatan item cuma menambah kesempatan meleset.

Sesudah itu `items.moq` yang berlaku, dan form Material bilang begitu.
Migrasi `20260825` ikut mem-backfill arah sebaliknya sekali (item yang
MOQ-nya sudah diisi lama disalin ke materialnya) supaya kolomnya tidak
tampil kosong di hari pertama dan terlihat seperti data yang hilang.

## Nama & kode material turun ke item stoknya, tapi berhenti kalau gudang sudah menamai sendiri

Ganti nama bahan baku AMAN, kebalikan dari nama varian produk jadi: tiap
mutasi bahan (`purchase_batches`, `po_items`, `material_issue_items`,
`stock_opname_items`, `execution_data.bahan`) menyimpan `item_id`, bukan
teks namanya. Nama dibaca lewat join saat layar dibuka, jadi PO tahun
lalu ikut menampilkan nama baru dan tidak ada satu angka pun yang
bergerak. Yang tidak ikut berubah cuma kertas yang sudah tercetak, sama
seperti nomor batch yang dibetulkan.

Karena aman, `updateMaterial` menurunkan kode DAN nama ke item stok yang
ter-link. Sebelumnya cuma kodenya, dan akibatnya bahan yang sama bisa
bernama `Cetiol CC` di R&D lalu `Cetyl Ethylhexanoate` di gudang tanpa
error apa pun: dua nama untuk satu barang, yaitu undangan salah pilih di
form PO dan di lembar opname yang baru ketahuan sesudah stoknya bergerak.

**Nama berhenti ikut begitu item stoknya dinamai sendiri.** Kolomnya di
form Stock Items memang berlabel "nama sehari-hari di gudang": tradename
katalog supplier boleh panjang dan penuh kode, dan orang gudang berhak
memendekkannya. Menimpanya tiap kali ada orang menyunting materialnya,
bahkan cuma untuk mengganti MOQ, akan menghapus keputusan yang sengaja
dibuat, diam-diam. Polanya sama dengan `hargaManual` di `InvoiceForm`
dan `taxManual` di `POForm`: isian otomatis berhenti begitu manusia
menyentuhnya. Pembandingnya nama item dengan tradename LAMA, bukan yang
baru diketik, karena yang ditanya adalah "item ini masih ikut materialnya
atau sudah dinamai sendiri".

KODE tetap selalu ikut, dan itu memang sudah begitu sejak awal: satu
penomoran material = item.

Dua hal yang menjaganya tetap jujur:

- **Penjaga nama dobel jalan SEBELUM tulisan pertama.** `items.nama`
  wajib unik di satu organisasi, aturan yang sama dengan form Stock
  Items. `supabase-js` tidak punya transaksi, jadi penjaga di tengah
  akan meninggalkan material yang sudah terlanjur berganti nama
  sementara itemnya tidak, yaitu persis keadaan yang mau dihapus.
  Alasan yang sama dengan `assertVarianBerstokTidakHilang`.
- **Form dan dialog konfirmasinya mengatakan akibatnya.** Kolom yang
  menulis ke layar LAIN harus menyebut itu, alasan yang sama dengan
  baris "Berlaku sekarang" di bawah harga & MOQ. Kalau item stoknya
  sudah punya nama sendiri, keterangannya menyebutkan nama itu apa
  adanya, supaya perbedaan yang sengaja dibuat tidak terbaca seperti
  sinkronisasi yang rusak.

Arah sebaliknya TIDAK disinkronkan: mengganti nama di Stock Items tidak
mengubah `materials.tradename`. Itu memang maksudnya, karena nama gudang
boleh berbeda; sesudah itu materialnya berhenti menurunkan nama ke sana.

# R&D Formulation: satu baris per versi, bukan satu baris yang disunting

Formula lahir jauh sebelum produknya ada, dan selama ini seluruh
siklusnya hidup di spreadsheet pribadi. Yang hilang di situ bukan
filenya, melainkan JEJAK PERUBAHAN. Waktu satu batch bermasalah,
pertanyaan pertama selalu "formula versi berapa yang dipakai", dan
jawabannya harus bisa ditunjukkan, bukan diingat.

Karena itu revisi TIDAK menimpa formula sebelumnya. Tiap revisi adalah
baris baru yang menunjuk induknya, dengan nomor turunan:

```
RND.202609001        formula asli
RND.202609001-R1     revisi pertama
RND.202609001-R2     revisi kedua
```

Nomornya selalu turunan dari INDUK, bukan dari baris yang disalin, jadi
merevisi `-R2` menghasilkan `-R3`, bukan `-R2-R1`. Penomoran induknya
`RND.YYYYMM` + 3 digit, dan yang membuat revisi tidak ikut terbaca
sebagai urutan induk cuma satu baris: penjaga `~ '^\d+$'` di
`save_rnd_formula_tx`. Ini persis jebakan `substring` yang sudah
tercatat di bab Jebakan Postgres.

## Empat status, dua di antaranya membekukan

| Status | Artinya |
| --- | --- |
| `Draft` | baru disusun, belum turun ke lab |
| `Trial` | hasil percobaan sudah mulai dicatat |
| `Disetujui` | formula yang dipakai. DIBEKUKAN |
| `Arsip` | versi yang dulu disetujui lalu digantikan revisi. DIBEKUKAN |

**Yang membekukan bukan kerapian.** Nomor formula yang disetujui akan
ditulis di dokumen produksi, dan angka yang ditunjuk nomor itu tidak
boleh bergerak sesudahnya. Alasannya sama dengan opname yang sudah
ditutup: barisnya potret keputusan pada hari itu, bukan daftar yang
boleh dirapikan belakangan. Penjaganya di DUA sisi seperti biasa,
`save_rnd_formula_tx` menolak, dan halaman edit menolak membuka
formnya, karena layar edit yang tetap terbuka cuma membuat orang
mengetik ulang formula lalu ditolak di ujung.

**Satu versi Disetujui per silsilah.** `approve_rnd_formula_tx`
menurunkan versi yang tadinya disetujui jadi `Arsip` di transaksi yang
sama. Dua versi berstatus Disetujui berarti tidak ada yang tahu mana
yang dipakai produksi, yaitu persis keadaan yang mau dihilangkan.
Akibat itu menyentuh dokumen LAIN yang sedang tidak dilihat orang, jadi
kalimatnya ditulis di dialog konfirmasinya, bukan cuma di sini.

**Hasil uji tidak ikut disalin waktu revisi.** Angka pH milik percobaan
kemarin, dan membawanya ke lembar percobaan berikutnya adalah cara
paling gampang membuat orang lupa mengisinya.

## Modul ini tidak menulis apa pun ke stok

Tidak ada satu pun alur di sini yang memotong `purchase_batches`,
menambah batch, atau menerbitkan dokumen bernilai. Formula, takaran
trial, biaya, dan simulasi produksi semuanya hitungan di layar. Yang
menggerakkan stok tetap tiga pintu yang sudah ada: produksi, Material
Issue, dan Stock Opname.

Konsekuensinya untuk bahan yang benar-benar terpakai saat trial:
**pencatatannya tetap lewat Material Issue bertujuan R&D, apa adanya
seperti sekarang**, dan dokumen itu sengaja TIDAK dihubungkan ke
formula mana pun. Menghubungkannya terdengar rapi, tapi berarti satu
kolom baru di `material_issues`, satu pilihan wajib di formnya, dan
satu lagi keputusan yang harus diingat operator gudang untuk angka yang
belum tentu dibaca siapa pun.

Aturan ini yang membuat modul RND aman dipakai bereksperimen: formula
boleh disusun, dibuang, direvisi berkali-kali tanpa satu pun akibat ke
pembukuan. Kalau nanti ada yang tergoda menambahkan alur yang memotong
stok dari sini, yang harus dijawab lebih dulu bukan soal teknis
melainkan pembatalannya, dan itu persis pelajaran yang sudah dibayar di
`finished_goods_adjustments`.

## Persentase ditafsirkan sama dengan `product_formulas`

`qty bahan = % x massa ruahan`, dalam satuan item itu sendiri. Modul
produksi sudah memakai konvensi itu (`PlanForm` menghitung
`qty = (percentage / 100) * bulkKg`), jadi biaya yang muncul di layar
R&D memakai angka yang sama dengan yang nanti benar-benar terpotong.
Kalau konvensi itu berubah, `lib/rndCost.ts` ikut berubah.

Ruahannya dihitung dari gramasi produk: `1.000 pcs x 100 g = 100 kg`.
Batch trial disimpan terpisah dalam GRAM (`trial_gram`), karena lab
bekerja dengan timbangan analitik dan produksi bekerja dengan kg.

**Biaya per pcs sengaja `null` selama gramasi belum diisi, bukan nol.**
Nol terbaca sebagai "produk ini gratis", dan itu angka yang bisa
terbawa ke penawaran harga.

## Harganya perkiraan, dan layarnya wajib mengatakan itu

Yang dipakai `purchase_batches.harga_per_unit` terakhir, yaitu HPP tanpa
pajak, angka yang sama yang dibaca PPIC Planner. Biaya sebenarnya baru
lahir di `create_production` yang memotong FEFO lot per lot. Jadi yang
di sini bukan HPP, melainkan pembanding untuk memutuskan apakah sebuah
formula masuk akal sebelum ada satu batch pun.

Bahan yang belum pernah dibeli jatuh ke `materials.harga_referensi`
(lihat bab Harga & MOQ di master Material). Angka itu ketikan manusia,
jadi layar WAJIB menandainya: pemilih bahan menulis `(referensi)` di
ekor harganya, tabel formula dan tabel kebutuhan menulis "harga
referensi" di bawah angkanya. Dua baris yang tampak sama padahal satu
fakta dan satu tebakan adalah kelalaian yang paling gampang lolos di
modul ini.

**Bahan yang tidak punya acuan harga sama sekali dihitung NOL, dan
kalimatnya ditulis di panel biaya** lengkap dengan nama bahannya serta
saran mengisi Harga Referensi di menu Materials. Menyembunyikannya akan
membuat formula yang setengah bahannya belum berharga tampak murah, dan
angka itu yang dipakai menyusun penawaran.

Peringatan kekurangan stok di tab Biaya memakai komponen yang SAMA
dengan alur produksi (`StokKurangAlert`) dan pembanding yang sama
(`purchase_batches.qty_sisa`). Dua layar yang menjawab pertanyaan yang
sama dengan angka berbeda adalah cara tercepat membuat orang berhenti
percaya pada dua-duanya.

**Kemasan yang tidak menunjuk master apa pun tidak ikut dicek stoknya.**
Baris kemasan boleh cuma berisi nama ketikan, dan yang seperti itu tidak
punya identitas yang bisa dilacak ke mana pun. Menghitungnya sebagai
stok nol akan memunculkan "kurang" untuk barang yang memang belum pernah
ada, jadi namanya disebut terpisah di bawah tabel.

## Bahannya dari `materials`, BUKAN `items`

Ini yang paling gampang salah, dan versi pertama modul ini memang
salah. `items` isinya barang yang sudah punya tempat di gudang.
Pekerjaan R&D dimulai sebelum itu: formulator menjajaki bahan dari
katalog supplier, memasukkannya ke formula, baru memutuskan mau
diadakan atau tidak.

Akibat memakai `items` bukan sekadar merepotkan. Bahan yang belum
pernah dibeli TIDAK ADA di sana, jadi satu-satunya jalan memasukkannya
ke formula adalah membuat item stok palsu lebih dulu, dan item palsu
itu langsung ikut muncul di lembar Stock Opname, di PPIC, dan di
laporan nilai stok, sebagai barang bersaldo nol yang tidak pernah ada.

Master yang benar `materials`: di situ ada kode, tradename, supplier,
dan komposisi INCI-nya, dan barisnya boleh ada tanpa `item_id`, yang
artinya persis "belum diadakan".

**Satu baris formula menunjuk SATU hal saja**, `material_id` ATAU
`item_id`, dijaga constraint `num_nonnulls(...) = 1`. Bahan dari master
material disimpan sebagai `material_id`, dan kaitannya ke stok DIBACA
saat diperlukan lewat `materials.item_id`.

Itu bukan kerapian. Kalau `item_id` ikut disalin waktu formula
disimpan, material yang BARU diadakan bulan depan tidak akan pernah
nyambung ke formula yang sudah tersimpan, dan layar biaya terus bilang
"belum pernah dibeli" untuk barang yang sudah ada di gudang. Satu
sumber kebenaran, dibaca saat dipakai; pelajarannya sama dengan
`fg_stock_calc`.

**Item stok yang tidak punya baris material tetap ikut di daftar.**
Tidak semua item lahir dari `materials` (ada yang dibuat langsung lewat
menu Stock Items), dan tanpa ini bahan yang kemarin bisa dipilih akan
hilang dari layar tanpa keterangan. Itulah kenapa `item_id` masih ada
di tabelnya.

**Unique index-nya PARSIAL, dua buah.** Di Postgres dua NULL tidak
dianggap sama, jadi satu index gabungan atas `(formula_id, material_id,
item_id)` akan meloloskan bahan yang sama dimasukkan berkali-kali
begitu salah satu kolomnya null. Alasan yang sama membuat pemeriksaan
bahan dobel di `save_rnd_formula_tx` memakai
`coalesce(material_id, item_id)` sebagai kunci: tanpa itu, satu bahan
bisa masuk dua kali selama yang satu dipilih dari master material dan
satunya dari item stok, dan totalnya jadi dobel tanpa ada yang menolak.

**Bahan tanpa item stok belum punya satuan tersimpan**, jadi bawaannya
disamakan dengan yang dipakai layar "Tambah Item dari Material":
`kg` untuk bahan baku, `pcs` untuk kemasan. Menebak yang lain akan
membuat angka di lembar kerja berubah satuan begitu materialnya
benar-benar diadakan.

**Item TIDAK disaring `aktif = true`.** Alasannya dua, dan dua-duanya
berlaku: yang sama dengan layar produksi (bahan yang dinonaktifkan
setelah formulanya dibuat akan terbaca stok nol), ditambah alasan khas
R&D, yaitu bahan yang sudah lama tidak dibeli justru sering yang
dijajaki.

## Dua label kuning, dan bedanya menentukan tindakan

Bahan yang belum bisa dipakai punya DUA sebab yang berbeda, dan
`ketersediaanBahan()` di `lib/rndCost.ts` yang membedakannya:

| Keadaan | Label | Jalan keluarnya |
| --- | --- | --- |
| tidak punya `item_id` | **Belum dimiliki** | daftarkan dulu lewat Stock Items, Tambah Item dari Material |
| punya item, `harga` null | **Belum pernah dibeli** | tinggal dibelikan lewat PO seperti biasa |

Satu label untuk dua-duanya akan membuat orang mencari barangnya di
PPIC untuk bahan yang bahkan belum punya baris di gudang, dan
sebaliknya menyangka bahan yang sudah terdaftar perlu didaftarkan
ulang. Dua pekerjaan yang berbeda tidak boleh berbagi satu kalimat.

Pil-nya satu komponen, `app/(app)/rnd/BahanStatus.tsx`, dipakai pemilih
di form, tabel formula, dan tabel kebutuhan produksi. Bahan yang sama
harus terbaca sama di ketiganya: pil yang bunyinya beda antar layar
membuat orang mengira keadaannya memang beda. Teks panjangnya
(`title`) datang dari `LABEL_KETERSEDIAAN`, sumber yang sama yang
dipakai peringatan di tab Biaya dan keterangan di lembar kerja lab.

**Stok yang sedang nol TIDAK dapat label.** Angka stoknya sudah
tertulis apa adanya di sebelahnya, dan pil ketiga membuat dua yang di
atas berhenti menarik perhatian. Menyusun formula dengan bahan yang
kebetulan sedang habis juga hal yang wajar.

**Lembar kerja lab ikut mencetaknya**, sebagai teks biasa di ekor nama
bahan, bukan pil berwarna. Orang yang membawa lembar itu ke lab harus
tahu bahan mana yang memang belum ada di gedung sebelum mulai
menimbang, bukan sesudah membuka lemari.

## "Belum punya item stok" bukan "kurang"

Konsekuensi yang harus dijaga di layar Biaya & Produksi: bahan yang
belum pernah diadakan tidak punya stok untuk dibandingkan, jadi
`kebutuhanProduksi` memisahkannya ke `belumAdaStok`, bukan
memasukkannya ke `perItem` dengan stok nol.

Bedanya bukan kosmetik, karena tindakannya berbeda. Yang di `perItem`
tinggal dibelikan lagi lewat PPIC. Yang di `belumAdaStok` harus
DIDAFTARKAN dulu jadi item sebelum bisa dibeli sama sekali, dan
kalimat "kurang 12 kg" salah alamat untuk barang yang bahkan belum
punya tempat di gudang. Karena itu peringatannya sendiri, warnanya
sendiri, dan tautannya ke `/items/from-material`, bukan ke PPIC.

Kemasan yang tidak menunjuk master apa pun (cuma nama ketikan) tidak
ikut dicek sama sekali: dia tidak punya identitas yang bisa dilacak.
Namanya tetap disebut di bawah tabel supaya tidak disangka tersedia.

## Spek target diambil dari master parameter QC produk jadi

`specBawaan()` di `lib/rnd.ts` membungkus `PARAM_STANDAR.produk_jadi`,
BUKAN daftar baru. Spek yang ditargetkan R&D adalah spek yang nanti
diuji QC; dua daftar yang berbeda berarti formula lulus di lab R&D lalu
ditolak QC karena parameternya memang tidak pernah sama.

## Izin: `can_plan_production`, bukan kolom baru

Formula yang disetujui adalah yang nanti diturunkan jadi instruksi
produksi, jadi orang yang berhak menetapkan instruksi itu juga yang
berhak menyatakan formulanya sudah jadi. Menambah izin sendiri berarti
satu checklist lagi di form Pengguna yang harus diingat Admin, untuk
keputusan yang pemegangnya sama persis. Penghapusan pakai `can_cancel`.

## Lembar kerja lab mencetak takaran, opname sengaja tidak

`/print/rnd/[id]` mencetak takaran TEORITIS tiap bahan untuk satu batch
trial, dengan kolom kosong di sebelahnya untuk timbangan aktual.

Namanya dikunci dan dipakai sama di tiga tempat, form develop, tabel
formula di detail, dan lembar cetaknya:

| Kolom | Isinya |
| --- | --- |
| **Perlu Ditimbang (g)** | hasil hitung `% x batch trial`, terisi |
| **Hasil Timbang (g)** | KOSONG, diisi tangan di lab |

Dua nama itu sengaja tidak disingkat jadi "Takaran" dan "Aktual".
Kertasnya dipegang orang yang sedang menimbang sambil memegang bahan,
dan "aktual" menuntut satu langkah tafsir yang tidak perlu ada di
dokumen yang dipakai sambil bekerja.

**Angka gramnya juga muncul di FORM, sebagai kolom, bukan catatan kaki
baris.** Formulator menyusun formula dalam persen tapi bekerja dengan
timbangan, dan versi pertama menaruh angka gram itu sebagai teks kecil
di bawah barisnya: terbaca kalau dicari, tidak terbaca kalau sedang
mengetik. Di sebelahnya ada total gram di samping total persen, jadi
selisih akibat total yang belum 100% langsung kelihatan tanpa dihitung
sendiri.
Bedanya dengan lembar hitung opname (yang sengaja TIDAK mencetak angka
sistem) memang disengaja: di opname angka sistem adalah jawaban yang
tidak boleh disalin, sedangkan di sini takaran adalah INSTRUKSI yang
harus diikuti, dan selisih terhadapnya justru data yang dicari.

Dokumen ini TIDAK terdaftar di `DOC_TYPES` / `JUDUL_DOKUMEN` /
`SUMBER_DOKUMEN`, sama seperti lembar hitung opname. Dia lembar kerja
internal yang diisi tangan, bukan dokumen yang diterbitkan ke pihak
luar, jadi tidak butuh pengesahan QR.

# Harga & diskon khusus client

Satu tabel, `client_prices`, dikunci `(organization, client, produk,
VARIAN)`. Satu baris boleh berisi harga saja, diskon saja, atau
dua-duanya, karena kesepakatan di lapangan memang dua bentuk: reseller
harganya dikunci, outlet konsinyasi ambil persentase.

Urutan hitungnya cuma satu, dan harus sama di kedua sisi:

```
harga dasar = harga khusus client kalau ada, kalau tidak harga master
harga akhir = harga dasar - (harga dasar * diskon_persen / 100)
```

Diskon menumpuk DI ATAS harga khusus, bukan menggantikannya.

**Diskon berlaku di konsinyasi saja.** Invoice penjualan langsung dan
POS tetap memakai harga (khusus atau master) tanpa potongan. Itu
keputusan pemakainya, bukan keterbatasan teknis: mengubahnya berarti
tagihan penjualan langsung ikut bergerak nilainya.

**Pengiriman konsinyasi memakai harga dasar PENUH.** `consignment_items.
harga_jual` menyimpan harga sebelum diskon. Potongannya baru dihitung
saat laku dicatat, dan diskon yang dipakai adalah yang berlaku HARI ITU,
bukan yang dibekukan waktu barang dikirim. Kesepakatan diskon berlaku
pada saat barang laku, dan itu yang ditagihkan.

**Proforma menyimpan satu diskon per DOKUMEN, bukan per baris.** Karena
itu diskon per produk dirangkum jadi persentase tertimbang sebelum
dikirim ke RPC:

```
diskon dokumen % = Σ(qty × harga × diskon baris%) / Σ(qty × harga) × 100
```

Rumus itu menghasilkan rupiah potongan yang sama persis dengan
menghitungnya baris per baris, jadi tidak ada selisih antara angka di
layar dan angka yang dihitung ulang di SQL. Konsekuensinya yang harus
diterima: persentase yang tercetak di Proforma bisa berupa angka janggal
(mis. 24,6239%) kalau produknya punya diskon berbeda-beda. Yang benar
tetap totalnya. `diskonTertimbang` di `lib/clientPrice.ts` yang
menghitungnya, dipakai dua layar: laporan laku per pengiriman
(`ReportSaleForm`) dan catat laku per outlet (`OutletActions`).

**`harga` BOLEH null, dan tiap pembacanya wajib menyaringnya.** Ini
sudah sekali lolos ke produksi dan harus tidak terulang. Waktu kolomnya
dijadikan nullable, `getSalesOptions` masih memetakannya dengan
`Number(h.harga)`. `Number(null)` bernilai **0**, bukan `NaN` dan bukan
`null`, jadi tiap client yang cuma punya diskon terbaca sebagai punya
harga khusus Rp 0, dan harga khusus itu MENANG atas harga master. Form
Konsinyasi dan Invoice mengisi harga 0 untuk 17 client sekaligus tanpa
error apa pun. Sekarang barisnya disaring dua lapis, di query
(`.not("harga", "is", null)`) sekaligus di pemetaannya, dan nol yang
ditulis sengaja tetap dihormati.

Pelajaran yang lebih besar dari satu kolom ini: **membuat kolom jadi
nullable adalah perubahan yang menyentuh SEMUA pembacanya, bukan cuma
penulisnya.** Sebelum mengirimnya, telusuri dulu siapa saja yang membaca
kolom itu. Yang berbahaya bukan pembaca yang meledak, tapi yang diam-diam
menghasilkan angka yang masuk akal.

**Angka diskon di layar tidak boleh menimpa yang sudah diketik user.**
Polanya sama dengan `hargaManual` di `InvoiceForm`: begitu kolom
Discount disentuh, `diskonManual` menyala dan angka otomatis berhenti
mengambil alih. Jangan menaruh ini di `useEffect` yang mengawasi qty,
itu melanggar `react-hooks/set-state-in-effect` dan menambah satu render
sesudah layar terlanjur dilukis.

# Pajak (PPN): tarif 12%, DPP Nilai Lain, dua model harga

**Tarif PPN Indonesia adalah 12%.** Yang membuatnya terbaca seperti 11%
adalah DPP Nilai Lain (PMK 131/2024): dasar pengenaannya bukan harga jual
penuh, melainkan 11/12-nya.

```
PPN = 12% x (11/12 x harga jual) = 11% x harga jual
```

Angkanya sama dengan menghitung 11% langsung, tapi **rinciannya beda, dan
rincian itulah yang tercetak di faktur.** Karena itu tarif dan pengali DPP
disimpan terpisah, tidak dipadatkan jadi satu angka 11: kalau aturan Nilai
Lain dicabut, yang berubah cuma pengalinya dan tarifnya tetap 12.

Konsekuensi yang gampang dilanggar: **jangan mencetak tarif di sebelah
label pajaknya.** Menulis "PPN (11%)" salah sebagai keterangan resmi,
karena 11% bukan tarif, cuma hasil akhir. Dokumen cetak menulis `PPN :`
saja, dan layar menulis `Tax` saja. Angka tarif hanya muncul di Settings,
tempat orang memang sedang mengatur regulasinya.

## Dua model harga

| `tax_mode` | Artinya | Total tagihan |
| --- | --- | --- |
| `Exclude` (bawaan) | Harga produk belum termasuk pajak | bertambah sebesar PPN |
| `Include` | Harga produk sudah final, pajak ada di dalamnya | tidak bergerak |

Urutannya, persis seperti yang tercetak di faktur:

```
subtotal = Sigma (qty x harga)      <- harga apa adanya di baris item
diskon   = subtotal x diskon%
netto    = subtotal - diskon        <- SUB TOTAL
exTax    = harga jual tanpa pajak   <- SUB TOTAL EXC TAX
           Exclude: netto
           Include: netto / (1 + tarif efektif)
dpp      = exTax x 11/12            <- DPP
pajak    = dpp x 12%
total    = Include ? netto : netto + pajak
```

Contoh yang dipakai sebagai acuan (harga 125.000, diskon 20%, Include):

| Baris | Nilai |
| --- | --- |
| SUB-TOTAL | 125.000,00 |
| DISCOUNT | 25.000,00 |
| SUB TOTAL | 100.000,00 |
| SUB TOTAL EXC TAX | 90.090,09 |
| DPP | 82.582,58 |
| PPN | 9.909,91 |
| TOTAL | 100.000,00 |

**`SUB TOTAL EXC TAX` cuma dicetak pada `Include`.** Pada `Exclude`
angkanya sama persis dengan `SUB TOTAL`, jadi barisnya cuma mengulang.

**Pada `Include`, pajaknya dihitung sebagai SISA** (`netto - exTax`), bukan
`dpp x tarif`. Nilainya identik secara matematis, tapi cara ini menjamin
`exTax + pajak = netto` tanpa sisa, jadi tidak ada selisih pembulatan yang
harus dijelaskan di dokumen pajak.

## Rumusnya cuma ada di dua tempat, dan wajib berubah bersamaan

| Sisi | Berkas |
| --- | --- |
| TypeScript | `hitungTotalDokumen` / `computeTotals` di `lib/invoiceMath.ts` |
| SQL | `invoice_tax_calc()` di `20260818_tax_mode.sql` |

Dua salinan itu tidak bisa dihindari: form menghitung di layar, RPC
konsinyasi menghitung sendiri karena harganya datang dari
`consignment_items`, bukan dari layar. Yang tidak boleh terjadi adalah
salinan ketiga. Kalau ada pemanggil yang butuh angka pajak, panggil salah
satu dari dua fungsi itu, jangan menulis `x 11 / 100` di tempat baru.
Pelajarannya sama persis dengan `fg_stock_calc`: angka di layar yang
berbeda dengan angka yang dihitung ulang di database adalah bug terburuk
yang mungkin terjadi di modul ini.

## Aturannya DIBEKUKAN per dokumen, dan diisi trigger

`sales_invoices` menyimpan tiga hal yang berlaku saat dokumen terbit:
`tax_mode`, `tax_percent`, dan `tax_dpp_nilai_lain`. Pengaturan perusahaan
boleh diganti kapan saja; invoice yang sudah dicetak, dikirim ke client,
dan dibayar tidak boleh ikut bergeser angkanya. Halaman cetak dan laporan
menghitung ulang rinciannya dengan ketiga kolom itu, bukan dengan
pengaturan yang berlaku sekarang.

Dokumen yang terbit sebelum migrasi `20260818` di-backfill
`tax_dpp_nilai_lain = false` dan tetap bertarif 11, jadi angkanya tidak
bergerak sedikit pun.

`tax_mode` dan `tax_dpp_nilai_lain` diisi trigger `set_invoice_tax_mode`
(BEFORE INSERT), bukan aplikasi. Alasannya sama dengan audit trail:
invoice lahir dari tiga jalur (`createInvoice` untuk Direct/POS,
`report_outlet_sale_tx`, `report_consignment_sale_tx`), dan
`create_sales_invoice_tx` sendiri tidak di-track di repo. Jalur yang lupa
mengisinya tidak menghasilkan error apa pun, cuma dokumen dengan pajak
model yang salah.

**Tarifnya tidak bisa diketik di form penjualan, dan itu disengaja.** PPN
adalah angka regulasi, bukan angka yang dinegosiasikan per transaksi. Yang
tersisa di form cuma centang kena pajak atau tidak; tarif dan aturan DPP
datang dari Settings. `createInvoice` pun membacanya sendiri lewat
`getTaxSettings()` dan menghitung ulang totalnya, jadi props `taxSettings`
di `InvoiceForm` murni untuk tampilan. Kalau nilainya dipercaya dari klien,
tab yang sudah lama terbuka bisa menerbitkan invoice bertotal aturan lama
sementara kolomnya tertulis aturan baru.

## Panel rekap penjualan cuma satu komponen

`components/InvoiceTotals.tsx` merender seluruh barisnya untuk semua form
yang menerbitkan invoice (Invoice, POS, laku per pengiriman konsinyasi):
`Sub-Total` (jumlah baris item apa adanya), `Discount`, `Sub Total`
(sesudah diskon), `Sub Total Exc Tax`, `DPP`, `PPN`, `TOTAL`. Dua baris
pertama yang namanya mirip itu memang angka yang berbeda, dan urutannya
mengikuti faktur yang dipakai di lapangan.

Dulu markup-nya disalin di tiap layar, jadi tiap penambahan baris rekap
harus diingat di tiga tempat.

**Tarif pajaknya tidak bisa diketik di form.** PPN itu angka regulasi,
bukan angka yang dinegosiasikan per transaksi, jadi yang tersisa di layar
cuma centang kena pajak atau tidak. Tarif dan aturan DPP-nya datang dari
Settings.

Layar yang berbentuk dialog sempit (`OutletActions`) sengaja tidak memakai
komponen ini, tapi tetap memanggil `computeTotals`. Sebelumnya dia
menghitung totalnya tangan dan pajaknya tidak ikut, jadi angka yang dilihat
kasir berbeda dengan Proforma yang terbit.

## Yang berlaku ke perusahaan mana

`PT Damar Nubio Aestetik (DNAlab)` memakai `Include`: harga jual produknya
sudah final. `PT Seawise Studio` tetap `Exclude`. Dua-duanya bertarif 12
dengan DPP Nilai Lain menyala, dan itu **tidak mengubah total mana pun**
karena `12% x 11/12` sama dengan `11%` yang dipakai selama ini; yang
berubah cuma rincian DPP yang tercetak.

Migrasi `20260818_tax_mode.sql` ikut mengubah Proforma DNAlab yang belum
pernah dibayar sepeser pun agar totalnya berhenti di nilai setelah diskon.
Yang kena satu dokumen, INV.202609002: subtotal 125.000, diskon 20%, dan
totalnya turun dari 111.000 ke 100.000 dengan DPP 82.582,58 + PPN
9.909,91 di dalamnya.
**Dokumen yang sudah punya baris `sales_payments` sengaja tidak
disentuh**: totalnya adalah angka yang sudah dipakai orang untuk membayar,
dan mengubahnya membuat ledger cicilan tidak cocok lagi dengan tagihannya.

# Pajak pembelian: modelnya milik SUPPLIER, per dokumen

Di penjualan, model harga adalah keputusan perusahaan sendiri, jadi satu
pengaturan di Settings berlaku untuk semua invoice. Di pembelian
keputusan itu ada di seberang meja: tiap supplier menerbitkan fakturnya
dengan gayanya sendiri, dan tiga-tiganya ada di lapangan.

| `tax_mode` | Faktur supplier | Total tagihan |
| --- | --- | --- |
| `Non` | supplier non-PKP, tidak memuat PPN | = subtotal |
| `Exclude` (bawaan) | harga belum kena PPN | subtotal + PPN |
| `Include` | harga sudah final, PPN di dalamnya | = subtotal |

Yang TIDAK berbeda antar supplier adalah tarifnya. PPN 12% dengan DPP
Nilai Lain adalah regulasi, jadi angkanya tetap datang dari Settings dan
tidak bisa diketik per dokumen, persis seperti di sisi penjualan. Kolom
"PPN (%)" yang dulu ada di form PO, Penerimaan, dan Guide Order sudah
dihapus. Yang dipilih di layar cuma modelnya, lewat
`components/TaxModeSwitch.tsx`.

**Tarifnya dibaca ulang di server, tidak pernah dipercaya dari form.**
`bekukanPajak` di `purchase-orders/actions.ts` dan `createReceiving`
sama-sama memanggil `getTaxSettings()` sendiri; yang datang dari layar
cuma modelnya, karena cuma itu yang memang keputusan per dokumen. Alasan
yang sama dengan `createInvoice` di sisi penjualan: tab yang sudah lama
terbuka tidak boleh menerbitkan dokumen bertarif aturan lama sementara
kolomnya tertulis aturan baru.

Rumusnya TIDAK ditulis ulang: `hitungTotalPembelian` di
`lib/purchaseTax.ts` cuma memanggil `hitungTotalDokumen` dengan diskon 0
(sisi pembelian tidak punya kolom diskon dokumen, potongan supplier
sudah masuk ke harga per baris), dan sisi SQL memanggil
`invoice_tax_calc` yang sama dengan konsinyasi. Pelajarannya sama persis
dengan `fg_stock_calc`: salinan ketiga adalah cara paling pasti membuat
angka di layar berbeda dengan angka yang dihitung ulang di database.

Faktur yang jadi acuan (Amidis Depo Bali, MZI0085, Include):

| Baris | Nilai |
| --- | --- |
| 10 x 18.000 | 180.000 |
| SUB TOTAL EXC TAX | 162.162,16 |
| DPP | 148.648,65 |
| PPN | 17.837,84 |
| TOTAL | 180.000 |

Kertas suppliernya menulis 162.162 dengan label "DPP". Itu sebenarnya
harga jual tanpa pajak; DPP Nilai Lain-nya 11/12 dari situ. Rupiah yang
dibayar sama, cuma penamaan barisnya yang berbeda.

## Bawaan supplier belajar dari dokumen, lewat trigger

`suppliers.tax_mode` menyimpan modelnya, dan PO berikutnya ke supplier
yang sama terisi otomatis. Yang memperbaruinya trigger
`sync_supplier_tax_mode`, BUKAN server action, alasan yang sama dengan
audit trail: PO lahir dari dua jalur (insert biasa di `createPO` dan
`update_po_tx`), penerimaan dari satu jalur lagi, dan jalur yang lupa
memanggil helper tidak menimbulkan error apa pun, cuma supplier yang
tidak pernah belajar. Penerimaan menang atas PO kalau keduanya berbeda,
dan itu memang urutannya di lapangan: PO adalah dugaan kita, faktur yang
datang bersama barang adalah kenyataannya.

**Null dibedakan dari `Non`.** Null cuma berarti belum ada dokumen yang
memberitahu, dan form jatuh ke `Exclude`. `Non` adalah pernyataan bahwa
supplier ini memang tidak memungut PPN, dan itu tidak boleh ditimpa
tebakan.

**Modelnya juga bisa diisi di muka di form Supplier**, tanpa menunggu
dokumen pertama. Berguna untuk supplier yang sudah diketahui non-PKP:
isi `Tanpa PPN` sekali, dan PO pertamanya sudah benar.

**`POInput.tax_mode` boleh null, artinya "pakai bawaan suppliernya".**
Satu-satunya pemanggil yang memakainya adalah Guide Order, yang
menerbitkan PO ke banyak supplier sekaligus dalam sekali klik. Tidak ada
satu model yang benar untuk semuanya di situ, jadi layar itu memang tidak
punya switch dan setiap PO-nya lahir dengan bawaan suppliernya
masing-masing.

**Isian otomatis berhenti begitu switch-nya disentuh** (`taxManual` di
POForm dan ReceivingForm). Polanya sama dengan `hargaManual` di
`InvoiceForm`, dan alasannya sama: ganti supplier di tengah pengisian
tidak boleh mengembalikan pilihan yang sengaja dibuat orang. Dikerjakan
di handler `onChange`, bukan `useEffect` yang mengawasi `supplierId`.

## Dua harga per batch: yang di kertas dan yang jadi HPP

`purchase_batches` menyimpan dua kolom, dan bedanya harus dijaga:

| Kolom | Isinya |
| --- | --- |
| `harga_faktur` | apa yang tertulis di kertas supplier |
| `harga_per_unit` | HPP, SELALU tanpa pajak |

Pada `Non` dan `Exclude` keduanya sama persis. Pada `Include`,
`harga_per_unit = harga_faktur / (1 + tarif efektif)`.

Kalau harga Include dipakai apa adanya sebagai HPP, barang yang sama jadi
lebih mahal cuma karena suppliernya menulis fakturnya dengan gaya yang
berbeda, padahal uang yang keluar sama saja. Itu akan menyebar diam-diam
ke HPP produksi, margin produk, dan nilai stok.

Aturan turunannya, dan ini yang gampang salah waktu menambah layar:

- **Yang membaca BIAYA memakai `harga_per_unit`**: produksi, pemakaian
  bahan, nilai stok, margin. Tidak perlu tahu soal pajak sama sekali.
- **Yang membaca DOKUMEN memakai `harga_faktur`**: baris faktur
  penerimaan (layar & cetak), nilai retur ke supplier, dan prefill harga
  di PO berikutnya. Angka itulah yang akan dicocokkan orang dengan kertas
  di tangannya.
- Data lama `harga_faktur`-nya di-backfill sama dengan `harga_per_unit`,
  dan tiap pembacanya tetap menulis `?? harga_per_unit` karena batch yang
  lahir dari Stock Adjustment tidak punya faktur.

## Retur pembelian ikut model fakturnya

`create_purchase_return_tx` dulu menghitung
`subtotal * (1 + ppn_percent / 100)`. Itu benar untuk `Exclude` tapi
MENGGELEMBUNGKAN retur atas faktur `Include`, yang harganya sudah memuat
pajak. Sekarang totalnya lewat `invoice_tax_calc` dengan model faktur
aslinya, dan baris returnya dinilai dengan `harga_faktur` karena yang
dikurangi adalah tagihan supplier.

## Diskon faktur & biaya kirim: satu di atas DPP, satu di bawah PPN

Faktur supplier punya dua baris yang bukan harga barang, dan perlakuan
pajaknya BERBEDA. Keduanya ada di `receivings` sejak
`20260827_receiving_biaya_kirim`, dalam RUPIAH seperti tertulis di
kertasnya:

| Kolom | Tempatnya di hitungan |
| --- | --- |
| `diskon` | mengurangi nilai barang SEBELUM pajak, jadi DPP ikut turun |
| `biaya_kirim` | ditambahkan SESUDAH PPN, tidak pernah masuk DPP |

Yang menentukan bukan selera, melainkan Faktur Pajaknya: potongan harga
tercetak di situ sebagai baris "Dikurangi Potongan Harga" tepat di atas
DPP, sedangkan ongkos kirim tidak pernah muncul sama sekali dan cuma
menambah tagihan di lembar invoice-nya.

Faktur yang jadi acuan (Chemarome 2026/13257, Include):

| Baris | Nilai |
| --- | --- |
| 5 kg x 568.928 | 2.844.640 |
| Volume discount | 28.446 |
| Netto (yang kena pajak) | 2.816.194 |
| SUB TOTAL EXC TAX | 2.537.112 |
| DPP | 2.325.686 |
| PPN | 279.082 |
| Delivery cost | 50.000 |
| TOTAL tagihan | 2.866.194 |

**Diskonnya RUPIAH, bukan persen.** Sisi penjualan memakai persen karena
di sana angkanya memang dinegosiasikan sebagai persentase; di sisi
pembelian yang datang adalah angka jadi di kertas, dan mengubahnya jadi
persen lebih dulu cuma menambah satu pembulatan yang tidak ada di
dokumen aslinya. Karena itu yang diserahkan ke `invoice_tax_calc` adalah
NETTO dengan diskon nol, bukan subtotal dengan diskon persen: dua sisi
menghitung `netto = subtotal - diskon` dengan cara yang persis sama.

**Diskon tidak pernah membebani HPP.**
`purchase_batches.harga_per_unit` tetap lahir dari harga per baris
(dikeluarkan PPN-nya pada faktur `Include`). Itu keputusan, bukan
pekerjaan yang tertunda: kalau potongannya memang milik satu barang
tertentu, tempatnya di harga baris itu sendiri, dan cara itu sudah ada
sejak dulu.

**Biaya kirim BOLEH membebani HPP, tapi cuma kalau dicentang**
(`receivings.kirim_ke_hpp`, `20260829`). Dua-duanya benar pada kasusnya
masing-masing: ongkir sekali jalan yang menanggung banyak barang tidak
bisa dibilang milik salah satunya, sedangkan satu kiriman kemasan dari
satu supplier ongkosnya memang bagian dari harga kemasan itu. Karena itu
pilihannya PER FAKTUR, bukan pengaturan perusahaan: yang tahu jawabannya
adalah orang yang sedang memegang fakturnya. Bawaannya mati.

Jatahnya proporsional terhadap NILAI baris, dan per unitnya
menyederhana jadi `biaya_kirim x harga_baris / subtotal`, karena jatah
baris `kirim x (qty x harga / subtotal)` dibagi qty lagi dan qty-nya
saling menghapus. Dasarnya nilai, bukan qty: qty mencampur satuan yang
tidak sebanding, 1.000 pcs tutup botol dan 25 kg bahan baku tidak pernah
bisa dijumlahkan jadi satu angka yang berarti.

Tiga hal yang tidak ikut bergerak waktu opsi itu menyala: **pajaknya**
(ongkir tetap di luar DPP, yang berpindah cuma cara biayanya dicatat),
**`harga_faktur`** (tetap apa adanya seperti di kertas supplier, dan
itu justru alasan kedua kolom itu dipisah sejak `20260822`), dan **nilai
retur** (dihitung dari `harga_faktur`, jadi mengembalikan barang tidak
ikut menagih balik ongkosnya).

Konsekuensinya yang harus disadari: **HPP satu batch jadi bergantung
pada baris LAIN di faktur yang sama**, jadi angkanya tidak bisa lagi
dicocokkan langsung dengan harga di kertas suppliernya. Karena itu form
penerimaan menulis HPP hasil akhirnya di tiap baris begitu opsinya
dicentang, dan halaman detail penerimaan memunculkan kolom `HPP/Unit`
di sebelah harga faktur. Angka yang berbeda dengan kertas harus terlihat
SEBELUM disimpan, bukan ditemukan berbulan-bulan kemudian di laporan
margin.

Rumusnya ada di dua tempat yang wajib berubah bersamaan, seperti biasa:
`hppPerUnit()` di `lib/purchaseTax.ts` dan blok `harga_per_unit` di
`create_receiving_tx`.

**Ongkir wajib bisa dibaca sebagai biaya keluar.** Dia uang keluar yang
tidak menjadi persediaan: tidak menambah nilai stok, tidak jadi HPP,
jadi tanpa tempat khusus dia akan lenyap ke dalam total pembelian dan
tidak pernah bisa dihitung. Karena itu laporan Purchasing punya kartu
`Biaya Kirim` dan kolomnya sendiri per faktur, terpisah dari `Total`.

**Retur tidak mengembalikan ongkirnya.** `create_purchase_return_tx`
membandingkan nilai retur dengan `total_invoice`, yang sekarang ikut
memuat biaya kirim, jadi mengembalikan SELURUH barang menyisakan ongkos
kirimnya sebagai tagihan. Itu memang yang benar di lapangan: kurirnya
sudah jalan, ongkosnya tidak ikut pulang.

**Yang belum punya kolomnya: PO dan retur pembelian.** Ongkos kirim baru
diketahui waktu fakturnya datang bersama barang, jadi di PO dia memang
belum ada. Kalau nanti diinginkan di PO, yang harus diputuskan lebih
dulu bukan soal teknis melainkan apa yang terjadi saat angkanya berbeda
dengan faktur yang datang.

## Yang dibekukan per dokumen

`purchase_orders` dan `receivings` sama-sama menyimpan `tax_mode`,
`ppn_percent` (TARIF regulasinya, 12), dan `tax_dpp_nilai_lain`. Halaman
cetak dan detail menghitung ulang rinciannya dari ketiga kolom itu, bukan
dari pengaturan yang berlaku sekarang: PO yang sudah dikirim ke supplier
dan faktur yang sudah dibayar tidak boleh bergeser angkanya cuma karena
Settings diganti.

Berbeda dengan `sales_invoices`, kolomnya TIDAK diisi trigger. Di sana
invoice lahir dari tiga jalur RPC yang salah satunya bahkan tidak
di-track di repo, jadi jalur yang lupa mengisinya tidak bisa dilihat dari
kode mana pun. Di sini ketiga jalurnya (`createPO`, `update_po_tx`,
`create_receiving_tx`) semuanya ada di repo dan semuanya memang harus
memilih modelnya secara sadar. Trigger yang mengisi diam-diam justru akan
menyembunyikan jalur yang lupa bertanya.

Yang tetap dikerjakan trigger cuma satu, dan sengaja: menyalin modelnya
ke BAWAAN supplier. Itu bukan isian dokumen, melainkan efek samping yang
harus berlaku untuk semua jalur.

Dokumen sebelum migrasi `20260822` di-backfill: `ppn_percent` 0 jadi
`Non`, selebihnya `Exclude` tanpa DPP Nilai Lain (tarifnya waktu itu 11
dan dikenakan ke harga penuh). Tidak ada satu pun angka yang bergerak.

## Laporan PPN: masukan vs keluaran

`/reports?type=tax` menjajarkan pajak keluaran (dari `sales_invoices`)
dengan pajak masukan (dari `receivings`), lengkap dengan rekap per masa
pajak dan selisih kurang/lebih bayarnya.

Tiga hal yang menentukan isinya:

- **Angkanya dihitung ulang, tidak dibaca dari kolom total.** Tiap baris
  lewat `hitungTotalDokumen` / `hitungTotalPembelian` dengan model yang
  dibekukan di dokumen itu sendiri. Dalam satu periode, faktur Exclude
  dan Include memang bercampur, dan di sisi pembelian itu justru keadaan
  normalnya.
- **Retur pembelian ikut, bertanda minus.** Barangnya sudah kembali dan
  tagihannya sudah dipotong, jadi pajak masukannya ikut hangus.
  `purchase_returns` cuma menyimpan `total_nilai`, jadi rinciannya
  dibongkar balik lewat `rincianDariTotal` di `lib/purchaseTax.ts`. Itu
  bukan rumus baru, cuma membalik arahnya: subtotalnya dihitung dulu,
  lalu diserahkan ke `hitungTotalPembelian` yang sama.
- **Bukan pengganti SPT Masa PPN**, dan kalimat itu ditulis di kaki
  laporannya. Isinya cuma dokumen yang tercatat di sistem; faktur pajak
  yang tidak lewat aplikasi ini tidak akan pernah muncul di situ.

## Panel rekap pembelian cuma satu komponen

`components/PurchaseTotals.tsx` merender seluruh barisnya untuk enam
layar: form PO, form Penerimaan, detail PO, detail Penerimaan, cetak PO,
cetak Penerimaan (prop `cetak` yang membedakan gayanya). `Sub Total Exc
Tax` cuma muncul pada `Include`, dan `DPP` + `PPN` disembunyikan pada
`Non`. Sebelumnya markup tiga barisnya disalin di tiap layar.

Di kedua form, switch pajaknya berdiri di kartu SENDIRI di sebelah kiri
panel rekap, bukan di dalamnya. Kiri satu pilihan tentang kertas
suppliernya, kanan akibatnya ke angka: sebab dan akibat terbaca
sekaligus, dan panel rekap tidak berjejal oleh kontrol.

**Kartu itu wajib memuat keterangan tarifnya** (`keteranganTarif`, prop
`catatan` di `TaxModeSwitch`). Begitu kolom ketik "PPN (%)" dihapus,
pertanyaan pertama orang pasti "tarifnya dari mana", dan jawabannya harus
ada di tempat pertanyaannya muncul, bukan cuma di Settings. Angka tarif
memang cuma boleh tampil di dua tempat: Settings, dan keterangan ini.
Yang tetap dilarang adalah mencetaknya di sebelah label pajaknya
("PPN (11%)"), karena 11% bukan tarif melainkan hasil akhir.


# Ringkasan PO yang menggantung

Kartu di atas daftar Purchase Orders dan Receiving menjawab "berapa yang
masih nyangkut", dan satu PO cuma boleh terhitung di SATU halaman:

| Halaman | Kartu | Status | Nilai |
| --- | --- | --- | --- |
| Purchase Orders | Menunggu Persetujuan | `Dibuat` | total PO |
| Purchase Orders | Disetujui, Belum Diterima | `Disetujui` + `Dikirim` | total PO |
| Receiving | Menunggu Kedatangan | `Dikirim` + `Diterima Sebagian` | **sisa** qty belum datang |

Begitu ada penerimaan pertama, PO berhenti terhitung di Purchase Orders.
`Dikirim` sengaja muncul di kedua halaman: bagi pembelian artinya
"sudah disetujui, belum beres", bagi gudang artinya "barangnya mau datang".

Tiga aturan yang menentukan, semuanya di `lib/poPipeline.ts`:

- **Dihitung dari SELURUH PO perusahaan, bukan baris halaman ini.**
  Query-nya terpisah dari tabel dan diambil per 1000 baris sampai habis,
  karena PostgREST memotong di max-rows tanpa error apa pun.
- **Nilai di Receiving adalah SISA, bukan total PO.** PO yang barangnya
  sudah datang 90% tidak boleh terbaca masih menunggu seharga penuh.
- **Rupiahnya lewat `hitungTotalPembelian`** dengan model pajak yang
  dibekukan di tiap PO, sama dengan kolom Total di tabel.

Kartunya tidak ikut kotak cari maupun filter: angkanya ringkasan tetap,
dan mengkliknya justru yang memasang filter status. Ringkasan yang gagal
dimuat menulis kalimatnya sendiri, bukan ikut menjatuhkan tabel di bawahnya.

Umur tunggu dihitung dari `tanggal_po`, karena tanggal disetujui dan
tanggal dikirim tidak disimpan di `purchase_orders` (jejaknya cuma ada
di `activity_logs`). Tombol Terima di daftar tunggu membuka form lewat
`/receivings/new?po=`, dan form mengisi barisnya di initial state, bukan
lewat `useEffect`.

## Urutan bawaan daftar PO: alur, bukan abjad

Daftarnya diurutkan `status_urut` naik lalu `no_po` naik, jadi yang
belum beres selalu di atas: Dibuat, Disetujui, Dikirim, Diterima
Sebagian, Selesai, Dibatalkan. Di dalam satu status urutannya naik, jadi
yang paling lama menunggu berada paling atas. Orang membuka halaman ini
hampir selalu untuk mencari pekerjaan yang belum selesai, dan
`created_at` menurun menyebar pekerjaan itu di antara PO yang sudah lama
tutup.

**`status_urut` adalah kolom, bukan `order by status`.** Dua jalan
pintas yang kelihatan benar dan dua-duanya salah diam-diam: kolom enum
diurutkan Postgres menurut urutan DEKLARASI enum-nya, yang tidak
di-track di repo mana pun, dan kolom text diurutkan menurut ABJAD, yang
menaruh `Dibatalkan` di paling atas. PostgREST juga tidak bisa
`order by` sebuah ekspresi CASE. Kolomnya generated & stored
(`20260828_po_status_urut`), jadi tidak ada satu jalur tulis pun yang
harus ingat mengisinya, alasan yang sama dengan audit trail yang ditulis
trigger.

Peta `SORT` halaman ikut menunjuk `status_urut`, jadi tombol urut di
judul kolom Status memberi urutan alur yang sama, bukan abjad.

**`no_po` dipasang sebagai pemecah seri untuk SEMUA urutan**, bukan cuma
urutan bawaan. `.range()` memotong hasil yang urutannya tidak pasti, dan
dua baris bernilai sama bisa bertukar tempat antar permintaan, jadi satu
PO muncul dua kali di halaman 2 sementara PO lain hilang sama sekali.

## Cetak Pengajuan PO, dan catatan isi PO di daftarnya

`/print/po-pengajuan` mencetak SELURUH PO berstatus `Dibuat` beserta
rincian barangnya, untuk dibawa ke meja yang menyetujui. Rekapnya di
halaman pertama, rincian per PO sesudahnya: yang ditanya pertama selalu
"berapa totalnya", dan jawabannya tidak boleh ada di balik kertas.

**Tiap PO dihitung dengan model pajaknya sendiri**, yang dibekukan di
dokumen itu, lalu totalnya dijumlahkan. Bukan satu perhitungan pajak
atas gabungan subtotalnya: dalam satu pengajuan, supplier PKP dan
non-PKP memang bercampur, dan itu keadaan normalnya. Rumusnya tetap
`hitungTotalPembelian`, tidak ada salinan baru.

Daftarnya diambil per 1000 baris sampai habis, alasan yang sama dengan
`lib/poPipeline.ts`: PostgREST memotong di max-rows tanpa error apa pun,
dan total pengajuan yang kurang tetap terlihat masuk akal.

Tombolnya di kepala halaman Purchase Orders dan **cuma muncul kalau ada
PO yang menunggu**, jumlahnya ditulis di tombolnya. Waktu ringkasannya
gagal dimuat jumlahnya tidak diketahui, jadi tombolnya tetap ditawarkan
dan halaman cetaknya sendiri yang mengatakan daftarnya kosong.

Di tabelnya, nama supplier dibuntuti catatan kecil isi PO-nya (barang,
qty, nilai baris). Dua PO ke supplier yang sama pada minggu yang sama
cuma beda di isinya, dan tanpa catatan itu keduanya harus dibuka satu
per satu. Yang tampil tiga baris pertama, sisanya dirangkum jadi
`+n item lain` BESERTA nilainya: catatan yang menyebut sebagian nilai
saja akan terbaca seperti PO yang lebih murah daripada kolom Total di
sebelahnya. Rupiah di catatan adalah nilai baris apa adanya (qty x harga
seperti yang tertulis di faktur), jadi pada PO `Include` angkanya sudah
memuat pajak; kolom Total yang menerapkan model pajaknya.

# Batal invoice konsinyasi: asal stok harus dicatat dulu

Invoice yang lahir dari konsinyasi dulu tidak bisa dibatalkan.
`cancel_invoice_tx` menolaknya dengan pesan "batalkan/koreksi lewat menu
Consignment", dan menu itu tidak pernah ada, jadi salah ketik qty laku
cuma bisa dibetulkan lewat SQL.

Yang menghalangi bukan kebijakan, melainkan data: **tidak ada yang
mencatat qty sebuah baris invoice diambil dari pengiriman yang mana.**
`report_outlet_sale_tx` menyebar FIFO ke beberapa pengiriman sekaligus
lewat `consignment_take`, dan header invoice-nya bahkan tidak memuat
`consignment_id` (kolom itu cuma terisi pada laku per-pengiriman).

Menebaknya dari `product_id` + varian salah persis di kasus yang paling
mahal: satu produk yang sama dititipkan di dua pengiriman dengan
`harga_jual` berbeda. Qty balik ke pengiriman yang keliru, nilai barang
yang masih di outlet jadi ngawur, dan tidak ada error apa pun.

Polanya sama dengan `purchase_return_items.qty_dari_karantina` /
`qty_dari_sisa`: simpan ASAL potongannya supaya pembatalannya bisa
mengembalikan qty ke baris yang persis benar.

## `consignment_sale_lines`

Satu baris invoice bisa berasal dari BEBERAPA pengiriman, jadi
hubungannya satu-ke-banyak dan tidak muat sebagai kolom di
`sales_invoice_items`. `consignment_take` sekarang mengembalikan
`jsonb` `{harga, alloc}` (dulu `numeric` harga saja, karena itu fungsinya
harus di-DROP dulu, `create or replace` tidak bisa mengganti tipe
kembalian), dan kedua RPC laku menulis pembagiannya ke tabel ini.

## Dua kondisi saat membatalkan, dan bedanya bukan kosmetik

| Pengiriman | Yang ditulis | Stok produk jadi |
| --- | --- | --- |
| masih `Aktif` | `qty_terjual` turun | tidak bergerak |
| sudah `Selesai` | `qty_terjual` turun, `qty_retur` naik | **naik** |

Yang pertama benar karena `fg_stock_calc` menghitung konsinyasi sebagai
`qty_kirim - qty_retur`; `qty_terjual` tidak ikut, jadi barangnya memang
masih tercatat ada di outlet.

Yang kedua wajib karena `close_consignment_tx` sudah mengubah sisa yang
tak laku jadi retur. Menurunkan `qty_terjual` saja pada pengiriman yang
sudah ditutup menghasilkan pengiriman dengan sisa yang tidak ada
barangnya, sekaligus tidak pernah mengembalikan stoknya ke gudang.
Barang yang batal laku itu semestinya ikut pulang waktu konsinyasi
ditutup, dan itulah yang ditulis.

**Catatan asal DIJUMLAHKAN per `consignment_item` sebelum diterapkan.**
Satu invoice boleh punya dua baris produk yang sama dan keduanya bisa
jatuh ke pengiriman yang sama; kalau diproses satu per satu, pemeriksaan
qty putaran kedua memakai angka yang sudah basi.

## Invoice yang terbit sebelum ini

Backfill di `20260820` cuma mengisi yang **pasangannya tidak ambigu**
(tepat satu `consignment_item` yang cocok dan qty terjualnya cukup).
Kalau satu baris saja ambigu, SELURUH invoice itu dilewati: setengah
catatan asal lebih berbahaya daripada tidak ada, karena pembatalannya
akan mengembalikan sebagian qty saja tanpa memberi tahu siapa pun.
Invoice yang tidak ter-backfill ditolak dengan pesan yang menyebutkan
alasannya dan menunjuk ke Stock Opname produk jadi.

Waktu dijalankan, kesepuluh invoice konsinyasi yang ada semuanya
ter-backfill, menghasilkan 16 baris alokasi. Angka itu sendiri yang
membuktikan kenapa tabel ini perlu ada: satu invoice ternyata mengambil
dari ENAM pengiriman berbeda sekaligus. Tebakan lewat product+varian akan
mengembalikan seluruh qty-nya ke satu pengiriman saja.

## Di mana tombolnya

Dua tempat, karena orang yang mengoreksi laku biasanya sedang membuka
layar outletnya, bukan daftar faktur:

- **Sales Invoices**, tombol Batal yang sudah ada (syarat `sumber !=
  'Konsinyasi'` dihapus).
- **Detail Konsinyasi**, tabel "Invoice dari Pengiriman Ini". Daftarnya
  dicari lewat `consignment_sale_lines`, BUKAN lewat
  `sales_invoices.consignment_id`: kolom itu kosong untuk semua laku
  yang dicatat per outlet, yaitu mayoritas dokumennya.

Aturan pembayaran tidak berubah: dokumen yang sudah dibayar client tetap
ditolak, hapus dulu cicilannya di Sales Payments.

## Pencarian outlet disaring di klien

`components`-nya `app/(app)/consignments/OutletRekap.tsx`. Penyaringannya
di klien, bukan lewat `?q=`, karena seluruh konsinyasi aktif memang sudah
dibaca untuk menghitung rekapnya, DAN karena halaman itu sudah punya
kotak cari kedua (`TableToolbar`) yang memiliki `?q=`. Memakai parameter
yang sama akan membuat satu ketikan menyaring dua daftar sekaligus.

Karena itu pula lencana `/` tidak dipasang di kotak ini: shortcut itu
milik kotak cari halaman, dan dua kotak yang mengaku punya tombol yang
sama lebih buruk daripada satu kotak tanpa shortcut. Pencariannya ikut
mencocokkan nama produk di dalam titipan, bukan cuma nama outlet, karena
orang sering mengingat produknya lebih dulu.

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
- **Literal enum di dalam CASE dipaksa jadi tipe enum saat skripnya
  DIURAI, bukan saat dijalankan.** Satu label yang tidak ada di enum
  menggagalkan seluruh migrasi dengan `22P02: invalid input value for
  enum`, walau cabang itu tidak pernah tersentuh satu baris pun. Karena
  definisi tipe enum tidak di-track di repo, skrip yang menyebut label
  enum cuma jalan kalau penulisnya sudah tahu persis isinya. Bandingkan
  `status::text` kalau yang dibutuhkan cuma pemetaan, seperti
  `po_status_urut()` di `20260828`.
- **Cast enum ke text cuma STABLE, jadi haram di generated column.**
  Dia cast I/O, bukan fungsi immutable, dan `generated always as`
  menuntut immutable. Jalan keluarnya trigger `BEFORE INSERT OR UPDATE`:
  jaminannya sama (semua jalur tulis ikut) dan di dalam fungsi trigger
  cast itu sah. Kolom turunan seperti itu WAJIB masuk daftar abaikan
  `log_activity`, kalau tidak backfill-nya menulis satu entri audit per
  baris dan tiap perubahan sesudahnya tercatat dua kali.
- **Label status yang dipakai aplikasi belum tentu ada di enum-nya.**
  `cancelPO` menulis `'Dibatalkan'` sejak lama, dan `po_status` tidak
  punya label itu sampai `20260830`. Tidak ada yang meledak dengan
  jelas: tombol Batal gagal dengan pesan mentah database, dan filternya
  selalu kosong karena query yang error mengembalikan `data` null lalu
  halamannya menulis "tidak ada yang cocok". Menambah label enum juga
  keputusan sekali jalan, nilai enum TIDAK BISA dihapus di Postgres.

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

## Urutan tabel: lewat URL, bukan state komponen

`Column.sort` diisi = judul kolomnya jadi tombol urut
(`components/SortHeader.tsx`), dan nilainya yang masuk ke `?sort=` di URL.
Halaman yang memakainya WAJIB ikut menerapkan urutannya. **Tombol yang
tidak mengubah apa pun lebih buruk daripada tidak ada tombol.**

| Bentuk tabel | Cara menerapkan |
| --- | --- |
| paginasi di server (`.range()`) | `orderFor(sp, SORT, bawaan)` lalu `.order(...)` |
| datanya sudah utuh di memori | `urutkanBaris(rows, sp, accessors, bawaan)` |

**Kenapa URL dan bukan `useState`:** dua puluh empat tabel daftar di sini
paginasi di SERVER. Mengurutkan di browser cuma membalik 50 baris yang
sedang tampil, dan hasilnya kelihatan benar padahal isinya "halaman 3
urutan lama, lalu diurutkan". Lewat URL, halamannya bisa meneruskan
urutan itu ke `.order()` di database. Bonusnya sama dengan alasan
Pagination menyimpan nomor halaman di URL: bisa di-refresh, di-share,
dan tombol Kembali browser bekerja. DataTable pun tetap server component,
yang butuh JS cuma tombol kecil di judul kolom.

**Kunci urut datang dari URL, jadi TIDAK PERNAH boleh langsung dipakai
sebagai nama kolom.** Peta `SORT` di tiap halaman adalah daftar putihnya;
kunci yang tidak ada di situ diabaikan dan tabelnya jatuh ke urutan
bawaan. Peta yang sama juga yang dipasang di `sort` tiap kolom, jadi
tombol yang muncul di layar dan urutan yang benar-benar dijalankan
berasal dari satu sumber.

**Tiga keadaan, sengaja bukan dua:** klik pertama naik, kedua turun,
ketiga KEMBALI ke urutan bawaan. Urutan bawaan di sini bermakna (dokumen
terbaru di atas, faktur yang belum lunas dulu), jadi harus ada jalan
pulang. Menyortir juga selalu mengembalikan ke halaman 1: tetap di
halaman 7 sesudah urutannya berubah hampir selalu bukan yang dimaui.

**Baris tanpa nilai selalu di bawah, arah urut apa pun.** Kalau ikut
dibalik, menyortir turun menaruh baris kosong di paling atas dan yang
dicari orang justru terdorong keluar layar. Berlaku di dua sisi:
`urutkanBaris` menanganinya sendiri, sisi server memakai
`nullsFirst: false`.

**Kolom yang nilainya dihitung di TypeScript tidak dapat tombol urut.**
"Harga Terakhir" dan "Stok Sisa" di Stock Items, "Total" di PO, "Sisa
Bayar" di Payments: angkanya lahir dari query kedua yang cuma mengambil
baris halaman ini. Mengurutkannya berarti mengurutkan satu halaman saja,
persis kesalahan yang dihindari di atas. Kolom relasi (`suppliers(nama)`,
`clients(company_brand)`) juga belum, karena urutannya harus dikerjakan
PostgREST lewat embed dan itu perlu diuji tersendiri.

**Tabel di halaman detail & form tidak dapat tombol urut sama sekali**
(penimbangan produksi, baris formula, lembar hitung opname). Urutannya di
situ bermakna dan harus sama dengan urutan yang dipakai di tempat lain,
alasan yang sama dengan `groupBy` yang tidak pernah mengurutkan ulang.

**Di HP tabelnya jadi kartu dan tidak punya baris judul**, jadi
`SortSelect` merender pilihan urut sebagai `<select>` di atas kartu.
Tanpa itu sortir cuma bisa dipakai orang yang memegang laptop, padahal
isian data di pabrik justru dilakukan sambil memegang barang.

Halaman dengan DUA tabel (QC Incoming, QA Release, QC Finished,
Production) hanya memberi tombol urut pada tabel PERTAMA, yaitu yang
paginasi. Satu `?sort=` untuk dua tabel akan membuat satu klik mengurutkan
daftar yang salah.

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

**Nama produk jadi selalu dibuntuti brand-nya.** Satu pabrik maklon
mengerjakan produk bernama mirip untuk brand yang berbeda, dan kode
produk pun bisa kembar (`FP002` dipakai dua produk). Nama saja tidak
cukup untuk memilih barang yang benar, dan salah pilih di konsinyasi
atau opname baru ketahuan setelah stoknya bergerak. `lib/produkLabel.ts`
yang merangkainya (`namaBrand`), brand ikut dicocokkan saat mengetik di
pemilih, dan daftar sarannya diurutkan per brand dulu karena orang
mengingat brand lebih dulu daripada kode.

Layar yang sudah mengikutinya: pemilih produk (Invoice, POS, Konsinyasi,
Harga Client), Finished Goods, Stock Opname (layar & lembar hitung),
Konsinyasi (daftar outlet, laporan laku), QC Finished, QA Release,
Production, dan laporan Koreksi Produk Jadi serta Product Margin.
Dokumen cetak untuk pembeli (invoice, nota) sengaja tidak: di situ brand
adalah milik pembelinya sendiri, jadi cuma jadi pengulangan.

`ProductPicker` menandai baris **jasa** dengan pil, bukan angka stok.
jasa tidak punya stok dan "stok 0" di sebelahnya menyesatkan. Prop
`showStock={false}` untuk layar yang ketersediaan barangnya tidak relevan
(mis. menyusun daftar harga khusus client).

**Kartu yang memuat picker perlu `relative` + `z-index` lebih tinggi
daripada kartu di bawahnya.** Efek `.glass` membentuk stacking context,
jadi tanpa itu daftar sarannya tertimbun panel berikutnya. Lihat
`InvoiceForm` (`z-40` untuk kartu header, `z-10` untuk kartu item).

# Sidebar: rail yang melebar saat dijelajah

Dua lebar, dan yang menentukan bukan satu keadaan melainkan dua yang
sengaja dipisah:

| Keadaan | Asalnya | Menggeser konten? |
| --- | --- | --- |
| `rail` | preferensi user, dari COOKIE lewat server | ya |
| `dijelajah` | kursor di atas sidebar / fokus keyboard di dalamnya | **tidak** |

Yang menahan tempat di alur layout adalah **div pengganjal terpisah**,
dan lebarnya cuma mengikuti `rail`. Sidebarnya sendiri `fixed` dan
menumpuk di atas konten waktu dijelajah. Itu inti polanya: halaman kerja
tidak pernah bergeser cuma karena kursor lewat. Kalau nanti tergoda
menghapus pengganjalnya dan mengembalikan sidebar ke alur flex, yang
hilang bukan kerapian melainkan seluruh gunanya.

**Geometri vertikalnya WAJIB identik di kedua keadaan.** Ini aturan
terpenting di bab ini, dan versi pertama melanggarnya tanpa terasa waktu
ditulis. Kalau menu bergeser saat sidebar melebar, orang yang mengarahkan
kursor ke Sales akan menekan menu lain: sidebar-nya melebar duluan, dan
yang berada di bawah kursor sudah berubah. Menu yang lari dari kursornya
sendiri terasa rusak, bukan sekadar kurang rapi.

Diukur sebelum diperbaiki, mengarah ke Sales berakhir di Products.
Pergeserannya 52px sampai 114px dan tidak seragam, karena penyebabnya
ada empat dan semuanya menumpuk:

| Penyebab | Pengunci |
| --- | --- |
| Judul "Industry Management" muncul, header memanjang | header `h-[52px]` tetap |
| Baris ikon saja lebih pendek daripada baris berteks (~3px, dikali 10 baris) | tiap baris menu `h-10` tetap |
| Judul grup (teks) vs garis pemisah, tingginya beda | dua-duanya kotak `h-8` |
| OrgSwitcher muncul untuk super admin | rail memesan tinggi yang sama persis (37px + `mb-3`) |

Cara memeriksanya bukan dengan melihat: catat titik tengah tiap `<a>`
saat rail, arahkan kursor, catat lagi, dan selisihnya harus **0 untuk
semua baris**. Selisih 3px pun berarti ada kotak yang tingginya masih
mengikuti isi.

**Ruang yang dipesan jangan dibiarkan menganga.** Tempat OrgSwitcher yang
kosong di rail terbaca sebagai layar yang belum jadi, jadi diisi penanda
company berisi inisial (`inisialOrg`, "PT Damar Nubio Aestetik" jadi
"DN"), dengan nama lengkap sebagai tooltip. Sengaja teks, bukan ikon
gedung: ikon itu sudah dipakai menu Companies, dan dua ikon kembar di
satu rail membuat orang mengira penandanya bisa diklik ke sana. Bentuk
badan usaha dibuang dulu karena hampir semua company di sini diawali PT,
jadi memakainya menghasilkan "PD" dan "PS" yang tidak membedakan apa pun.

**Fokus keyboard ikut melebarkan, bukan cuma hover.** Tanpa itu orang
yang menekan Tab masuk ke sidebar berpindah antar ikon tanpa tahu dia
sedang menyorot menu apa. `onBlurCapture` memeriksa `relatedTarget`
supaya perpindahan fokus ANTAR tombol di dalam sidebar tidak ikut
menutupnya.

**Rail yang sedang dijelajah wajib berlatar PEKAT.** `.glass-dark` cuma
0.72, dan sisa 28% itu terbaca sebagai teks hantu halaman di balik menu,
pelajaran yang sama persis dengan sel sticky di DataTable. Warnanya bukan
`#16261D` mentah melainkan komposit `glass-dark` di atas `--background`,
supaya pekat 100% tapi terlihat identik dengan sidebar yang menempel;
warna yang melompat saat kursor masuk lebih mengganggu daripada
transparansinya.

**Lebar desktop lewat custom property `--sb-w`, bukan kelas Tailwind.**
Di bawah 640px sidebar adalah drawer selebar 250px, jadi inline style
biasa (yang berlaku di semua ukuran layar) merusak tampilan HP. Media
query-nya tinggal di `globals.css` sebagai aturan biasa, bukan
`@utility`, supaya menang atas `w-[250px]` tanpa bergantung urutan emit
Tailwind. Alasannya sama dengan aturan sudut sticky.

**Yang disembunyikan saat rail diam, disembunyikan lewat CSS (`sm:hidden`),
BUKAN dengan tidak merendernya.** Drawer HP selalu selebar 250px, jadi
judul grup dan OrgSwitcher harus tetap terbaca di sana walau preferensi
desktop orang itu rail. Menyembunyikannya di JS ikut menghapusnya di HP,
dan kelompok menu jadi tidak berjudul justru di layar yang paling butuh
penanda.

## Preferensi lebar ada di cookie, dan itu memang perbaikannya

Dulu di `localStorage`, yang tidak terbaca di server, jadi HTML pertama
selalu dirender lebar lalu dikoreksi di klien: sidebar berkedip lebar
lalu sempit di **tiap** muat halaman. `useSyncExternalStore` menghapus
bentrok hidrasinya tapi tidak menghapus kedipannya, dan itu bertahan
lama sebagai known issue. Cookie ikut terkirim di tiap request, jadi
`components/Sidebar.tsx` merender lebar yang benar sejak byte pertama.

`lib/sidebarPref.ts` sengaja bersih dari import server: nilainya dibaca
di server dan ditulis di klien, jadi keduanya harus bisa mengimpor nama
yang sama. Lihat bab Batas server/klien di `lib/`.

Preferensi `localStorage` versi lama disapu sekali saat mount, dan
sengaja TIDAK ikut mengubah tampilan saat itu juga: mengubah state di
dalam effect melanggar `react-hooks/set-state-in-effect`. Cukup tulis
cookie-nya, muat halaman berikutnya sudah benar dari server. Yang
dikorbankan satu kali muat, sekali seumur akun.

## Menu dikelompokkan, dan urutannya tidak menyentuh pendaratan

`NAV` di `lib/navConfig.ts` punya kolom `grup`: Operasional (yang dipakai
tiap hari, urut mengikuti alur barang), Analisis (yang dibaca, bukan
diisi), Administrasi (yang jarang disentuh sesudah disiapkan). Grup yang
seluruh menunya tidak boleh diakses tidak dirender, supaya tidak ada
judul yang menggantung tanpa isi.

**Menata ulang `NAV` tidak memindahkan siapa pun ke halaman lain.**
Halaman pendaratan sesudah login dihitung dari urutan `MODULES` di
`lib/modules.ts`, daftar yang berbeda. Itu disengaja dan jangan
disatukan: `NAV` adalah sepuluh menu hub, `MODULES` adalah dua puluh
delapan modul berizin.

# Dokumen cetak: menambah jenis baru

Satu jenis dokumen hidup di empat tempat, dan TypeScript memaksa
ketiganya yang terakhir ikut diisi karena bertipe `Record<VerifyKey, ...>`:

| Berkas | Isinya |
| --- | --- |
| `lib/docSign.ts` `DOC_TYPES` | nama jenisnya di layar Document Signing |
| `lib/qrSign.ts` `JUDUL_DOKUMEN` | nama yang tampil di halaman verifikasi QR |
| `lib/qrSignServer.ts` `SUMBER_DOKUMEN` | tabel, kolom nomor, kolom tanggal |
| `app/print/<jenis>/[id]/page.tsx` | halamannya sendiri |

**Tidak semua halaman cetak perlu didaftarkan.** Lembar hitung Stock
Opname, Lembar Kerja R&D, dan Pengajuan Purchase Order sengaja berdiri
di luar keempat tempat itu: ketiganya lembar INTERNAL, bukan dokumen
yang diterbitkan ke pihak luar, jadi tidak ada yang perlu diverifikasi
lewat QR. Kalau nanti salah satunya berubah jadi dokumen yang dikirim
keluar, keempat tempat itu yang harus diisi.

Pengajuan PO punya alasan tambahan: isinya berubah tiap kali dicetak,
karena PO yang sudah disetujui hilang dari daftarnya. Tidak ada nomor
dokumen tetap yang bisa ditunjuk QR, dan kalimat itu ditulis di kaki
kertasnya supaya tidak ada yang menyimpannya sebagai dokumen bernomor.
Kolom tanda tangannya tetap dicetak walau QR Signature PO menyala, dan
itu bukan pengecualian yang malas: yang disahkan QR adalah tiap PO-nya
sendiri, sedangkan kertas ini justru dibuat untuk dimintakan tanda
tangan. Alasan yang sama dengan kolom "Diterima oleh" di Tanda Terima
Konsinyasi, jadi halamannya memanggil `getDocSignConfig` langsung, bukan
`getDocSigners`.

`doc_type` di `doc_sign_settings` cuma teks tanpa constraint, jadi jenis
baru TIDAK butuh migrasi. Barisnya juga tidak perlu ada: kalau belum
pernah diatur, `getDocSignConfig` jatuh ke tiga key person lama dan
dokumennya tetap terbit dengan kolom tanda tangan yang benar.

## Tanda tangan penerima bukan tanda tangan pengesahan

`getDocSigners` mengembalikan daftar kosong kalau dokumennya disahkan
lewat QR, dan itu memang aturannya: dokumen ditandatangani basah ATAU
elektronik, tidak dua-duanya.

Aturan itu berlaku untuk pengesahan INTERNAL saja. Kolom "Diterima oleh"
di Tanda Terima Konsinyasi berdiri di luar mekanisme itu dan SELALU
dicetak: dia bukan pengesahan perusahaan, melainkan bukti bahwa orang di
seberang sudah menerima barangnya. Menyembunyikannya waktu QR menyala
akan menghasilkan tanda terima yang tidak bisa diminta tanda tangan,
yaitu satu-satunya alasan dokumen itu ada.

Sebab yang sama membuat dokumennya wajib memuat kalimat kepemilikan.
Kertas yang mencantumkan nilai rupiah dan ditandatangani penerima
gampang dibaca sebagai bukti jual beli, padahal barang konsinyasi belum
berpindah pemilik sampai laku.

# Logo perusahaan: satu kolom teks, bukan berkas

Logo diunggah di Settings, Company Profile, lalu tercetak di kop dokumen
A4. Disimpan sebagai **data URI di `organization_settings.logo`**, bukan
sebagai berkas di Supabase Storage. Tiga alasan, dan semuanya soal
dokumen cetak:

- **Dokumen cetak harus utuh sekali render.** Logo yang diambil lewat URL
  bisa gagal atau baru datang sesudah dialog Print terbuka, dan yang
  tercetak adalah kop tanpa logo tanpa error apa pun.
- **Service worker aplikasi ini sengaja tidak menyimpan apa pun** (lihat
  bab PWA), jadi tidak ada jaring pengaman untuk berkas yang gagal
  diambil.
- **Bucket Storage beserta policy-nya tidak bisa di-track di repo**,
  persis masalah yang sama dengan RPC lama yang definisinya cuma ada di
  project Supabase.

Harganya satu baris pengaturan jadi lebih besar, dan itu dibatasi di DUA
sisi. `lib/logo.ts` mengecilkan gambarnya di browser sebelum dikirim
(sisi terpanjang `LOGO_MAX_PX` = 400 px), dan `saveSettings` menolak yang
melebihi `LOGO_MAX_BYTES` = 200 KB. Penjaga di server bukan hiasan:
server action bisa dipanggil dari mana saja, bukan cuma dari layar yang
sudah mengecilkan gambarnya.

Kenapa 400 px: logo tercetak setinggi 16 mm, dan pada 300 dpi itu cuma
sekitar 190 px. 400 px sudah lebih dari cukup untuk tetap tajam di kertas
sekaligus tidak membuat barisnya membengkak.

**Urutan penyandiannya PNG dulu, JPEG belakangan.** Logo biasanya bidang
warna rata, jadi PNG-nya kecil sekaligus mempertahankan latar transparan
yang membuatnya menyatu dengan kertas. PNG dicoba di tiga ukuran (400,
320, 256) sebelum menyerah ke JPEG, dan di JPEG transparansinya diratakan
ke PUTIH lewat `destination-over`, bukan dibiarkan: tanpa alas, bagian
transparan keluar jadi hitam di kertas.

**SVG ditolak dengan pesan yang jelas.** SVG tanpa `width`/`height`
intrinsik terbaca `naturalWidth = 0` dan tidak bisa digambar ke canvas.
Membiarkannya lolos menghasilkan kotak kosong di kop dokumen, dan itu
baru ketahuan sesudah kertasnya keluar dari printer.

## Kop dokumen A4 cuma satu komponen

`components/PrintKop.tsx`. Sembilan dokumen (PO, Penerimaan, Retur
Pembelian, Produksi, QC, QC Produk Jadi, QA, Stock Opname, Tanda Terima
Konsinyasi) dulu menyalin markup kop yang sama persis. Sembilan salinan
berarti sembilan kesempatan untuk lupa, dan waktu logo ditambahkan
delapan di antaranya akan tetap tercetak tanpa logo tanpa error apa pun.

Dua dokumen sengaja TIDAK memakainya:

- **Invoice** kopnya berbentuk banner berwarna dengan identitas
  perusahaan di kanan, bukan kiri. Sisi kirinya memang sudah disediakan
  untuk logo sejak awal (dulu berisi `<div />` kosong), dan sisi
  kanannya harus sejajar dengan blok nomor & tanggal di bawahnya.
- **Nota 58 mm** tidak memuat logo sama sekali. Kertas thermal cuma punya
  satu warna, dan logo di situ lebih sering keluar jadi blok hitam
  daripada terbaca.

Halaman cetak memakai `<img>` biasa, bukan `next/image`. Isinya data URI
yang tidak ada yang bisa dioptimalkan, dan `next/image` menambah satu
lapis yang justru bisa membuat gambarnya belum siap saat dialog Print
terbuka.

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

# Navigasi keyboard

Isian data di pabrik dilakukan sambil memegang barang, jadi berpindah ke
mouse mahal. Aturannya ada di `lib/keyboard.ts` (bersih dari import server)
dan `components/KeyboardShortcuts.tsx` (dipasang sekali di layout).

| Tombol | Guna |
| --- | --- |
| Tab | pindah field, bawaan HTML, jangan diutak-atik |
| Panah atas/bawah | pilih saran di pemilih ketik-cari |
| Enter di pemilih | ambil saran yang tersorot |
| Enter di kolom isian | pindah ke kolom berikutnya (form bertabel item) |
| Esc | tutup daftar saran, tutup dialog, bersihkan kotak cari |
| Ctrl / Cmd + S | simpan form yang sedang dibuka |
| / | lompat ke kotak pencarian halaman daftar |

Empat hal yang menentukan:

- **Saran di pemilih WAJIB `tabIndex={-1}`.** Saran dirender sebagai
  `<button>`, dan tombol ikut urutan Tab. Tanpa itu Tab harus ditekan 30
  kali untuk keluar dari satu pemilih. Ini bukan teori: sebelum
  `lib/keyboard.ts` ada, itulah yang terjadi di form Invoice.
- **`onMouseDown` saja tidak cukup.** Saran dipilih lewat `onMouseDown`
  (supaya `onBlur` input tidak keburu menutup daftar), dan `onMouseDown`
  TIDAK dipicu tombol Enter. Jadi selama Enter tidak ditangani di input,
  saran sama sekali tidak bisa dipilih dengan keyboard. Pakai
  `tombolCombo` di `onKeyDown` input-nya.
- **`tombolCombo` selalu `preventDefault` untuk tombol yang ditanganinya**,
  dan `enterKeFieldBerikutnya` berhenti kalau `e.defaultPrevented`. Itu
  yang mencegah satu Enter dibaca dua kali (memilih saran sekaligus
  meloncat ke kolom berikutnya).
- **Ctrl+S memakai `form.requestSubmit()`, bukan `submit()`.** `submit()`
  melewati validasi bawaan browser DAN handler `onSubmit`, artinya dialog
  konfirmasi ikut terlewat.

`enterKeFieldBerikutnya` dipasang hanya di form yang punya tabel item
(PO, Invoice, Konsinyasi, Receiving, Retur, Pemakaian Bahan, Penyesuaian,
Produksi, Penimbangan, Produk, Material, Harga Client, Parameter QC).
Form pendek seperti Supplier atau INCI dibiarkan: di situ Enter yang
langsung menyimpan justru yang diharapkan.

Shortcut yang tidak diketahui sama dengan tidak ada, karena itu kotak cari
menampilkan lencana `/` selama masih kosong. Kalau menambah shortcut baru,
pikirkan dulu di mana orang akan melihatnya.

# Kolom angka: pemisah ribuan otomatis

Setiap kotak isian angka memakai `components/NumberInput.tsx`. Jangan
menulis `<input inputMode="decimal">` baru dari nol. Harga tujuh digit
tanpa titik hampir tidak bisa dibaca ulang, dan salah satu nol di harga
satuan adalah kesalahan yang paling mahal di aplikasi ini.

Yang membuatnya bisa dipasang di mana-mana tanpa mengubah pemanggil:
ada DUA bentuk angka, dan cuma komponen ini yang tahu keduanya.

| Bentuk   | Contoh     | Ada di                          |
| -------- | ---------- | ------------------------------- |
| NILAI    | `1500.75`  | state React, payload ke server  |
| TAMPILAN | `1.500,75` | yang dilihat & diketik user     |

NILAI memakai titik desimal, jadi `parseFloat` / `Number` di server
action maupun di penghitung total tetap jalan apa adanya. Rumusnya di
`lib/angka.ts`, bersih dari import server.

Kontraknya sengaja beda dengan `<input>` biasa, dan itu yang bikin
migrasi ketahuan kalau ada yang terlewat:

```tsx
<NumberInput value={row.harga} onChange={(nilai) => updateRow(idx, { harga: nilai })} />
```

Lima aturan yang menentukan:

- **State disimpan sebagai NILAI, bukan tampilan.** Isian awal dari
  database ditulis `String(n)` saja. Dulu beberapa form menyediakannya
  lewat `String(n).replace(".", ",")` supaya terbaca Indonesia; itu
  sudah dihapus. Koma di state berarti ada dua sumber kebenaran dan
  setiap pembaca harus ingat menormalkannya.
- **Titik yang BARU diketik selalu berarti desimal.** Titik yang sudah
  ada di layar cuma pemisah ribuan yang disisipkan komponen ini, jadi
  yang baru ditekan orang ditandai dulu sebelum sisanya dibuang. Tanpa
  itu "1.5" terbaca 15. Papan angka di keyboard cuma punya titik, jadi
  memaksa orang mengetik koma bukan pilihan.
- **Tebakan titik-desimal untuk TEMPELAN saja.** Titik yang tidak
  diikuti tepat tiga angka tidak mungkin pemisah ribuan, jadi
  `1500.75` dari spreadsheet ikut terbaca benar. Aturan itu TIDAK boleh
  dipakai di jalur mengetik: "1.500" yang angka 5-nya baru dihapus
  sempat berbentuk "1.00", dan menebaknya di situ mengubah 100 jadi 1.
- **Kursor dipulihkan dengan menghitung angka, bukan karakter.**
  Pemisah ribuan bergeser tiap ketikan, jadi menyimpan indeks mentah
  akan melempar kursor ke ujung begitu ada titik baru muncul. Ini bukan
  detail kosmetik: mengetik di tengah "1.500.000" adalah hal biasa.
- **Backspace yang cuma kena titik ikut menghapus angka di
  sebelahnya.** Kalau tidak, titiknya langsung muncul lagi dan
  tombolnya terasa rusak.

`bulat` untuk kolom yang tidak pernah pecahan (qty pcs, tempo hari):
koma sama sekali ditolak. `negatif` untuk yang boleh minus.

**Tombol yang MENGISI kotak angka wajib menulis NILAI, bukan hasil
`toLocaleString`.** Ini sudah sekali lolos: tombol "Isi penuh" di
`PaymentPanel` mengisi state dengan `sisa.toLocaleString("id-ID")`,
jadi state berisi `"1.500.000"`. Bagi komponen ini titik adalah
pemisah DESIMAL di sisi NILAI, sehingga yang tampil jadi `1,500.000`
dan `Number(...)` di pemanggilnya menghasilkan `NaN`. Gejalanya
menyesatkan: tombolnya kelihatan bekerja, tapi simpannya ditolak
dengan pesan "isi jumlah dulu". Yang benar `String(n)`, dan `String(
Math.round(n))` untuk kotak `bulat`.

Pengecualian yang disengaja: kotak nomor halaman di
`components/Pagination.tsx`. Itu penunjuk halaman, bukan jumlah, dan
"halaman 1.024" salah baca.

Placeholder dan ringkasan `ConfirmSave` yang memuat angka ikut
diformat. Placeholder "45000" di sebelah kotak yang menampilkan
"45.000" membuat orang ragu apakah titiknya ikut tersimpan.

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

File yang lahir dengan aturan itu sejak awal: `lib/clientPrice.ts`,
`lib/angka.ts`, `lib/keyboard.ts`, `lib/dates.ts`, `lib/sidebarPref.ts`,
`lib/moq.ts`, `lib/rnd.ts`, dan `lib/rndCost.ts`. Yang menyentuh
database berdiri terpisah, mis. `app/(app)/rnd/data.ts` yang menyusun
daftar bahan untuk layar R&D.

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

## Tombol Pasang: event-nya ditangkap skrip inline, bukan `useEffect`

Chrome tidak menyediakan API "pasang sekarang" yang bisa dipanggil kapan
saja. Yang ada cuma event `beforeinstallprompt`, dan aturannya keras:
**dipicu sekali, dan objeknya harus disimpan** karena `prompt()` hanya
boleh dipanggil dari gestur user.

Waktu pemicunya itu yang jadi jebakan. Pada kunjungan PERTAMA event-nya
datang telat, sesudah service worker terdaftar, jadi listener di
`useEffect` sempat terpasang. Pada kunjungan kedua service worker sudah
aktif dan manifest sudah di-cache browser, jadi Chrome memicunya nyaris
bersamaan dengan parsing HTML, sebelum React hidrasi. Listener yang
dipasang belakangan ketinggalan kereta dan tombolnya tidak pernah
muncul, **cuma pada sebagian pengguna**, yaitu bentuk bug yang paling
sulit dipercaya waktu dilaporkan.

Karena itu penangkapnya skrip inline di `app/layout.tsx`, jalan saat
HTML diurai, menyimpan event ke `window.__pwaPrompt` lalu mengirim
event `pwa-status`. `lib/pwaInstall.ts` cuma membaca hasil tangkapan itu
sebagai external store, dan `components/InstallAppButton.tsx` membacanya
lewat `useSyncExternalStore`, alasan yang sama dengan `localStorage` di
bab State klien. Skrip inline itu kelihatan mubazir, jangan dipindah ke
`useEffect`.

Empat keadaan, dan dua di antaranya tidak merender apa pun:

| Keadaan | Tombol |
| --- | --- |
| `terpasang` (dibuka dari home screen) | tidak ada |
| `siap` (event tertangkap) | buka dialog pasang browser |
| `ios` (Safari di iPhone/iPad) | buka petunjuk manual |
| `tidak-bisa` | tidak ada |

**iOS tidak akan pernah punya `beforeinstallprompt`.** Satu-satunya
jalan di sana adalah Bagikan lalu "Tambahkan ke Layar Utama", jadi yang
bisa diberikan aplikasi cuma petunjuknya. Petunjuk itu ditahan supaya
tidak muncul di Chrome/Firefox versi iOS (`CriOS`/`FxiOS`): keduanya
memakai WebKit tapi tidak punya menu itu, jadi petunjuknya cuma
menyesatkan.

**Tombol yang tidak bisa memasang apa pun harus hilang, bukan
dinonaktifkan.** Tombol pasang yang ditekan lalu tidak terjadi apa-apa
terbaca sebagai pemasangan yang gagal, dan orang akan mencoba lagi.

Tempatnya dua: kaki sidebar di sebelah kanan Keluar (ikon saja), dan
halaman login. Login dipilih karena itu satu-satunya halaman yang pasti
dilihat semua orang, termasuk yang belum pernah masuk sama sekali.

**Mengujinya wajib `npm run build && npm start`,** bukan `npm run dev`:
di dev service worker justru dicabut (lihat aturan di atas), dan tanpa
service worker aktif Chrome tidak pernah memicu event-nya.

# Izin per aksi: satu kolom, dua sisi penjaga

Selain `allowed_modules`, ada izin per aksi di `profiles`:
`can_approve_po`, `can_plan_production`, `can_qc`, `can_qa`, dan
`can_cancel`. Bentuk pemeriksaannya selalu sama dan harus ditiru
apa adanya, karena Admin dan super admin tidak pernah dicentang
satu per satu:

```ts
const boleh =
  isSuperAdmin || profile?.role === "Admin" || !!profile?.can_cancel;
```

**Dipasang di DUA sisi: halaman (menyembunyikan tombol) dan server
action (menolak).** Menyembunyikan tombol saja bukan pembatasan
akses: server action punya URL sendiri dan bisa dipanggil dari mana
saja.

Dua aksi yang tidak kelihatan seperti "batal transaksi" tapi izinnya
memang itu:

| Aksi | Izin | Kenapa |
| --- | --- | --- |
| Hapus baris pembayaran (`deleteSalesPayment`) | `can_cancel` | Menurunkan jumlah yang sudah dibayar, bisa menurunkan status Lunas jadi Belum Lunas, dan itu mengubah tagihan yang sudah diakui ke client |
| Ubah no. batch produksi (`updatePlanNoBatch` / `updateBatchNoBatch`) | `can_plan_production` | Nomor batch lahir di layar Plan, jadi yang berhak menulisnya juga yang berhak membetulkan salah ketiknya |

**Nomor batch tersimpan di dua tabel**, `production_plans.no_batch`
dan `production_batches.no_batch_produksi` (yang kedua disalin dari
yang pertama waktu Input Hasil). Perbaikannya selalu menyentuh
pasangannya juga: membetulkan satu sisi saja menghasilkan batch
record yang nomornya beda dengan instruksi produksinya, kesalahan
yang jauh lebih sulit dilacak daripada salah ketik yang mau
dibetulkan. Jejaknya tidak perlu ditulis dari aplikasi, trigger
`log_activity` sudah memantau kedua kolom itu.

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

**Tanda Terima Konsinyasi = satu dokumen per pengiriman.** Kurir yang
mengantar beberapa CSG sekaligus ke satu outlet membawa beberapa lembar.
Menggabungkannya butuh dokumen yang merujuk banyak `consignments`
sekaligus, dan nomor dokumennya sendiri.

**Tanda Terima Konsinyasi belum punya kolom kondisi barang.** Penerima
bisa tanda tangan tapi tidak punya tempat mencatat "1 botol penyok" di
kertas yang sama, jadi keberatan seperti itu tercatat di luar sistem.

**Model pajak penerimaan tidak bisa dibetulkan tanpa mengulang
dokumennya.** HPP batch dihitung saat penerimaan disimpan, jadi faktur
yang terlanjur dicatat dengan model yang salah harus dibatalkan lalu
dimasukkan ulang. Menyunting `receivings.tax_mode` langsung di database
TIDAK menghitung ulang `harga_per_unit` batch-nya: totalnya berubah,
HPP-nya tetap salah, dan tidak ada tanda apa pun. Kalau nanti dibuat
layar koreksi, yang harus ikut dikerjakan bukan cuma header fakturnya
melainkan seluruh batch yang lahir darinya, dan cuma selama belum ada
yang terpakai produksi.

**Retur konsinyasi tidak mencatat asal stoknya, jadi tidak bisa
dibatalkan.** `retur_outlet_tx` memanggil `consignment_take` tapi sengaja
tidak menulis `consignment_sale_lines`: barangnya sudah kembali ke gudang
dan tidak ada dokumen yang bisa dibatalkan sesudahnya. Kalau nanti retur
konsinyasi diberi dokumennya sendiri, catatan asalnya harus ikut ditulis,
persis alasan yang sama dengan penjualannya.

**Kolom yang nilainya dihitung di TypeScript belum bisa diurutkan.**
"Harga Terakhir" dan "Stok Sisa" di Stock Items, "Total" di PO, "Sisa
Bayar" di Payments: angkanya lahir dari query kedua yang cuma mengambil
baris halaman yang sedang tampil. Memberi tombol urut di situ akan
mengurutkan satu halaman saja, dan hasilnya kelihatan benar padahal
bukan. Perbaikan sebenarnya: pindahkan perhitungannya ke database (view
atau kolom turunan) supaya bisa masuk `.order()`. Kolom relasi
(`suppliers(nama)`, `clients(company_brand)`) juga belum, karena urutannya
harus dikerjakan PostgREST lewat embed dan itu perlu diuji tersendiri.

**Nomor batch yang dibetulkan tidak mengubah kertas yang sudah
tercetak.** Label batch, Certificate of Analysis, lembar QC, dan batch
record yang terlanjur keluar dari printer tetap memuat nomor lama, dan
tidak ada yang mencatat bahwa dokumen itu perlu dicetak ulang. Sekarang
peringatannya cuma kalimat di dialog Ubah No. Batch. Kalau nanti dirasa
kurang, yang dibutuhkan bukan larangan mengubah nomor melainkan daftar
dokumen yang sudah dicetak per batch.

**Formula R&D yang disetujui berhenti sebagai penanda.** Menurunkannya
jadi Produk dikerjakan tangan di master Products, dan itu keputusan
pemakainya untuk sekarang, bukan pekerjaan yang tertunda. Kalau nanti
diinginkan tombolnya, yang harus diputuskan lebih dulu bukan soal
teknis: `products` menyimpan varian, kemasan per varian, dan tahapan
proses yang tidak punya padanan di formula develop, jadi pemetaannya
harus disepakati, bukan ditebak.

**Satuan bahan baku diasumsikan kg di seluruh hitungan R&D.** Sama
dengan asumsi yang sudah dipakai modul produksi, jadi bahan yang
satuannya liter atau pcs akan menghasilkan angka takaran yang benar
secara proporsi tapi salah satuannya di lembar kerja. Untuk bahan yang
belum punya item stok asumsinya lebih tebal lagi, karena satuannya
memang belum pernah ditulis di mana pun.

**Logo perusahaan tidak tercetak di nota 58 mm.** Kertas thermal cuma
punya satu warna dan logo berwarna lebih sering keluar jadi blok hitam
daripada terbaca. Kalau nanti diinginkan, yang dibutuhkan bukan logo yang
sama melainkan versi 1-bit hitam-putih tersendiri.
