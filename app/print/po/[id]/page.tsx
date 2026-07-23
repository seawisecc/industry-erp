import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import { getDocSigners } from "@/lib/docSignServer";
import PrintButton from "./PrintButton";

type POPrint = {
  id: string;
  no_po: string | null;
  tanggal_po: string;
  status: string;
  ppn_percent: number;
  catatan: string | null;
  suppliers: {
    nama: string;
    alamat: string | null;
    nama_kontak: string | null;
    no_telp: string | null;
  } | null;
  po_items: {
    qty_pesan: number;
    harga_per_unit: number;
    items: { kode: string; nama: string; satuan: string } | null;
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

export default async function PrintPOPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: org }, { data: settings }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        `id, no_po, tanggal_po, status, ppn_percent, catatan,
         suppliers(nama, alamat, nama_kontak, no_telp),
         po_items(qty_pesan, harga_per_unit, items(kode, nama, satuan))`
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
  const po = data as unknown as POPrint;

  const subtotal = po.po_items.reduce(
    (s, r) => s + Number(r.qty_pesan) * Number(r.harga_per_unit),
    0
  );
  const ppnValue = (subtotal * Number(po.ppn_percent)) / 100;
  const total = subtotal + ppnValue;

  // Kolom tanda tangan sesuai pengaturan Document Signing (per jenis dokumen)
  const signers = await getDocSigners(organizationId!, "po");

  const kontakLine = [
    settings?.no_telp ? `Telp: ${settings.no_telp}` : null,
    settings?.email ? `Email: ${settings.email}` : null,
    settings?.npwp ? `NPWP: ${settings.npwp}` : null,
  ]
    .filter(Boolean)
    .join("  •  ");

  return (
    <div className="min-h-screen py-4 sm:py-8 print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          body { background: white !important; }
        }
      `}</style>

      <PrintButton />

      {/* Kertas */}
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
            <div className="text-[20px] font-bold tracking-wide">PURCHASE ORDER</div>
            <div className="font-mono text-[13px] mt-1">{po.no_po}</div>
            <div className="text-[11.5px] text-neutral-600 mt-0.5">
              Tanggal: {formatTanggal(po.tanggal_po)}
            </div>
          </div>
        </div>

        {/* ===== KEPADA ===== */}
        <div className="mt-5 grid grid-cols-2 gap-8">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">
              Kepada Yth.
            </div>
            <div className="font-semibold text-[13.5px]">{po.suppliers?.nama}</div>
            {po.suppliers?.alamat && (
              <div className="text-[11.5px] text-neutral-600 whitespace-pre-line">
                {po.suppliers.alamat}
              </div>
            )}
            {po.suppliers?.nama_kontak && (
              <div className="text-[11.5px] text-neutral-600 mt-0.5">
                Up. {po.suppliers.nama_kontak}
                {po.suppliers?.no_telp ? ` — ${po.suppliers.no_telp}` : ""}
              </div>
            )}
          </div>
          <div className="text-[11.5px] text-neutral-600 self-end text-right">
            Mohon barang dikirim sesuai spesifikasi &amp; jadwal yang disepakati.
          </div>
        </div>

        {/* ===== TABEL ITEM ===== */}
        <table className="w-full mt-5 border-collapse">
          <thead>
            <tr className="border-y border-[#1a1a1a] text-[11px] uppercase tracking-wide">
              <th className="py-2 pr-2 text-left w-8">No</th>
              <th className="py-2 pr-2 text-left">Nama Barang</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-left w-14">Satuan</th>
              <th className="py-2 pr-2 text-right">Harga/Unit</th>
              <th className="py-2 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {po.po_items.map((r, i) => (
              <tr key={i} className="border-b border-neutral-300">
                <td className="py-2 pr-2 align-top">{i + 1}</td>
                <td className="py-2 pr-2 align-top">
                  <div className="font-medium">{r.items?.nama}</div>
                  <div className="text-[10.5px] text-neutral-500 font-mono">
                    {r.items?.kode}
                  </div>
                </td>
                <td className="py-2 pr-2 text-right align-top">
                  {Number(r.qty_pesan).toLocaleString("id-ID")}
                </td>
                <td className="py-2 pr-2 align-top">{r.items?.satuan}</td>
                <td className="py-2 pr-2 text-right align-top whitespace-nowrap">
                  {formatRupiah(Number(r.harga_per_unit))}
                </td>
                <td className="py-2 text-right align-top whitespace-nowrap">
                  {formatRupiah(Number(r.qty_pesan) * Number(r.harga_per_unit))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ===== TOTAL ===== */}
        <div className="flex justify-end mt-3">
          <div className="w-[70mm] text-[12.5px]">
            <div className="flex justify-between py-1">
              <span className="text-neutral-600">Subtotal</span>
              <span>{formatRupiah(subtotal)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-neutral-600">PPN {Number(po.ppn_percent)}%</span>
              <span>{formatRupiah(ppnValue)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-t-2 border-[#1a1a1a] font-bold text-[13.5px]">
              <span>TOTAL</span>
              <span>{formatRupiah(total)}</span>
            </div>
          </div>
        </div>

        {/* ===== CATATAN ===== */}
        {po.catatan && (
          <div className="mt-4 text-[11.5px]">
            <span className="font-semibold">Catatan: </span>
            {po.catatan}
          </div>
        )}

        {/* ===== TANDA TANGAN ===== */}
        {signers.length > 0 && (
        <div
          className="mt-10 grid gap-6 text-center break-inside-avoid"
          style={{ gridTemplateColumns: `repeat(${signers.length}, 1fr)` }}
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
        )}

        {/* ===== FOOTER ===== */}
        <div className="mt-10 pt-3 border-t border-neutral-300 text-[10px] text-neutral-400 flex justify-between">
          <span>
            Dokumen ini diterbitkan melalui Seawise Enterprise Apps — Industry Edition
          </span>
          <span>{po.no_po}</span>
        </div>
      </div>
    </div>
  );
}
