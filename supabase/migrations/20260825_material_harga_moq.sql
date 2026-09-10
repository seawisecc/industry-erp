-- ============================================================
-- Harga referensi & MOQ di master Material.
--
-- MASALAH YANG DISELESAIKAN
--
-- Harga bahan selama ini cuma lahir dari pembelian
-- (`purchase_batches.harga_per_unit`). Itu benar untuk biaya, tapi
-- meninggalkan lubang persis di tempat modul R&D bekerja: bahan yang
-- BELUM PERNAH DIBELI tidak punya harga sama sekali, jadi perkiraan
-- biaya formula menghitungnya sebagai nol. Formula yang setengah
-- bahannya belum pernah dibeli akan tampak murah, dan angka itu yang
-- dipakai menyusun penawaran.
--
-- Hal yang sama berlaku untuk MOQ. `items.moq` sudah ada dan dipakai
-- PPIC, Guide Order, dan validasi PO, tapi bahan yang belum jadi item
-- belum punya tempat menyimpannya, padahal MOQ adalah syarat
-- SUPPLIER, yang sudah diketahui sejak penawaran pertama, jauh
-- sebelum barangnya masuk gudang.
--
-- ATURAN URUTANNYA, SATU KALIMAT
--
-- Yang NYATA menang atas yang DIKETIK:
--
--   harga = pembelian terakhir, kalau belum pernah dibeli baru
--           materials.harga_referensi
--   MOQ   = items.moq kalau materialnya sudah punya item,
--           kalau belum baru materials.moq
--
-- Dua kolom ini karena itu TIDAK PERNAH jadi HPP. `harga_referensi`
-- adalah harga penawaran, angka ketikan manusia; HPP tetap cuma dari
-- `harga_per_unit` seperti yang tertulis di bab Dua harga per batch.
-- Kalau harga referensi sampai bocor ke biaya produksi atau nilai
-- stok, yang terjadi persis bug terburuk yang dijaga di seluruh
-- dokumen ini: angka di layar berbeda dengan angka yang dihitung
-- ulang sistem.
--
-- `harga_referensi` DISIMPAN TANPA PPN, sama seperti `harga_per_unit`.
-- Penawaran supplier sering sudah memuat PPN, dan menyalinnya
-- bulat-bulat akan membuat perkiraan biaya menggelembung sekitar 11%
-- tanpa ada yang menyadarinya.
--
-- URUTAN DEPLOY: jalankan skrip ini SEBELUM men-deploy aplikasi.
-- Aman dijalankan berulang.
-- ============================================================

alter table public.materials
  add column if not exists harga_referensi numeric;

alter table public.materials
  add column if not exists moq numeric;


-- ============================================================
-- Backfill MOQ dari item yang sudah ter-link.
--
-- Supaya form Material tidak tampil kosong untuk bahan yang MOQ-nya
-- sudah lama diisi di sisi item. Yang menang tetap `items.moq`; ini
-- cuma membuat angka bawaannya sama, jadi tidak ada yang terlihat
-- "hilang" waktu kolomnya pertama kali muncul.
--
-- Harga sengaja TIDAK di-backfill dari pembelian: `harga_referensi`
-- cuma dibaca kalau bahannya belum pernah dibeli, jadi menyalin harga
-- pembelian ke sana tidak pernah terpakai, dan cuma jadi angka basi
-- yang menyesatkan kalau aturannya berubah.
-- ============================================================

update public.materials m
set moq = i.moq
from public.items i
where m.item_id = i.id
  and m.organization_id = i.organization_id
  and m.moq is null
  and i.moq is not null;
