import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import { getDocSigners } from "@/lib/docSignServer";
import PrintButton from "../../po/[id]/PrintButton";
import QrSignBlock from "../../QrSignBlock";
import { namaBrand } from "@/lib/produkLabel";

/* ============================================================
   Tanda Terima Konsinyasi.

   Bukan surat jalan biasa dan bukan invoice: barangnya berpindah
   tempat TAPI belum berpindah pemilik. Karena itu dokumen ini
   menyebutkan nilai barang sebagai nilai titipan, bukan tagihan,
   dan kaki dokumennya menuntut tanda tangan PENERIMA.

   Kolom "Diterima oleh" selalu dicetak, apa pun pengaturan
   Document Signing. Kolom tanda tangan internal boleh diganti QR
   Signature (itu urusan pengesahan di dalam perusahaan), tapi
   tanda terima tanpa tanda tangan penerima kehilangan seluruh
   gunanya: dia ada justru untuk membuktikan barangnya sudah
   diterima orang di seberang.
   ============================================================ */

type ConsPrint = {
  id: string;
  no_konsinyasi: string | null;
  tanggal_kirim: string;
  status: string;
  catatan: string | null;
  clients: {
    kode: string | null;
    company_brand: string;
    cp: string | null;
    alamat: string | null;
    phone: string | null;
  } | null;
  consignment_items: {
    varian_ukuran: string | null;
    qty_kirim: number;
    harga_jual: number;
    products: { kode: string | null; nama_produk: string; brand: string | null } | null;
  }[];
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function PrintKonsinyasiPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: org }, { data: settings }] = await Promise.all([
    supabase
      .from("consignments")
      .select(
        `id, no_konsinyasi, tanggal_kirim, status, catatan,
         clients(kode, company_brand, cp, alamat, phone),
         consignment_items(varian_ukuran, qty_kirim, harga_jual, products(kode, nama_produk, brand))`
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    supabase.from("organizations").select("nama").eq("id", organizationId).single(),
    supabase
      .from("organization_settings")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (!data) notFound();
  const cons = data as unknown as ConsPrint;

  const rows = cons.consignment_items || [];
  const totalQty = rows.reduce((s, r) => s + Number(r.qty_kirim), 0);
  const totalNilai = rows.reduce(
    (s, r) => s + Number(r.qty_kirim) * Number(r.harga_jual),
    0
  );

  // Kolom tanda tangan internal sesuai pengaturan Document Signing.
  // Kosong kalau dokumennya disahkan lewat QR; kolom penerima di bawah
  // TIDAK ikut kosong, dia bukan pengesahan internal.
  const signers = await getDocSigners(organizationId!, "konsinyasi");

  const kontakLine = [
    settings?.no_telp ? `Telp: ${settings.no_telp}` : null,
    settings?.email ? `Email: ${settings.email}` : null,
  ]
    .filter(Boolean)
    .join("  •  ");

  return (
    <div className="min-h-screen py-4 sm:py-8 print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print { body { background: white !important; } }
      `}</style>

      <PrintButton />

      <div className="bg-white text-[#1a1a1a] a4-sheet max-w-[210mm] mx-auto shadow-xl print:shadow-none rounded-sm print:rounded-none p-[15mm] print:p-0 text-[12.5px] leading-relaxed">
        {/* ===== KOP ===== */}
        <div className="flex justify-between items-start border-b-2 border-[#1a1a1a] pb-4">
          <div>
            <div className="font-display text-[22px] font-bold leading-tight">
              {org?.nama}
            </div>
            {settings?.alamat && (
              <div className="text-[11.5px] text-neutral-600 mt-1 max-w-[90mm] whitespace-pre-line">
                {settings.alamat}
              </div>
            )}
            {kontakLine && (
              <div className="text-[11px] text-neutral-600 mt-0.5">{kontakLine}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[19px] font-bold tracking-wide">
              TANDA TERIMA KONSINYASI
            </div>
            <div className="font-mono text-[13px] mt-1">
              {cons.no_konsinyasi || "-"}
            </div>
            <div className="text-[11.5px] text-neutral-600 mt-0.5">
              Tanggal Kirim: {formatTanggal(cons.tanggal_kirim)}
            </div>
          </div>
        </div>

        {/* ===== INFO PENERIMA ===== */}
        <div className="mt-5 grid grid-cols-[1fr_auto] gap-6 text-[11.5px]">
          <div>
            <div className="uppercase tracking-wide text-neutral-500 mb-0.5">
              Dititipkan Kepada
            </div>
            <div className="font-semibold text-[13px]">
              {cons.clients?.company_brand || "-"}
              {cons.clients?.kode && (
                <span className="font-mono text-[11px] text-neutral-500">
                  {" "}
                  ({cons.clients.kode})
                </span>
              )}
            </div>
            {cons.clients?.cp && <div>UP: {cons.clients.cp}</div>}
            {cons.clients?.alamat && (
              <div className="text-neutral-600 whitespace-pre-line max-w-[100mm]">
                {cons.clients.alamat}
              </div>
            )}
            {cons.clients?.phone && (
              <div className="text-neutral-600">Telp: {cons.clients.phone}</div>
            )}
          </div>
          <div className="text-right">
            <div className="uppercase tracking-wide text-neutral-500 mb-0.5">
              Jumlah Barang
            </div>
            <div className="font-semibold text-[13px]">
              {totalQty.toLocaleString("id-ID")} pcs
            </div>
            <div className="uppercase tracking-wide text-neutral-500 mt-2 mb-0.5">
              Status
            </div>
            <div>{cons.status}</div>
          </div>
        </div>

        {/* ===== TABEL ===== */}
        <table className="w-full mt-5 border-collapse">
          <thead>
            <tr className="border-y border-[#1a1a1a] text-[11px] uppercase tracking-wide">
              <th className="py-2 pr-2 text-left w-8">No</th>
              <th className="py-2 pr-2 text-left">Nama Produk</th>
              <th className="py-2 pr-2 text-left">Varian</th>
              <th className="py-2 pr-2 text-right">Qty Titip</th>
              <th className="py-2 pr-2 text-right">Harga Jual/pcs</th>
              <th className="py-2 text-right">Nilai Titipan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-neutral-300">
                <td className="py-2 pr-2 align-top">{i + 1}</td>
                <td className="py-2 pr-2 align-top">
                  <div className="font-medium">
                    {namaBrand(
                      r.products?.nama_produk || "-",
                      r.products?.brand
                    )}
                  </div>
                  <div className="text-[10.5px] text-neutral-500 font-mono">
                    {r.products?.kode}
                  </div>
                </td>
                <td className="py-2 pr-2 align-top">{r.varian_ukuran || "-"}</td>
                <td className="py-2 pr-2 text-right align-top whitespace-nowrap">
                  {Number(r.qty_kirim).toLocaleString("id-ID")} pcs
                </td>
                <td className="py-2 pr-2 text-right align-top whitespace-nowrap">
                  {formatRupiah(Number(r.harga_jual))}
                </td>
                <td className="py-2 text-right align-top whitespace-nowrap">
                  {formatRupiah(Number(r.qty_kirim) * Number(r.harga_jual))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ===== TOTAL ===== */}
        <div className="flex justify-end mt-3">
          <div className="w-[75mm] text-[12.5px]">
            <div className="flex justify-between py-1.5 border-t-2 border-[#1a1a1a] font-bold text-[13.5px]">
              <span>TOTAL NILAI TITIPAN</span>
              <span>{formatRupiah(totalNilai)}</span>
            </div>
          </div>
        </div>

        {cons.catatan && (
          <div className="mt-4 text-[11.5px]">
            <span className="text-neutral-500">Catatan: </span>
            {cons.catatan}
          </div>
        )}

        {/* ===== KETERANGAN TITIPAN =====
            Wajib tercetak. Tanpa kalimat ini, kertas yang mencantumkan
            nilai rupiah dan ditandatangani penerima gampang dibaca
            sebagai bukti jual beli. */}
        <div className="mt-5 border border-neutral-400 rounded-sm px-4 py-3 text-[11px] leading-relaxed text-neutral-700">
          Barang di atas dititipkan untuk dijual (konsinyasi).{" "}
          <span className="font-semibold text-[#1a1a1a]">
            Kepemilikan tetap pada {org?.nama}
          </span>{" "}
          sampai barang terjual. Nilai titipan bukan tagihan; penagihan
          diterbitkan terpisah sesuai jumlah yang laku dilaporkan. Barang yang
          tidak laku dikembalikan dalam keadaan layak jual.
        </div>

        {/* ===== QR SIGNATURE ===== */}
        <QrSignBlock jenis="konsinyasi" id={id} organizationId={organizationId!} />

        {/* ===== TANDA TANGAN =====
            Kolom penerima berdiri sendiri di kanan dan selalu ada. */}
        <div className="mt-8 flex justify-between items-start gap-6 break-inside-avoid">
          <div
            className="grid gap-6 text-center flex-1"
            style={{
              gridTemplateColumns: `repeat(${Math.max(signers.length, 1)}, 1fr)`,
            }}
          >
            {signers.map((s, i) => (
              <div key={i}>
                <div className="text-[12px]">{s.label}</div>
                <div className="h-[22mm]" />
                <div className="font-semibold border-b border-[#1a1a1a] inline-block min-w-[40mm] pb-0.5">
                  {s.nama || "(............................)"}
                </div>
                <div className="text-[11px] text-neutral-600 mt-1">
                  {s.jabatan || ""}
                </div>
              </div>
            ))}
          </div>

          <div className="text-center w-[55mm] flex-shrink-0">
            <div className="text-[12px]">Diterima oleh,</div>
            <div className="h-[22mm]" />
            <div className="font-semibold border-b border-[#1a1a1a] inline-block min-w-[45mm] pb-0.5">
              (............................)
            </div>
            <div className="text-[11px] text-neutral-600 mt-1">
              {cons.clients?.company_brand || ""}
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">
              Nama terang &amp; tanggal terima
            </div>
          </div>
        </div>

        <div className="mt-10 pt-3 border-t border-neutral-300 text-[10px] text-neutral-400 flex justify-between">
          <span>
            Dokumen ini diterbitkan melalui Industry Management by Seawise Studio
          </span>
          <span>{cons.no_konsinyasi || "-"}</span>
        </div>
      </div>
    </div>
  );
}
