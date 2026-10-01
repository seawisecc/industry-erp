import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import { canAccessModule } from "@/lib/modules";
import { getDocSigners } from "@/lib/docSignServer";
import { hitungTotalDokumen, parseTaxMode } from "@/lib/invoiceMath";
import PrintButton from "../../po/[id]/PrintButton";
import QrSignBlock from "../../QrSignBlock";

/* ============================================================
   Cetak quotation (penawaran harga).

   Bentuknya sengaja kembaran invoice (banner kop, tabel, rekap di
   kanan bawah): quotation dan Proforma yang lahir darinya dikirim ke
   client yang sama, dan dua kertas dari perusahaan yang sama tidak
   boleh terlihat seperti terbit dari dua kantor berbeda.

   Halaman /print tidak lewat AccessGuard, jadi akses modulnya
   diperiksa di sini sendiri.
   ============================================================ */

type QuoPrint = {
  id: string;
  no_quotation: string;
  nama_penerima: string | null;
  up: string | null;
  perihal: string | null;
  tanggal: string;
  berlaku_sampai: string | null;
  diskon_percent: number;
  pakai_tax: boolean;
  tax_mode: string;
  tax_percent: number;
  tax_dpp_nilai_lain: boolean;
  subtotal: number;
  total: number;
  syarat: string | null;
  clients: {
    company_brand: string;
    cp: string | null;
    phone: string | null;
    alamat: string | null;
  } | null;
  quotation_items: {
    urutan: number;
    deskripsi: string;
    keterangan: string | null;
    satuan: string | null;
    qty: number;
    harga: number;
    subtotal: number;
  }[];
};

function formatNum(n: number) {
  return n.toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function PrintQuotationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId, profile, isSuperAdmin } = await getEffectiveOrg();

  const boleh = canAccessModule(
    {
      isSuperAdmin,
      role: profile?.role || "",
      allowedModules: profile?.allowed_modules ?? null,
    },
    "quotations"
  );
  if (!boleh) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-[13px] text-muted">
        Akunmu belum diberi akses ke modul Quotations.
      </div>
    );
  }

  const [{ data }, { data: org }, { data: settings }] = await Promise.all([
    supabase
      .from("quotations")
      .select(
        `id, no_quotation, nama_penerima, up, perihal, tanggal, berlaku_sampai,
         diskon_percent, pakai_tax, tax_mode, tax_percent, tax_dpp_nilai_lain,
         subtotal, total, syarat,
         clients(company_brand, cp, phone, alamat),
         quotation_items(urutan, deskripsi, keterangan, satuan, qty, harga, subtotal)`
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase.from("organizations").select("nama").eq("id", organizationId).single(),
    supabase
      .from("organization_settings")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (!data) notFound();
  const q = data as unknown as QuoPrint;
  const items = [...q.quotation_items].sort((a, b) => a.urutan - b.urutan);

  // Rincian dihitung ulang dengan aturan pajak yang dibekukan di
  // dokumen, bukan pengaturan perusahaan yang berlaku sekarang.
  const taxMode = parseTaxMode(q.tax_mode);
  const rincian = hitungTotalDokumen(
    Number(q.subtotal),
    Number(q.diskon_percent),
    q.pakai_tax,
    Number(q.tax_percent),
    taxMode,
    q.tax_dpp_nilai_lain
  );

  const kepada = q.clients?.company_brand || q.nama_penerima || "-";
  const up = q.up || q.clients?.cp;
  const signers = await getDocSigners(organizationId!, "quotation");

  return (
    <div className="min-h-screen py-4 sm:py-8 print:py-0">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { body { background: white !important; } }
      `}</style>

      <PrintButton />

      <div className="bg-white text-[#1a1a1a] a4-sheet max-w-[210mm] mx-auto shadow-xl print:shadow-none rounded-sm print:rounded-none text-[12px] leading-relaxed overflow-hidden">
        {/* ===== KOP (banner), sama dengan invoice ===== */}
        <div className="bg-botanical-100/60 px-[12mm] py-5 flex justify-between items-center gap-4 border-b border-neutral-300">
          {settings?.logo ? (
            // Sengaja <img> biasa: isinya data URI dan halaman cetak harus
            // utuh sekali render.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.logo}
              alt=""
              className="h-[18mm] w-auto max-w-[45mm] object-contain shrink-0"
            />
          ) : (
            <div />
          )}
          <div className="text-right">
            <div className="font-display text-[20px] font-bold leading-tight">
              {org?.nama}
            </div>
            {settings?.alamat && (
              <div className="text-[11px] text-neutral-700">{settings.alamat}</div>
            )}
            <div className="text-[11px] text-neutral-700">
              {[
                settings?.no_telp && `Telp: ${settings.no_telp}`,
                settings?.email && `email: ${settings.email}`,
              ]
                .filter(Boolean)
                .join("  |  ")}
            </div>
          </div>
        </div>

        <div className="px-[12mm] py-5">
          <div className="text-center mb-4">
            <div className="font-display text-[17px] font-bold tracking-[0.2em]">
              QUOTATION
            </div>
            <div className="text-[11px] text-neutral-500 tracking-[0.15em]">
              PENAWARAN HARGA
            </div>
          </div>

          {/* ===== INFO ===== */}
          <div className="grid grid-cols-2 gap-6">
            <div className="text-[11.5px] leading-relaxed">
              <div>
                <span className="text-neutral-500">Kepada : </span>
                <b>{kepada}</b>
              </div>
              {q.clients?.alamat && (
                <div>
                  <span className="text-neutral-500">Alamat : </span>
                  {q.clients.alamat}
                </div>
              )}
              {up && (
                <div>
                  <span className="text-neutral-500">UP : </span>
                  {up}
                </div>
              )}
              {q.clients?.phone && (
                <div>
                  <span className="text-neutral-500">Telp : </span>
                  {q.clients.phone}
                </div>
              )}
            </div>
            <div className="text-[11.5px] leading-relaxed text-right">
              <div>
                <span className="text-neutral-500">No. : </span>
                <span className="font-mono font-semibold">{q.no_quotation}</span>
              </div>
              <div>
                <span className="text-neutral-500">Tanggal : </span>
                {formatTanggal(q.tanggal)}
              </div>
              {q.berlaku_sampai && (
                <div>
                  <span className="text-neutral-500">Berlaku sampai : </span>
                  {formatTanggal(q.berlaku_sampai)}
                </div>
              )}
            </div>
          </div>

          {q.perihal && (
            <div className="mt-3 text-[11.5px]">
              <span className="text-neutral-500">Perihal : </span>
              <b>{q.perihal}</b>
            </div>
          )}

          {/* ===== TABEL ITEM ===== */}
          <table className="w-full mt-4 border-collapse">
            <thead>
              <tr className="bg-botanical-100/60 text-[10.5px] uppercase tracking-[0.15em] border-y border-neutral-400">
                <th className="py-2 px-2 text-center w-[8mm]">No</th>
                <th className="py-2 px-2 text-left">Deskripsi</th>
                <th className="py-2 px-2 text-right">Qty</th>
                <th className="py-2 px-2 text-left">Satuan</th>
                <th className="py-2 px-2 text-right">Harga</th>
                <th className="py-2 px-2 text-right">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr
                  key={i}
                  className={`align-top ${i % 2 === 1 ? "bg-neutral-50" : ""}`}
                  style={{ breakInside: "avoid" }}
                >
                  <td className="py-2 px-2 text-center">{i + 1}</td>
                  <td className="py-2 px-2">
                    <div className="font-medium">{it.deskripsi}</div>
                    {it.keterangan && (
                      <div className="text-[10.5px] text-neutral-600 whitespace-pre-line mt-0.5">
                        {it.keterangan}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    {Number(it.qty).toLocaleString("id-ID")}
                  </td>
                  <td className="py-2 px-2">{it.satuan || "-"}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    Rp {formatNum(Number(it.harga))}
                  </td>
                  <td className="py-2 px-2 text-right whitespace-nowrap">
                    Rp {formatNum(Number(it.subtotal))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="bg-botanical-100/60 border-y border-neutral-400 flex justify-between items-center px-2 py-2 text-[12px] font-semibold tracking-[0.15em]">
            <span>SUB-TOTAL:</span>
            <span className="tracking-normal">Rp {formatNum(rincian.subtotal)}</span>
          </div>

          {/* ===== SYARAT + REKAP ===== */}
          <div className="grid grid-cols-2 gap-6 mt-4" style={{ breakInside: "avoid" }}>
            <div className="text-[11px] leading-relaxed">
              {q.syarat && (
                <>
                  <div className="font-bold mb-0.5">Syarat &amp; Ketentuan</div>
                  <div className="whitespace-pre-line text-neutral-700">{q.syarat}</div>
                </>
              )}
            </div>
            <div className="text-[12px]">
              {/* Tarifnya sengaja TIDAK dicetak di sebelah label pajak,
                  aturan yang sama dengan invoice. */}
              {rincian.diskon !== 0 && (
                <>
                  <div className="flex justify-between py-1 px-2">
                    <span className="tracking-[0.15em] text-neutral-600">
                      D I S C O U N T :
                    </span>
                    <span>Rp {formatNum(rincian.diskon)}</span>
                  </div>
                  <div className="flex justify-between py-1 px-2">
                    <span className="tracking-[0.15em] text-neutral-600">SUB TOTAL</span>
                    <span>Rp {formatNum(rincian.netto)}</span>
                  </div>
                </>
              )}
              {q.pakai_tax && (
                <>
                  {taxMode === "Include" && (
                    <div className="flex justify-between py-1 px-2">
                      <span className="tracking-[0.15em] text-neutral-600">
                        SUB TOTAL EXC TAX
                      </span>
                      <span>Rp {formatNum(rincian.exTax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1 px-2">
                    <span className="tracking-[0.15em] text-neutral-600">DPP :</span>
                    <span>Rp {formatNum(rincian.dpp)}</span>
                  </div>
                  <div className="flex justify-between py-1 px-2">
                    <span className="tracking-[0.15em] text-neutral-600">PPN :</span>
                    <span>Rp {formatNum(rincian.tax)}</span>
                  </div>
                </>
              )}
              <div className="bg-botanical-100/60 border-y border-neutral-400 flex justify-between items-center px-2 py-2 mt-2 font-bold tracking-[0.15em]">
                <span>T O T A L :</span>
                <span className="tracking-normal">Rp {formatNum(Number(q.total))}</span>
              </div>
              {q.pakai_tax && (
                <div className="text-[10px] text-neutral-600 px-2 pt-1 leading-snug">
                  {taxMode === "Include"
                    ? "Harga sudah termasuk PPN."
                    : "PPN ditambahkan di atas nilai setelah diskon."}
                </div>
              )}
            </div>
          </div>

          {/* ===== QR SIGNATURE ===== */}
          <QrSignBlock jenis="quotation" id={id} organizationId={organizationId!} />

          {/* ===== TANDA TANGAN ===== */}
          {signers.length > 0 && (
            <div
              className="mt-8 mb-2 grid gap-6 text-center text-[11.5px]"
              style={{
                gridTemplateColumns: `repeat(${signers.length}, 1fr)`,
                breakInside: "avoid",
              }}
            >
              {signers.map((s, i) => (
                <div key={i}>
                  <div>{s.label}</div>
                  <div className="h-[18mm]" />
                  <div className="font-semibold border-b border-[#1a1a1a] inline-block min-w-[40mm] pb-0.5">
                    {s.nama || "(............................)"}
                  </div>
                  <div className="text-[10px] text-neutral-600 mt-1">{s.jabatan || ""}</div>
                </div>
              ))}
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
