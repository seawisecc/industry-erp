/* ============================================================
   Terjemahan satu baris `purchase_batches` jadi isi label status.

   Dipakai dua halaman: label satu lot (/print/label/lot/[id]) dan
   label seluruh lot satu penerimaan (/print/label/receiving/[id]).
   Keduanya harus menghasilkan label yang identik untuk lot yang
   sama — makanya pemetaannya di sini, bukan disalin dua kali.
   ============================================================ */

import { tanggalLabel, waktuCetak } from "./LabelKit";
import { statusLabelKey, type StatusLabelData } from "./StatusLabel";

export const LOT_SELECT =
  "id, no_lot_supplier, tanggal_terima, exp_date, qty_masuk, supplier_nama, " +
  "qc_status, qc_oleh, qc_note, items(kode, nama, satuan)";

export type LotRaw = {
  id: string;
  no_lot_supplier: string | null;
  tanggal_terima: string;
  exp_date: string | null;
  qty_masuk: number;
  supplier_nama: string | null;
  qc_status: string | null;
  qc_oleh: string | null;
  qc_note: string | null;
  items: { kode: string; nama: string; satuan: string } | null;
};

export function lotLabelData(b: LotRaw, dicetak: string): StatusLabelData {
  return {
    status: statusLabelKey(b.qc_status),
    namaLabel: "Nama Bahan",
    nama: b.items?.nama || "-",
    kode: b.items?.kode || null,
    noBatch: b.no_lot_supplier,
    // Jumlah yang DITERIMA, bukan sisa stok: label menempel di fisik
    // lotnya dan angkanya tidak boleh berubah tiap bahan dipakai.
    jumlah: `${Number(b.qty_masuk).toLocaleString("id-ID", {
      maximumFractionDigits: 3,
    })} ${b.items?.satuan || ""}`.trim(),
    pihakLabel: "Supplier",
    pihak: b.supplier_nama,
    expDate: tanggalLabel(b.exp_date),
    masukLabel: "Tgl Penerimaan",
    masuk: tanggalLabel(b.tanggal_terima),
    catatan: b.qc_note,
    // Kosong selama masih karantina — barisnya jadi ruang tanda tangan
    // petugas gudang, bukan "-".
    petugas: b.qc_oleh,
    jejak: `${b.no_lot_supplier ? `Lot ${b.no_lot_supplier} · ` : ""}Dicetak ${dicetak}`,
  };
}

/** Satu stempel waktu untuk seluruh label dalam satu kali cetak. */
export function stempelCetak() {
  return waktuCetak();
}
