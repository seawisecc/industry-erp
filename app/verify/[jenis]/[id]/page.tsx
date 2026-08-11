/* ============================================================
   Halaman verifikasi dokumen — PUBLIK, tanpa login.

   Yang ditampilkan dibatasi ketat dan daftarnya sengaja ditulis di
   sini supaya perluasannya harus disengaja: jenis dokumen, nomor,
   tanggal, nama perusahaan penerbit, nama & jabatan pengesah, dan
   hasil pencocokan sidik.

   Yang TIDAK PERNAH ditampilkan: isi dokumennya. Tidak ada baris
   item, harga, hasil uji, supplier, atau client. Halaman ini dibuka
   siapa pun yang memegang kertasnya — termasuk orang yang tidak
   seharusnya tahu berapa harga beli bahan.

   Dibaca dengan service role karena pemindainya memang tidak punya
   sesi. Karena itu SELECT-nya harus sempit, bukan `select("*")` yang
   kebetulan cuma dipakai sebagian: RLS tidak menolong di sini, satu-
   satunya yang membatasi adalah kolom yang diminta.

   `id` dokumen berupa UUID acak, jadi daftar dokumen tidak bisa
   ditelusuri dengan menebak-nebak URL.
   ============================================================ */

import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { JUDUL_DOKUMEN } from "@/lib/qrSign";
import { bacaQrDoc, pengesahQr, type SignSlot } from "@/lib/docSign";
import { ambilRingkasan, isDocType, sidikDokumen } from "@/lib/qrSignServer";

export const dynamic = "force-dynamic";

function formatTanggal(iso: string) {
  if (!iso) return "-";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("id-ID", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ jenis: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { jenis, id } = await params;
  const sp = await searchParams;
  const sidikDiUrl = (Array.isArray(sp.s) ? sp.s[0] : sp.s)?.trim() || null;

  if (!isDocType(jenis)) notFound();

  const admin = createAdminClient();
  const ringkas = await ambilRingkasan(admin, jenis, id);

  // Pengesahnya dibaca dari pengaturan JENIS DOKUMEN ini, sumber yang
  // sama dengan yang dipakai halaman cetak. Lembar uji produk jadi
  // berbagi pengaturan dengan lembar uji bahan ("qc"), sama seperti
  // kolom tanda tangannya.
  const kunciPengaturan = ringkas?.jenis === "qc-produk" ? "qc" : ringkas?.jenis;

  const [{ data: org }, { data: signRow }] = ringkas
    ? await Promise.all([
        admin
          .from("organizations")
          .select("nama")
          .eq("id", ringkas.organizationId)
          .maybeSingle(),
        admin
          .from("doc_sign_settings")
          .select("slots, qr_sign")
          .eq("organization_id", ringkas.organizationId)
          .eq("doc_type", kunciPengaturan)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  const slots: SignSlot[] = Array.isArray(signRow?.slots)
    ? (signRow.slots as SignSlot[])
    : [];
  const pengesah = pengesahQr(slots, bacaQrDoc(signRow?.qr_sign));
  const sidik = ringkas ? sidikDokumen(ringkas) : null;

  // Tiga kemungkinan, dan ketiganya harus dibedakan dengan jelas.
  // "Tidak ditemukan" bukan hal yang sama dengan "sidik tidak cocok":
  // yang pertama berarti dokumennya tidak pernah ada atau sudah
  // dibatalkan, yang kedua berarti kertasnya diubah.
  const status: "sah" | "tidak-cocok" | "tidak-ada" = !ringkas
    ? "tidak-ada"
    : sidikDiUrl && sidikDiUrl !== sidik
      ? "tidak-cocok"
      : "sah";

  const TONE = {
    sah: {
      pita: "bg-botanical-700",
      judul: "DOKUMEN SAH",
      pesan: "Dokumen ini benar diterbitkan oleh sistem.",
    },
    "tidak-cocok": {
      pita: "bg-clay-600",
      judul: "SIDIK TIDAK COCOK",
      pesan:
        "Dokumennya ada, tapi sidik pada QR tidak sama dengan sidik dokumen saat ini. Nomor atau tanggalnya berubah sesudah kertas ini dicetak.",
    },
    "tidak-ada": {
      pita: "bg-clay-600",
      judul: "TIDAK DITEMUKAN",
      pesan:
        "Tidak ada dokumen dengan tautan ini. Dokumennya belum pernah terbit, sudah dibatalkan, atau QR-nya tidak berasal dari sistem ini.",
    },
  }[status];

  return (
    <div className="min-h-dvh flex items-start sm:items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-lg">
        <div className="glass rounded-2xl overflow-hidden">
          <div className={`${TONE.pita} px-6 py-5 text-white`}>
            <div className="text-[11px] uppercase tracking-[0.18em] opacity-90">
              Verifikasi Dokumen
            </div>
            <div className="font-display text-[22px] font-semibold mt-0.5">
              {TONE.judul}
            </div>
          </div>

          <div className="p-6">
            <p className="text-[13px] text-muted">{TONE.pesan}</p>

            {ringkas && (
              <div className="mt-5 flex flex-col gap-3.5">
                <Baris label="Jenis Dokumen" nilai={JUDUL_DOKUMEN[ringkas.jenis]} />
                <Baris label="Nomor" nilai={ringkas.nomor} mono />
                <Baris label="Tanggal" nilai={formatTanggal(ringkas.tanggal)} />
                <Baris label="Diterbitkan Oleh" nilai={org?.nama || "-"} />
                {pengesah && (
                  <Baris
                    label={pengesah.label.replace(/,$/, "")}
                    nilai={
                      <>
                        {pengesah.nama}
                        <span className="block text-[12px] text-muted">
                          {pengesah.jabatan}
                        </span>
                      </>
                    }
                  />
                )}
                <Baris label="Sidik Dokumen" nilai={sidik} mono />
              </div>
            )}

            <p className="mt-6 pt-4 border-t border-line text-[11.5px] text-muted leading-relaxed">
              Halaman ini hanya memastikan dokumen benar terbit dari sistem,
              dan tidak menampilkan isinya. Pengesahan ini{" "}
              <b>non-certified</b>: validasi internal, bukan tanda tangan
              elektronik tersertifikasi.
            </p>
          </div>
        </div>

        <div className="text-center text-[11.5px] text-muted mt-4">
          Industry Management by Seawise Studio
        </div>
      </div>
    </div>
  );
}

function Baris({
  label,
  nilai,
  mono = false,
}: {
  label: string;
  nilai: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[11.5px] uppercase tracking-wide text-muted flex-shrink-0">
        {label}
      </span>
      <span
        className={`text-[13.5px] font-medium text-right min-w-0 break-words ${
          mono ? "font-mono" : ""
        }`}
      >
        {nilai}
      </span>
    </div>
  );
}
