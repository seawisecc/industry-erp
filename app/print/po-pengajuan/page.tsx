import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import PrintButton from "../po/[id]/PrintButton";
import PrintKop from "@/components/PrintKop";
import PurchaseTotals from "@/components/PurchaseTotals";
import { getDocSignConfig } from "@/lib/docSignServer";
import { localDateStr } from "@/lib/dates";
import {
  hitungTotalPembelian,
  parsePurchaseTaxMode,
  PURCHASE_TAX_LABEL,
  type PurchaseTaxMode,
} from "@/lib/purchaseTax";

/* ============================================================
   Rekap pengajuan Purchase Order: seluruh PO berstatus "Dibuat",
   lengkap dengan rincian barangnya, untuk dibawa ke meja yang
   menyetujui.

   Dua hal yang menentukan bentuknya:

   - REKAP DULU, rincian belakangan. Yang ditanya pertama selalu
     "berapa totalnya", dan jawabannya harus ada di halaman pertama
     tanpa membalik kertas.
   - Tiap PO dihitung dengan MODEL PAJAKNYA SENDIRI, yang dibekukan
     di dokumen itu. Dalam satu pengajuan, supplier PKP dan non-PKP
     memang bercampur, jadi total pengajuan adalah jumlah total tiap
     PO, bukan satu perhitungan pajak atas gabungan subtotalnya.

   Dokumen ini TIDAK terdaftar di DOC_TYPES / JUDUL_DOKUMEN /
   SUMBER_DOKUMEN: dia lembar kerja internal yang isinya berubah tiap
   kali dicetak (PO yang sudah disetujui hilang dari daftar), jadi
   tidak ada nomor dokumen tetap yang bisa diverifikasi lewat QR.
   Kolom tanda tangannya tetap dicetak, dan itu memang satu-satunya
   alasan kertas ini ada, sama seperti kolom "Diterima oleh" di Tanda
   Terima Konsinyasi.
   ============================================================ */

type POItem = {
  qty_pesan: number;
  harga_per_unit: number;
  items: { kode: string; nama: string; satuan: string } | null;
};

type PORow = {
  id: string;
  no_po: string | null;
  tanggal_po: string;
  ppn_percent: number;
  tax_mode: string | null;
  tax_dpp_nilai_lain: boolean | null;
  top_days: number | null;
  catatan: string | null;
  suppliers: { nama: string } | null;
  po_items: POItem[];
};

type Pengajuan = {
  po: PORow;
  mode: PurchaseTaxMode;
  totals: ReturnType<typeof hitungTotalPembelian>;
};

// PostgREST memotong hasil di max-rows (bawaan 1000) tanpa error apa
// pun, jadi diambil per halaman sampai habis. Alasan yang sama dengan
// lib/poPipeline.ts: daftar yang terpotong diam-diam menghasilkan total
// pengajuan yang kurang dan tetap terlihat masuk akal.
const HALAMAN = 1000;

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function formatAngka(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "Tanpa PPN" berdiri sendiri; dua model lainnya perlu kata PPN di depannya. */
function labelPajak(mode: PurchaseTaxMode) {
  return mode === "Non" ? "Tanpa PPN" : `PPN ${PURCHASE_TAX_LABEL[mode]}`;
}

function labelTop(hari: number | null) {
  if (hari == null) return "-";
  return hari === 0 ? "Tunai" : `${hari} hari`;
}

export default async function PrintPengajuanPOPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: org }, { data: settings }, signCfg] = await Promise.all([
    supabase.from("organizations").select("nama").eq("id", organizationId).single(),
    supabase
      .from("organization_settings")
      .select("alamat, no_telp, email, npwp, logo")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    getDocSignConfig(organizationId!, "po"),
  ]);

  const rows: PORow[] = [];
  for (let dari = 0; ; dari += HALAMAN) {
    const { data } = await supabase
      .from("purchase_orders")
      .select(
        `id, no_po, tanggal_po, ppn_percent, tax_mode, tax_dpp_nilai_lain, top_days, catatan,
         suppliers(nama),
         po_items(qty_pesan, harga_per_unit, items(kode, nama, satuan))`
      )
      .eq("organization_id", organizationId)
      .eq("status", "Dibuat")
      .order("tanggal_po", { ascending: true })
      .order("id", { ascending: true })
      .range(dari, dari + HALAMAN - 1);

    const batch = (data || []) as unknown as PORow[];
    rows.push(...batch);
    if (batch.length < HALAMAN) break;
  }

  const daftar: Pengajuan[] = rows.map((po) => {
    const subtotal = po.po_items.reduce(
      (s, r) => s + Number(r.qty_pesan) * Number(r.harga_per_unit),
      0
    );
    const mode = parsePurchaseTaxMode(po.tax_mode);
    return {
      po,
      mode,
      totals: hitungTotalPembelian(
        subtotal,
        mode,
        Number(po.ppn_percent),
        po.tax_dpp_nilai_lain !== false
      ),
    };
  });

  const grandSubtotal = daftar.reduce((s, d) => s + d.totals.subtotal, 0);
  const grandPajak = daftar.reduce((s, d) => s + d.totals.tax, 0);
  const grandTotal = daftar.reduce((s, d) => s + d.totals.total, 0);
  const jumlahBaris = daftar.reduce((s, d) => s + d.po.po_items.length, 0);

  // Kolom tanda tangan pengajuan selalu dicetak, termasuk saat QR
  // Signature PO menyala: yang disahkan QR adalah PO-nya satu per satu,
  // sedangkan kertas ini justru dibuat untuk dimintakan tanda tangan.
  const signers = signCfg.slots.filter((s) => s.aktif);

  const kontakLine = [
    settings?.no_telp ? `Telp: ${settings.no_telp}` : null,
    settings?.email ? `Email: ${settings.email}` : null,
    settings?.npwp ? `NPWP: ${settings.npwp}` : null,
  ]
    .filter(Boolean)
    .join("  •  ");

  const tanggalCetak = localDateStr();

  return (
    <div className="min-h-screen py-4 sm:py-8 print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print { body { background: white !important; } }
      `}</style>

      <PrintButton />

      <div className="bg-white text-[#1a1a1a] a4-sheet max-w-[210mm] mx-auto shadow-xl print:shadow-none rounded-sm print:rounded-none p-[15mm] print:p-0 text-[12.5px] leading-relaxed">
        {/* ===== KOP ===== */}
        <PrintKop
          nama={org?.nama || ""}
          alamat={settings?.alamat}
          kontak={kontakLine}
          logo={settings?.logo}
          kanan={
            <>
              <div className="text-[19px] font-bold tracking-wide">
                PENGAJUAN PURCHASE ORDER
              </div>
              <div className="text-[11.5px] text-neutral-600 mt-1">
                Tanggal cetak: {formatTanggal(tanggalCetak)}
              </div>
              <div className="text-[11.5px] text-neutral-600">
                {daftar.length} PO menunggu persetujuan
              </div>
            </>
          }
        />

        {daftar.length === 0 ? (
          <p className="mt-6 text-[12.5px]">
            Tidak ada Purchase Order berstatus Dibuat. Semua pengajuan sudah
            disetujui atau dibatalkan.
          </p>
        ) : (
          <>
            {/* ===== REKAP ===== */}
            <div className="mt-5 text-[11px] uppercase tracking-wide text-neutral-500">
              Rekap pengajuan
            </div>
            <table className="w-full mt-1 border-collapse">
              <thead>
                <tr className="border-y border-[#1a1a1a] text-[11px] uppercase tracking-wide">
                  <th className="py-2 pr-2 text-left w-8">No</th>
                  <th className="py-2 pr-2 text-left">No. PO</th>
                  <th className="py-2 pr-2 text-left">Tanggal</th>
                  <th className="py-2 pr-2 text-left">Supplier</th>
                  <th className="py-2 pr-2 text-right">Item</th>
                  <th className="py-2 pr-2 text-left w-[18mm]">TOP</th>
                  <th className="py-2 text-right">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {daftar.map((d, i) => (
                  <tr key={d.po.id} className="border-b border-neutral-300">
                    <td className="py-1.5 pr-2 align-top">{i + 1}</td>
                    <td className="py-1.5 pr-2 align-top font-mono text-[11.5px]">
                      {d.po.no_po || "-"}
                    </td>
                    <td className="py-1.5 pr-2 align-top whitespace-nowrap">
                      {formatTanggal(d.po.tanggal_po)}
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      {d.po.suppliers?.nama || "-"}
                    </td>
                    <td className="py-1.5 pr-2 align-top text-right">
                      {d.po.po_items.length}
                    </td>
                    <td className="py-1.5 pr-2 align-top whitespace-nowrap">
                      {labelTop(d.po.top_days)}
                    </td>
                    <td className="py-1.5 align-top text-right whitespace-nowrap">
                      {formatRupiah(d.totals.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#1a1a1a] font-bold">
                  <td className="py-2 pr-2" colSpan={4}>
                    TOTAL PENGAJUAN ({daftar.length} PO)
                  </td>
                  <td className="py-2 pr-2 text-right">{jumlahBaris}</td>
                  <td className="py-2 pr-2" />
                  <td className="py-2 text-right whitespace-nowrap">
                    {formatRupiah(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="mt-2 text-[11px] text-neutral-600">
              Nilai barang {formatRupiah(grandSubtotal)} · PPN{" "}
              {formatRupiah(grandPajak)} · tiap PO dihitung menurut model pajak
              yang dibekukan di dokumennya, jadi PO Include tidak menambah PPN di
              atas totalnya.
            </div>

            {/* ===== RINCIAN PER PO ===== */}
            <div className="mt-7 text-[11px] uppercase tracking-wide text-neutral-500">
              Rincian barang yang diajukan
            </div>
            {daftar.map((d, i) => (
              <div key={d.po.id} className="mt-4 break-inside-avoid">
                <div className="flex items-baseline justify-between border-b border-[#1a1a1a] pb-1">
                  <div className="font-bold text-[13px]">
                    {i + 1}. {d.po.suppliers?.nama || "-"}
                    <span className="font-mono font-normal text-[11.5px] text-neutral-600">
                      {" · "}
                      {d.po.no_po || "-"}
                    </span>
                  </div>
                  <div className="text-[10.5px] text-neutral-600 whitespace-nowrap">
                    {formatTanggal(d.po.tanggal_po)} · TOP{" "}
                    {labelTop(d.po.top_days)} · {labelPajak(d.mode)}
                  </div>
                </div>

                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide border-b border-neutral-400">
                      <th className="py-1.5 pr-2 text-left w-[10mm]">No</th>
                      <th className="py-1.5 pr-2 text-left">Nama Barang</th>
                      <th className="py-1.5 pr-2 text-right w-[20mm]">Qty</th>
                      <th className="py-1.5 pr-2 text-left w-[14mm]">Satuan</th>
                      <th className="py-1.5 pr-2 text-right w-[28mm]">
                        Harga/Unit
                      </th>
                      <th className="py-1.5 text-right w-[30mm]">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.po.po_items.map((r, j) => (
                      <tr key={j} className="border-b border-neutral-200">
                        <td className="py-1.5 pr-2 align-top">{j + 1}</td>
                        <td className="py-1.5 pr-2 align-top">
                          <span className="font-medium">{r.items?.nama || "-"}</span>
                          <span className="text-[10.5px] text-neutral-500 font-mono">
                            {r.items?.kode ? ` · ${r.items.kode}` : ""}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 text-right align-top">
                          {formatAngka(Number(r.qty_pesan))}
                        </td>
                        <td className="py-1.5 pr-2 align-top">
                          {r.items?.satuan || "-"}
                        </td>
                        <td className="py-1.5 pr-2 text-right align-top whitespace-nowrap">
                          {formatRupiah(Number(r.harga_per_unit))}
                        </td>
                        <td className="py-1.5 text-right align-top whitespace-nowrap">
                          {formatRupiah(
                            Number(r.qty_pesan) * Number(r.harga_per_unit)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {d.po.catatan && (
                  <div className="mt-1.5 text-[11px]">
                    <span className="text-neutral-500">Catatan: </span>
                    {d.po.catatan}
                  </div>
                )}

                <div className="flex justify-end mt-2">
                  <div className="w-[70mm] text-[11.5px]">
                    <PurchaseTotals
                      totals={d.totals}
                      mode={d.mode}
                      cetak
                      judulTotal="TOTAL PO"
                    />
                  </div>
                </div>
              </div>
            ))}
          </>
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
            Daftar ini adalah potret PO berstatus Dibuat pada saat dicetak, bukan
            dokumen bernomor. Persetujuannya tetap dicatat per PO di sistem.
          </span>
          <span>{formatTanggal(tanggalCetak)}</span>
        </div>
      </div>
    </div>
  );
}
