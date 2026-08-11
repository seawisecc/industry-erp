-- ============================================================
-- Tanggal pengambilan sampel produk jadi.
--
-- Bahan masuk sudah punya qc_tanggal_sampling terpisah dari
-- qc_tanggal_uji; produk jadi cuma punya tanggal uji. Selama tidak
-- ada label sampel, itu tidak terasa. Begitu label "Sampel Telah
-- Diambil" dicetak, bedanya jadi penting: label yang mencetak
-- tanggal UJI di kolom "Tanggal Pengambilan" adalah dokumen yang
-- berbohong pelan-pelan, dan sampel biasanya memang diambil lebih
-- dulu daripada diuji.
-- ============================================================

alter table production_batches
  add column if not exists qc_produk_tanggal_sampling date;
