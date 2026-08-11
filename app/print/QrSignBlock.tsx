/* ============================================================
   Blok QR Signature di kaki dokumen cetak A4.

   Komponennya mengambil pengaturan DAN identitas dokumennya sendiri,
   lalu mengembalikan null kalau fiturnya mati atau data pengesahnya
   belum lengkap. Itu disengaja: tujuh halaman cetak memakainya, dan
   kalau tiap halaman harus ikut mengambil pengaturan lalu memutuskan
   sendiri kapan menampilkan, cepat atau lambat ada satu halaman yang
   lupa memeriksa lalu mencetak QR atas nama pengesah kosong.

   Nomor & tanggalnya juga TIDAK diterima sebagai prop, melainkan
   dibaca lewat ambilRingkasan() — sumber yang sama persis dengan
   halaman verifikasi. Prop akan membuka peluang halaman cetak
   mengirim nomor yang sedikit berbeda, dan sidik yang beda satu
   karakter pun membuat dokumennya tampak palsu saat dipindai.

   Dua query kecil per halaman cetak adalah harga yang murah untuk
   jaminan itu.
   ============================================================ */

import { createClient } from "@/lib/supabase/server";
import { bacaQrSign, qrSignLengkap, type VerifyKey } from "@/lib/qrSign";
import { ambilRingkasan, siapkanQrSign } from "@/lib/qrSignServer";

export default async function QrSignBlock({
  jenis,
  id,
  organizationId,
}: {
  jenis: VerifyKey;
  id: string;
  organizationId: string;
}) {
  const supabase = await createClient();

  const [{ data: setting }, ringkas] = await Promise.all([
    supabase
      .from("organization_settings")
      .select("qr_sign_aktif, qr_sign_nama, qr_sign_jabatan, qr_sign_instansi")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    ambilRingkasan(supabase, jenis, id),
  ]);

  const s = bacaQrSign(setting);
  if (!s.aktif || !qrSignLengkap(s) || !ringkas) return null;

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
          <div className="mt-1 text-[11.5px] font-semibold">{s.nama}</div>
          <div className="text-neutral-600">{s.jabatan}</div>
          {s.instansi && <div className="text-neutral-600">{s.instansi}</div>}
          <div className="mt-1.5">
            <span className="text-neutral-500">Sidik dokumen: </span>
            <span className="font-mono font-semibold tracking-wide">{sidik}</span>
          </div>
          <div className="mt-1 text-[9px] text-neutral-500 break-all">
            Pindai untuk memeriksa keaslian · {url.split("?")[0]}
          </div>
          {/* Wajib ikut tercetak. Pengesahan yang mengaku lebih dari
              kemampuannya lebih berbahaya daripada tidak ada. */}
          <div className="mt-1 text-[9px] text-neutral-500 italic">
            QR Signature Non-Certified — validasi internal, bukan tanda tangan
            elektronik tersertifikasi.
          </div>
        </div>
      </div>
    </div>
  );
}
