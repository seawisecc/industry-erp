/* ============================================================
   Pil status ketersediaan bahan.

   Satu komponen, dipakai pemilih di form, tabel formula, dan tabel
   kebutuhan produksi. Bahan yang sama harus terbaca sama di ketiganya:
   pil yang bunyinya beda antar layar membuat orang mengira keadaannya
   memang beda.

   Bukan komponen klien, jadi halaman server bisa memakainya langsung,
   dan komponen klien yang mengimpornya ikut membawanya ke bundle
   seperti markup biasa.
   ============================================================ */

import {
  ketersediaanBahan,
  LABEL_KETERSEDIAAN,
  type BahanRnd,
} from "@/lib/rndCost";

export default function BahanStatus({
  bahan,
  ukuran = "normal",
}: {
  bahan: Pick<BahanRnd, "item_id" | "pernahDibeli"> | undefined | null;
  /** "kecil" untuk daftar saran yang barisnya padat */
  ukuran?: "normal" | "kecil";
}) {
  if (!bahan) return null;
  const status = ketersediaanBahan(bahan);
  if (status === "ada") return null;

  const { pendek, judul } = LABEL_KETERSEDIAAN[status];

  return (
    <span
      title={judul}
      className={`inline-flex flex-shrink-0 rounded-full font-medium bg-amber-100 text-amber-500 ${
        ukuran === "kecil"
          ? "px-1.5 py-0.5 text-[10px]"
          : "px-1.5 py-0.5 text-[10.5px]"
      }`}
    >
      {pendek}
    </span>
  );
}
