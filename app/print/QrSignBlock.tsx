/* ============================================================
   Blok QR Signature di kaki dokumen cetak A4.

   Pengesahnya PER JENIS DOKUMEN dan diambil dari kolom tanda tangan
   dokumen itu sendiri: PO disahkan COO, Batch Record diketahui Kepala
   QA, lembar uji oleh Kepala QC. Yang dipilih di pengaturan cuma
   SLOT-nya ("Disetujui oleh"), namanya ikut yang sudah terisi di slot
   itu, jadi QR tidak mungkin menyebut nama yang berbeda dari kolom
   tanda tangan dokumen yang sama.

   Komponennya memutuskan sendiri kapan menampilkan diri dan
   mengembalikan null kalau pengesahnya tidak sah (slot dimatikan atau
   namanya belum lengkap). Delapan halaman cetak memakainya, dan kalau
   tiap halaman harus memeriksa sendiri, cepat atau lambat ada satu
   yang lupa lalu mencetak QR atas nama pengesah kosong.

   Nomor & tanggalnya juga TIDAK diterima sebagai prop, melainkan
   dibaca lewat ambilRingkasan(), sumber yang sama persis dengan
   halaman verifikasi. Prop akan membuka peluang halaman cetak
   mengirim nomor yang sedikit berbeda, dan sidik yang beda satu
   karakter pun membuat dokumennya tampak palsu saat dipindai.
   ============================================================ */

import { createClient } from "@/lib/supabase/server";
import { getDocSignConfig } from "@/lib/docSignServer";
import type { DocTypeKey } from "@/lib/docSign";
import { type VerifyKey } from "@/lib/qrSign";
import { ambilRingkasan, siapkanQrSign } from "@/lib/qrSignServer";

export default async function QrSignBlock({
  jenis,
  id,
  organizationId,
  docType,
}: {
  /** Menentukan URL & sidik verifikasi */
  jenis: VerifyKey;
  id: string;
  organizationId: string;
  /**
   * Menentukan dari pengaturan mana pengesahnya dibaca. Default sama
   * dengan `jenis`; dikirim terpisah hanya oleh lembar uji produk jadi,
   * yang berbagi pengaturan tanda tangan dengan lembar uji bahan ("qc")
   * tapi harus punya sidik verifikasi sendiri.
   */
  docType?: DocTypeKey;
}) {
  const supabase = await createClient();
  const kunciPengaturan = (docType ?? jenis) as DocTypeKey;

  const [cfg, ringkas] = await Promise.all([
    getDocSignConfig(organizationId, kunciPengaturan),
    ambilRingkasan(supabase, jenis, id),
  ]);

  if (!cfg.pengesah || !ringkas) return null;

  const { url, svg, sidik } = await siapkanQrSign(ringkas);

  return (
    <div className="mt-8 break-inside-avoid">
      <div className="flex gap-4 items-start border border-neutral-400 rounded-sm p-3 max-w-[115mm]">
        {/* dangerouslySetInnerHTML aman di sini: isinya SVG yang kita
            hasilkan sendiri dari URL kita sendiri, tidak ada masukan
            pengguna yang sampai ke sini. */}
        <div
          className="w-[24mm] h-[24mm] flex-shrink-0 [&>svg]:w-full [&>svg]:h-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="min-w-0 text-[10px] leading-snug">
          <div className="font-bold text-[10.5px] uppercase tracking-wide">
            Disahkan Secara Elektronik
          </div>
          {/* Label slotnya ikut tercetak ("Disetujui oleh,") supaya
              peran pengesahnya tidak hilang saat kolom manualnya
              digantikan QR ini. */}
          <div className="text-neutral-600 mt-0.5">
            {cfg.pengesah.label.replace(/,$/, "")}
          </div>
          <div className="mt-1 text-[11.5px] font-semibold">
            {cfg.pengesah.nama}
          </div>
          <div className="text-neutral-600">{cfg.pengesah.jabatan}</div>
          <div className="mt-1.5">
            <span className="text-neutral-500">Sidik dokumen: </span>
            <span className="font-mono font-semibold tracking-wide">{sidik}</span>
          </div>
          <div className="mt-1 text-[9px] text-neutral-500 break-all">
            Pindai untuk memeriksa keaslian · {url.split("?")[0]}
          </div>
          {/* Keterangan "non-certified" tidak dicetak di sini, tapi
              tetap ada di halaman verifikasi yang dituju QR-nya. Lihat
              lib/qrSign.ts. */}
        </div>
      </div>
    </div>
  );
}
