/* ============================================================
   Label "Sampel Telah Diambil" — ditempel di wadah induk yang
   sampelnya baru saja diambil QC.

   Isinya lewat query string, alasan yang sama persis dengan label
   penimbangan: jumlah sampel & tanggal pengambilan masih berupa
   isian di lembar pengujian yang belum tentu tersimpan, dan petugas
   QC yang sedang berdiri di depan drum tidak boleh dipaksa menyimpan
   lembar setengah jadi cuma untuk mencetak label.

   Label ini menjawab satu pertanyaan yang selalu muncul di gudang:
   "drum ini kenapa sudah terbuka segelnya?" — jawabannya tercetak
   di badannya, lengkap dengan siapa yang mengambil dan kapan.
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
  SignField,
  tanggalLabel,
  waktuCetak,
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

const jamFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export default async function PrintSampleLabelPage({
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

  // Produk jadi dan bahan baku memakai label yang sama, cuma beda
  // sebutan barang & lawan bicaranya.
  const produkJadi = teks(q, "jenis", 20) === "produk";

  const dicetak = new Date();

  return (
    <LabelPage>
      <LabelToolbar label="Cetak Label Sampel" />
      <LabelSheet>
        <LabelHeader
          org={org?.nama}
          judul="SAMPLED"
          subjudul="Sampel telah diambil QC"
        />
        <LabelBox>
          <Field
            label={produkJadi ? "Nama Produk Jadi" : "Nama Bahan"}
            value={teks(q, "nama")}
            besar
          />
          <FieldPair>
            <Field label="Kode" value={teks(q, "kode", 40)} mono />
            <Field label="Jumlah Sampel" value={teks(q, "sampel", 40)} besar />
          </FieldPair>
          <Field
            label={produkJadi ? "No. Batch Produksi" : "Nomor Batch / Lot"}
            value={teks(q, "batch", 60)}
            mono
          />
          <FieldPair>
            <Field
              label={produkJadi ? "Varian / Brand" : "Supplier"}
              value={teks(q, "pihak")}
            />
            <Field label="Jumlah Lot" value={teks(q, "qty", 40)} />
          </FieldPair>
          <FieldPair>
            <Field
              label="Tgl Pengambilan"
              value={tanggalLabel(teks(q, "tglSampling", 12))}
            />
            <Field label="Jam Cetak" value={jamFmt.format(dicetak)} />
          </FieldPair>
          {/* Tanggal uji sering belum diisi saat sampel baru diambil —
              kalau kosong, barisnya jadi garis untuk ditulis tangan. */}
          <Field
            label="Rencana Tanggal Uji"
            value={tanggalLabel(teks(q, "tglUji", 12))}
          />
          <SignField label="Diambil Oleh (QC)" nama={teks(q, "oleh", 60)} />
        </LabelBox>
        <LabelFooter
          jejak={`Sisa isi wadah tetap berstatus karantina · Dicetak ${waktuCetak(dicetak)}`}
        />
      </LabelSheet>
    </LabelPage>
  );
}
