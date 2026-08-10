/* ============================================================
   Label status QC: QUARANTINE / RELEASE / REJECT.

   Satu komponen untuk bahan baku, bahan kemas, DAN produk jadi —
   sama seperti formulir aslinya yang berjudul "Nama Bahan Baku /
   Produk Jadi". Yang membedakan cuma isi dua field: lawan bicaranya
   (supplier vs varian produk) dan tanggal masuknya (penerimaan vs
   produksi), jadi keduanya dikirim sebagai label + nilai, bukan
   dicabang di dalam.

   Kata statusnya tetap Inggris karena itu istilah baku CPKB yang
   ditempel di karantina gudang — baris penjelas di bawahnya yang
   berbahasa Indonesia.
   ============================================================ */

import {
  Field,
  FieldPair,
  LabelBox,
  LabelFooter,
  LabelHeader,
  LabelSheet,
  SignField,
} from "./LabelKit";

export type StatusKey = "Karantina" | "Released" | "Rejected";

const JUDUL: Record<StatusKey, { kata: string; arti: string }> = {
  Karantina: { kata: "QUARANTINE", arti: "Karantina, belum boleh dipakai" },
  Released: { kata: "RELEASE", arti: "Lulus uji, boleh dipakai" },
  Rejected: { kata: "REJECT", arti: "Ditolak, jangan dipakai" },
};

/**
 * Status kolom database → kata di label.
 *
 * Produk jadi memakai istilah "Hold" untuk karantina, bahan memakai
 * "Karantina" — dua-duanya berarti ditahan.
 *
 * NULL berarti TIDAK ditahan, bukan karantina: itu batch lama atau
 * organisasi yang modul QA/QC-nya mati, dan `fg_stock_calc` sudah
 * menghitungnya sebagai stok siap jual (`qa_status is null or
 * 'Released'`). Kalau di sini null dianggap karantina, barang yang
 * boleh dijual akan keluar dari printer ber-label QUARANTINE — persis
 * jenis ketidakcocokan layar-vs-sistem yang paling mahal di gudang.
 */
export function statusLabelKey(raw: string | null | undefined): StatusKey {
  if (raw === "Rejected") return "Rejected";
  if (raw === "Karantina" || raw === "Hold") return "Karantina";
  return "Released";
}

/** Kata di pita label — dipakai juga sebagai teks tombol cetaknya. */
export function statusKata(status: StatusKey) {
  return JUDUL[status].kata;
}

export type StatusLabelData = {
  status: StatusKey;
  /** "Nama Bahan Baku" atau "Nama Produk Jadi" */
  namaLabel: string;
  nama: string;
  kode: string | null;
  noBatch: string | null;
  jumlah: string | null;
  pihakLabel: string;
  pihak: string | null;
  expDate: string | null;
  masukLabel: string;
  masuk: string | null;
  /** Alasan penolakan — hanya dicetak pada label REJECT */
  catatan: string | null;
  petugas: string | null;
  jejak: string;
};

export default function StatusLabel({
  data,
  org,
  terakhir = true,
}: {
  data: StatusLabelData;
  org?: string | null;
  terakhir?: boolean;
}) {
  const j = JUDUL[data.status];
  return (
    <LabelSheet terakhir={terakhir}>
      <LabelHeader org={org} judul={j.kata} subjudul={j.arti} />
      <LabelBox>
        <Field label={data.namaLabel} value={data.nama} besar />
        <FieldPair>
          <Field label="Kode" value={data.kode} mono />
          <Field label="Jumlah" value={data.jumlah} />
        </FieldPair>
        <Field label="Nomor Batch" value={data.noBatch} mono />
        <Field label={data.pihakLabel} value={data.pihak} />
        <FieldPair>
          <Field label={data.masukLabel} value={data.masuk} />
          <Field label="Kedaluwarsa" value={data.expDate} />
        </FieldPair>
        {data.status === "Rejected" && data.catatan && (
          <Field label="Alasan Penolakan" value={data.catatan} />
        )}
        <SignField label="Petugas Berwenang" nama={data.petugas} />
      </LabelBox>
      <LabelFooter jejak={data.jejak} />
    </LabelSheet>
  );
}
