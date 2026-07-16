import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import PrintButton from "../../po/[id]/PrintButton";

type RcvPrint = {
  id: string;
  no_invoice: string | null;
  tanggal_terima: string;
  supplier_nama: string | null;
  ppn_percent: number;
  subtotal: number;
  total_ppn: number;
  total_invoice: number;
  top_days: number | null;
  jatuh_tempo: string | null;
  po_id: string | null;
  purchase_orders: { no_po: string | null } | null;
};

type BatchRow = {
  qty_masuk: number;
  harga_per_unit: number;
  no_lot_supplier: string | null;
  exp_date: string | null;
  items: { kode: string; nama: string; satuan: string } | null;
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

export default async function PrintReceivingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: org }, { data: settings }] = await Promise.all([
    supabase
      .from("receivings")
      .select(
        "id, no_invoice, tanggal_terima, supplier_nama, ppn_percent, subtotal, total_ppn, total_invoice, top_days, jatuh_tempo, po_id, purchase_orders(no_po)"
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
  const rcv = data as unknown as RcvPrint;

  let { data: batches } = await supabase
    .from("purchase_batches")
    .select("qty_masuk, harga_per_unit, no_lot_supplier, exp_date, items(kode, nama, satuan)")
    .eq("receiving_id", id);
  if (!batches || batches.length === 0) {
    const fallback = await supabase
      .from("purchase_batches")
      .select("qty_masuk, harga_per_unit, no_lot_supplier, exp_date, items(kode, nama, satuan)")
      .eq("po_id", rcv.po_id)
      .eq("tanggal_terima", rcv.tanggal_terima)
      .eq("organization_id", organizationId);
    batches = fallback.data;
  }
  const rows = (batches || []) as unknown as BatchRow[];

  const signers = [
    {
      label: "Dibuat oleh,",
      nama: settings?.sign_dibuat_nama,
      jabatan: settings?.sign_dibuat_jabatan,
    },
    {
      label: "Disetujui oleh,",
      nama: settings?.sign_disetujui_nama,
      jabatan: settings?.sign_disetujui_jabatan,
    },
    {
      label: "Mengetahui,",
      nama: settings?.sign_mengetahui_nama,
      jabatan: settings?.sign_mengetahui_jabatan,
    },
  ];

  const kontakLine = [
    settings?.no_telp ? `Telp: ${settings.no_telp}` : null,
    settings?.email ? `Email: ${settings.email}` : null,
  ]
    .filter(Boolean)
    .join("  •  ");

  return (
    <div className="min-h-screen py-8 print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print { body { background: white !important; } }
      `}</style>

      <PrintButton />

      <div className="bg-white text-[#1a1a1a] max-w-[210mm] mx-auto shadow-xl print:shadow-none rounded-sm print:rounded-none p-[15mm] print:p-0 text-[12.5px] leading-relaxed">
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
              BUKTI PENERIMAAN BARANG
            </div>
            <div className="font-mono text-[13px] mt-1">
              {rcv.no_invoice || rcv.purchase_orders?.no_po}
            </div>
            <div className="text-[11.5px] text-neutral-600 mt-0.5">
              Tanggal: {formatTanggal(rcv.tanggal_terima)}
            </div>
          </div>
        </div>

        {/* ===== INFO ===== */}
        <div className="mt-5 grid grid-cols-4 gap-4 text-[11.5px]">
          <div>
            <div className="uppercase tracking-wide text-neutral-500 mb-0.5">Supplier</div>
            <div className="font-semibold text-[12.5px]">{rcv.supplier_nama || "—"}</div>
          </div>
          <div>
            <div className="uppercase tracking-wide text-neutral-500 mb-0.5">Ref. PO</div>
            <div className="font-mono">{rcv.purchase_orders?.no_po || "—"}</div>
          </div>
          <div>
            <div className="uppercase tracking-wide text-neutral-500 mb-0.5">TOP</div>
            <div>
              {rcv.top_days == null
                ? "—"
                : rcv.top_days === 0
                  ? "Tunai / CIA"
                  : `${rcv.top_days} hari`}
            </div>
          </div>
          <div>
            <div className="uppercase tracking-wide text-neutral-500 mb-0.5">
              Jatuh Tempo
            </div>
            <div>{rcv.jatuh_tempo ? formatTanggal(rcv.jatuh_tempo) : "—"}</div>
          </div>
        </div>

        {/* ===== TABEL ===== */}
        <table className="w-full mt-5 border-collapse">
          <thead>
            <tr className="border-y border-[#1a1a1a] text-[11px] uppercase tracking-wide">
              <th className="py-2 pr-2 text-left w-8">No</th>
              <th className="py-2 pr-2 text-left">Nama Barang</th>
              <th className="py-2 pr-2 text-left">Lot Supplier</th>
              <th className="py-2 pr-2 text-left">Exp</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Harga/Unit</th>
              <th className="py-2 text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-neutral-300">
                <td className="py-2 pr-2 align-top">{i + 1}</td>
                <td className="py-2 pr-2 align-top">
                  <div className="font-medium">{r.items?.nama}</div>
                  <div className="text-[10.5px] text-neutral-500 font-mono">
                    {r.items?.kode}
                  </div>
                </td>
                <td className="py-2 pr-2 align-top font-mono text-[11px]">
                  {r.no_lot_supplier || "—"}
                </td>
                <td className="py-2 pr-2 align-top text-[11px]">
                  {r.exp_date
                    ? new Date(r.exp_date + "T00:00:00").toLocaleDateString("id-ID", {
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </td>
                <td className="py-2 pr-2 text-right align-top whitespace-nowrap">
                  {Number(r.qty_masuk).toLocaleString("id-ID")} {r.items?.satuan}
                </td>
                <td className="py-2 pr-2 text-right align-top whitespace-nowrap">
                  {formatRupiah(Number(r.harga_per_unit))}
                </td>
                <td className="py-2 text-right align-top whitespace-nowrap">
                  {formatRupiah(Number(r.qty_masuk) * Number(r.harga_per_unit))}
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
              <span>{formatRupiah(Number(rcv.subtotal))}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-neutral-600">PPN {Number(rcv.ppn_percent)}%</span>
              <span>{formatRupiah(Number(rcv.total_ppn))}</span>
            </div>
            <div className="flex justify-between py-1.5 border-t-2 border-[#1a1a1a] font-bold text-[13.5px]">
              <span>TOTAL</span>
              <span>{formatRupiah(Number(rcv.total_invoice))}</span>
            </div>
          </div>
        </div>

        {/* ===== TANDA TANGAN ===== */}
        <div className="mt-10 grid grid-cols-3 gap-6 text-center break-inside-avoid">
          {signers.map((s, i) => (
            <div key={i}>
              <div className="text-[12px]">{s.label}</div>
              <div className="h-[22mm]" />
              <div className="font-semibold border-b border-[#1a1a1a] inline-block min-w-[40mm] pb-0.5">
                {s.nama || "(............................)"}
              </div>
              <div className="text-[11px] text-neutral-600 mt-1">{s.jabatan || ""}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 pt-3 border-t border-neutral-300 text-[10px] text-neutral-400 flex justify-between">
          <span>
            Dokumen ini diterbitkan melalui Seawise Enterprise Apps — Industry Edition
          </span>
          <span>{rcv.no_invoice || rcv.purchase_orders?.no_po}</span>
        </div>
      </div>
    </div>
  );
}
