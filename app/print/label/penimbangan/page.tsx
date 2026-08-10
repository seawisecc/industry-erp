/* ============================================================
   Label penimbangan bahan — ditempel di wadah hasil timbang.

   Isinya datang dari QUERY STRING, bukan dari database, dan itu
   disengaja. Label ini dicetak di tengah penimbangan, saat angka
   timbangnya masih ada di form eksekusi dan BELUM tersimpan sebagai
   dokumen apa pun. Menunggu simpan berarti operator harus menyimpan
   setengah jadi cuma untuk bisa mencetak; mengarang datanya dari
   formula berarti label mencetak angka teoritis, bukan yang benar-
   benar ditimbang.

   Karena isinya tidak diverifikasi ke database, label ini tidak
   pernah menjadi bukti apa pun — buktinya tetap `execution_data`
   dan Batch Record. Label cuma penanda fisik di lantai produksi.
   ============================================================ */

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { APP_TIMEZONE } from "@/lib/dates";
import {
  Field,
  FieldPair,
  LabelBox,
  LabelFooter,
  LabelHeader,
  LabelPage,
  LabelSheet,
} from "../LabelKit";
import LabelToolbar from "../LabelToolbar";

type Query = Record<string, string | string[] | undefined>;

/** Ambil satu nilai teks, dipangkas supaya URL usil tidak merusak layout. */
function teks(q: Query, key: string, maks = 120): string | null {
  const v = q[key];
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  if (!s) return null;
  return s.length > maks ? s.slice(0, maks) + "…" : s;
}

const tanggalFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const jamFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export default async function PrintWeighLabelPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const q = await searchParams;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();
  const { data: org } = await supabase
    .from("organizations")
    .select("nama")
    .eq("id", organizationId)
    .single();

  // Waktu timbang dikirim dari klien saat tombol ditekan. Kalau tidak
  // ada (URL disalin manual), jatuh ke waktu cetak.
  const tRaw = teks(q, "t", 40);
  const t = tRaw && !Number.isNaN(Date.parse(tRaw)) ? new Date(tRaw) : new Date();

  const jumlah = [teks(q, "qty", 24), teks(q, "satuan", 16)]
    .filter(Boolean)
    .join(" ");

  return (
    <LabelPage>
      <LabelToolbar label="Cetak Label" />
      <LabelSheet>
        <LabelHeader
          org={org?.nama}
          judul="PENIMBANGAN"
          subjudul="Label Penimbangan Bahan"
        />
        <LabelBox>
          <Field label="Nama Bahan" value={teks(q, "bahan")} besar />
          <FieldPair>
            <Field label="Kode Bahan" value={teks(q, "kode", 40)} mono />
            <Field label="Jumlah" value={jumlah || null} besar />
          </FieldPair>
          <FieldPair>
            <Field label="Pencampuran" value={teks(q, "fase", 40)} />
            <Field label="Ditimbang Oleh" value={teks(q, "oleh", 60)} />
          </FieldPair>
          <FieldPair>
            <Field label="Tanggal" value={tanggalFmt.format(t)} />
            <Field label="Waktu" value={jamFmt.format(t)} />
          </FieldPair>
          <Field label="Gunakan Untuk" value={teks(q, "guna")} />
          <Field label="Produk" value={teks(q, "produk")} />
          <Field label="Batch" value={teks(q, "batch", 60)} mono besar />
        </LabelBox>
        <LabelFooter jejak="Penanda fisik, bukan dokumen bukti · dokumen resminya Batch Record" />
      </LabelSheet>
    </LabelPage>
  );
}
