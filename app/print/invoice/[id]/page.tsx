import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import type { SignSlot } from "@/lib/docSign";
import PrintButton from "../../po/[id]/PrintButton";

type InvPrint = {
  id: string;
  no_invoice: string | null;
  tipe: string;
  tanggal: string;
  jatuh_tempo: string | null;
  diskon_percent: number;
  pakai_tax: boolean;
  tax_percent: number;
  subtotal: number;
  total: number;
  catatan: string | null;
  nama_pembeli: string | null;
  clients: {
    company_brand: string;
    cp: string | null;
    phone: string | null;
    npwp: string | null;
    alamat: string | null;
  } | null;
  sales_invoice_items: {
    qty: number;
    harga: number;
    subtotal: number;
    varian_ukuran: string | null;
    products: { nama_produk: string } | null;
    services: { nama_jasa: string } | null;
  }[];
};

function formatNum(n: number) {
  return n.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateEn(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function PrintInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: org }, { data: settings }] = await Promise.all([
    supabase
      .from("sales_invoices")
      .select(
        `id, no_invoice, tipe, tanggal, jatuh_tempo, diskon_percent, pakai_tax, tax_percent,
         subtotal, total, catatan, nama_pembeli,
         clients(company_brand, cp, phone, npwp, alamat),
         sales_invoice_items(qty, harga, subtotal, varian_ukuran, products(nama_produk), services(nama_jasa))`
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
  const inv = data as unknown as InvPrint;

  // Rincian pembayaran (DP/cicilan) untuk Proforma yang menampilkan sisa tagihan
  const { data: pays } = await supabase
    .from("sales_payments")
    .select("jumlah")
    .eq("invoice_id", id)
    .eq("organization_id", organizationId);
  const dibayar = (pays || []).reduce((s, p) => s + Number(p.jumlah), 0);
  const sisaTagihan = Number(inv.total) - dibayar;

  const diskonNilai = (Number(inv.subtotal) * Number(inv.diskon_percent)) / 100;
  const dpp = Number(inv.subtotal) - diskonNilai;
  const taxNilai = inv.pakai_tax ? (dpp * Number(inv.tax_percent)) / 100 : 0;

  const billTo = inv.clients?.company_brand || inv.nama_pembeli || "-";

  // Kolom tanda tangan: pakai pengaturan Document Signing bila sudah diatur,
  // kalau belum tetap tampil "Regards," seperti template asli.
  const { data: signRow } = await supabase
    .from("doc_sign_settings")
    .select("slots")
    .eq("organization_id", organizationId)
    .eq("doc_type", "invoice")
    .maybeSingle();
  const invoiceSigners: SignSlot[] = Array.isArray(signRow?.slots)
    ? (signRow!.slots as SignSlot[]).filter((s) => s.aktif)
    : [];

  return (
    <div className="min-h-screen py-8 print:py-0">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { body { background: white !important; } }
      `}</style>

      <PrintButton />

      <div className="bg-white text-[#1a1a1a] max-w-[210mm] mx-auto shadow-xl print:shadow-none rounded-sm print:rounded-none text-[12px] leading-relaxed overflow-hidden">
        {/* ===== KOP (banner) ===== */}
        <div className="bg-botanical-100/60 px-[12mm] py-5 flex justify-between items-center border-b border-neutral-300">
          <div />
          <div className="text-right">
            <div className="font-display text-[20px] font-bold leading-tight">
              {org?.nama}
            </div>
            {settings?.alamat && (
              <div className="text-[11px] text-neutral-700">{settings.alamat}</div>
            )}
            <div className="text-[11px] text-neutral-700">
              {[settings?.no_telp && `Telp: ${settings.no_telp}`, settings?.email && `email: ${settings.email}`]
                .filter(Boolean)
                .join("  |  ")}
            </div>
          </div>
        </div>

        <div className="px-[12mm] py-5">
          {/* ===== INFO ===== */}
          <div className="flex justify-between items-start mb-1">
            <div className="text-[11.5px]">
              <span className="text-neutral-500">No. </span>
              <span className="font-mono font-semibold">{inv.no_invoice}</span>
            </div>
            <div className="text-[11.5px] text-neutral-500">Page : 1 / 1</div>
          </div>

          <div className="grid grid-cols-2 gap-6 mt-2">
            <div className="text-[11.5px] leading-relaxed">
              <div>
                <span className="text-neutral-500">Bill to : </span>
                <b>{billTo}</b>
              </div>
              {inv.clients?.alamat && (
                <div>
                  <span className="text-neutral-500">Address : </span>
                  {inv.clients.alamat}
                </div>
              )}
              {inv.clients?.cp && (
                <div>
                  <span className="text-neutral-500">UP : </span>
                  {inv.clients.cp}
                </div>
              )}
              {inv.clients?.phone && (
                <div>
                  <span className="text-neutral-500">Phone : </span>
                  {inv.clients.phone}
                </div>
              )}
            </div>
            <div className="text-[11.5px] leading-relaxed text-right">
              <div>
                <span className="text-neutral-500">Type : </span>
                <b>{inv.tipe === "Proforma" ? "Performa Invoice" : "Invoice"}</b>
              </div>
              <div>
                <span className="text-neutral-500">Issue Date : </span>
                {formatDateEn(inv.tanggal)}
              </div>
              <div>
                <span className="text-neutral-500">Due Date : </span>
                {formatDateEn(inv.jatuh_tempo || inv.tanggal)}
              </div>
              <div>
                <span className="text-neutral-500">NPWP : </span>
                {inv.clients?.npwp || "-"}
              </div>
              <div>
                <span className="text-neutral-500">Cust. PO : </span>
                {inv.catatan || "-"}
              </div>
            </div>
          </div>

          {/* ===== TABEL ITEM ===== */}
          <table className="w-full mt-4 border-collapse">
            <thead>
              <tr className="bg-botanical-100/60 text-[10.5px] uppercase tracking-[0.15em] border-y border-neutral-400">
                <th className="py-2 px-2 text-left">Description</th>
                <th className="py-2 px-2 text-center">Pack</th>
                <th className="py-2 px-2 text-center">Qty.</th>
                <th className="py-2 px-2 text-right">Price</th>
                <th className="py-2 px-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {inv.sales_invoice_items.map((it, i) => (
                <tr
                  key={i}
                  className={i % 2 === 1 ? "bg-neutral-50" : undefined}
                >
                  <td className="py-2 px-2">
                    {it.products?.nama_produk || it.services?.nama_jasa || "-"}
                  </td>
                  <td className="py-2 px-2 text-center">{it.varian_ukuran || "-"}</td>
                  <td className="py-2 px-2 text-center">
                    {Number(it.qty).toLocaleString("id-ID")}
                  </td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    Rp {formatNum(Number(it.harga))}
                  </td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    Rp {formatNum(Number(it.subtotal))}
                  </td>
                </tr>
              ))}
              {/* baris kosong pengisi biar mirip template */}
              {Array.from({
                length: Math.max(0, 6 - inv.sales_invoice_items.length),
              }).map((_, i) => (
                <tr key={`e${i}`} className={i % 2 === 1 ? "bg-neutral-50" : undefined}>
                  <td className="py-3 px-2" colSpan={5}></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ===== SUB TOTAL ===== */}
          <div className="bg-botanical-100/60 border-y border-neutral-400 flex justify-between items-center px-2 py-2 text-[12px] font-semibold tracking-[0.15em]">
            <span>SUB-TOTAL:</span>
            <span className="tracking-normal">
              Rp {formatNum(Number(inv.subtotal))}
            </span>
          </div>

          {/* ===== FOOTER: bank + diskon/tax/total ===== */}
          <div className="grid grid-cols-2 gap-6 mt-4">
            <div className="text-[11.5px] leading-relaxed">
              <div className="font-bold">{org?.nama}</div>
              {settings?.alamat && <div>{settings.alamat}</div>}
              {settings?.bank_info && (
                <div className="font-bold">Bank Account: {settings.bank_info}</div>
              )}
              {settings?.no_telp && <div>Phone/Whatsapp: {settings.no_telp}</div>}
              {settings?.email && <div>Email: {settings.email}</div>}
            </div>
            <div className="text-[12px]">
              <div className="flex justify-between py-1 px-2">
                <span className="tracking-[0.15em] text-neutral-600">
                  DISCOUNT{Number(inv.diskon_percent) > 0 ? ` (${Number(inv.diskon_percent)}%)` : ""} :
                </span>
                <span>Rp {formatNum(diskonNilai)}</span>
              </div>
              <div className="flex justify-between py-1 px-2">
                <span className="tracking-[0.15em] text-neutral-600">
                  TAX{inv.pakai_tax ? ` (${Number(inv.tax_percent)}%)` : ""} :
                </span>
                <span>{inv.pakai_tax ? `Rp ${formatNum(taxNilai)}` : ""}</span>
              </div>
              <div className="bg-botanical-100/60 border-y border-neutral-400 flex justify-between items-center px-2 py-2 mt-2 font-bold tracking-[0.15em]">
                <span>T O T A L :</span>
                <span className="tracking-normal">
                  Rp {formatNum(Number(inv.total))}
                </span>
              </div>
              {dibayar > 0 && sisaTagihan > 0.5 && (
                <>
                  <div className="flex justify-between py-1 px-2 mt-1">
                    <span className="tracking-[0.15em] text-neutral-600">
                      DEPOSIT / PAID :
                    </span>
                    <span>Rp {formatNum(dibayar)}</span>
                  </div>
                  <div className="border-y border-neutral-400 flex justify-between items-center px-2 py-2 font-bold tracking-[0.15em] text-[#A8502F]">
                    <span>SISA TAGIHAN :</span>
                    <span className="tracking-normal">
                      Rp {formatNum(sisaTagihan)}
                    </span>
                  </div>
                </>
              )}
              {sisaTagihan <= 0.5 && dibayar > 0 && (
                <div className="text-right text-[11px] text-[#2F4D3A] font-semibold mt-1 px-2">
                  ✓ LUNAS
                </div>
              )}
            </div>
          </div>

          {/* ===== TANDA TANGAN ===== */}
          {invoiceSigners.length > 0 ? (
            <div
              className="mt-8 mb-2 grid gap-6 text-center text-[11.5px]"
              style={{
                gridTemplateColumns: `repeat(${invoiceSigners.length}, 1fr)`,
              }}
            >
              {invoiceSigners.map((s, i) => (
                <div key={i}>
                  <div>{s.label}</div>
                  <div className="h-[18mm]" />
                  <div className="font-semibold border-b border-[#1a1a1a] inline-block min-w-[40mm] pb-0.5">
                    {s.nama || "(............................)"}
                  </div>
                  <div className="text-[10px] text-neutral-600 mt-1">
                    {s.jabatan || ""}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-end mt-8 mb-2">
              <div className="text-center text-[11.5px]">
                <div>Regards,</div>
                <div className="h-[18mm]" />
                <div className="font-semibold border-b border-[#1a1a1a] min-w-[45mm] pb-0.5">
                  {settings?.sign_dibuat_nama || "(............................)"}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-botanical-100/60 border-t border-neutral-300 text-center text-[10.5px] text-neutral-600 py-2">
          {settings?.email ? `Email : ${settings.email}` : org?.nama}
        </div>
      </div>
    </div>
  );
}
