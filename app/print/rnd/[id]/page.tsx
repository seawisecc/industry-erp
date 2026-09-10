import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import PrintButton from "../../po/[id]/PrintButton";
import PrintKop from "@/components/PrintKop";
import { faseKey, faseLabel, urutkanFormula } from "@/lib/formulaOrder";
import { labelRevisi } from "@/lib/rnd";

/* ============================================================
   Lembar kerja lab R&D.

   Yang dicetak adalah takaran TEORITIS tiap bahan untuk satu batch
   trial, dengan kolom kosong di sebelahnya untuk timbangan aktual.
   Bedanya dengan lembar hitung opname (yang sengaja tidak mencetak
   angka sistem) memang disengaja: di opname angka sistem adalah
   jawaban yang tidak boleh disalin, sedangkan di sini takaran adalah
   INSTRUKSI yang harus diikuti, dan selisih terhadapnya justru data
   yang dicari.
   ============================================================ */

type Detail = {
  id: string;
  no_formula: string;
  revisi: number;
  nama_produk: string;
  brand: string | null;
  tanggal_develop: string;
  status: string;
  trial_gram: number | null;
  netto_gram: number | null;
  catatan: string | null;
  alasan_revisi: string | null;
  clients: { company_brand: string } | null;
  rnd_formula_items: {
    item_id: string;
    fase: string | null;
    percentage: number;
    fungsi: string | null;
    items: { kode: string; nama: string; satuan: string } | null;
  }[];
  rnd_formula_specs: {
    urutan: number;
    grup: string | null;
    parameter: string;
    satuan: string | null;
    target: string | null;
  }[];
};

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function angka(n: number, desimal = 3) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: desimal });
}

export default async function PrintRndPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: org }, { data: settings }] = await Promise.all([
    supabase
      .from("rnd_formulas")
      .select(
        "id, no_formula, revisi, nama_produk, brand, tanggal_develop, status, trial_gram, netto_gram, catatan, alasan_revisi, " +
          "clients(company_brand), " +
          "rnd_formula_items(item_id, fase, percentage, fungsi, items(kode, nama, satuan)), " +
          "rnd_formula_specs(urutan, grup, parameter, satuan, target)"
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    supabase.from("organizations").select("nama").eq("id", organizationId).single(),
    supabase
      .from("organization_settings")
      .select("alamat, no_telp, email, logo")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (!data) notFound();
  const f = data as unknown as Detail;

  const trialGram = f.trial_gram == null ? null : Number(f.trial_gram);

  const bahan = urutkanFormula(
    (f.rnd_formula_items || []).map((r) => {
      const pct = Number(r.percentage);
      return {
        kode: r.items?.kode || "-",
        nama: r.items?.nama || "(item terhapus)",
        fase: r.fase,
        fungsi: r.fungsi,
        percentage: pct,
        gram: trialGram && trialGram > 0 ? (pct / 100) * trialGram : null,
      };
    })
  );

  const totalPct = bahan.reduce((s, b) => s + b.percentage, 0);
  const totalGram = bahan.reduce((s, b) => s + (b.gram ?? 0), 0);

  const specs = [...(f.rnd_formula_specs || [])].sort(
    (a, b) => a.urutan - b.urutan
  );

  const kontakLine = [
    settings?.no_telp ? `Telp: ${settings.no_telp}` : null,
    settings?.email ? `Email: ${settings.email}` : null,
  ]
    .filter(Boolean)
    .join("  •  ");

  return (
    <div className="min-h-screen py-4 sm:py-8 print:py-0">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { body { background: white !important; } }
      `}</style>

      <PrintButton />

      <div className="bg-white text-[#1a1a1a] a4-sheet max-w-[210mm] mx-auto shadow-xl print:shadow-none rounded-sm print:rounded-none p-[15mm] print:p-0 text-[12.5px] leading-relaxed">
        <PrintKop
          nama={org?.nama || ""}
          alamat={settings?.alamat}
          kontak={kontakLine}
          logo={settings?.logo}
          kanan={
            <>
              <div className="text-[19px] font-bold tracking-wide">
                LEMBAR KERJA R&amp;D
              </div>
              <div className="font-mono text-[13px] mt-1">{f.no_formula}</div>
              <div className="text-[11.5px] text-neutral-600 mt-0.5">
                {labelRevisi(f.revisi)} · {f.status}
              </div>
            </>
          }
        />

        {/* ===== IDENTITAS ===== */}
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-[11.5px]">
          <div>
            <span className="text-neutral-500">Nama Produk: </span>
            <span className="font-medium">{f.nama_produk}</span>
          </div>
          <div>
            <span className="text-neutral-500">Tanggal Develop: </span>
            {formatTanggal(f.tanggal_develop)}
          </div>
          <div>
            <span className="text-neutral-500">Brand: </span>
            {f.brand || "-"}
          </div>
          <div>
            <span className="text-neutral-500">Client: </span>
            {f.clients?.company_brand || "-"}
          </div>
          <div>
            <span className="text-neutral-500">Batch Trial: </span>
            <span className="font-medium">
              {trialGram ? `${angka(trialGram)} g` : "-"}
            </span>
          </div>
          <div>
            <span className="text-neutral-500">Gramasi Produk: </span>
            {f.netto_gram ? `${angka(Number(f.netto_gram))} g/pcs` : "-"}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-6 text-[11.5px]">
          <div>
            <span className="text-neutral-500">Dikerjakan: </span>
            <span className="inline-block border-b border-neutral-400 min-w-[32mm]">
              &nbsp;
            </span>
          </div>
          <div>
            <span className="text-neutral-500">Tanggal trial: </span>
            <span className="inline-block border-b border-neutral-400 min-w-[28mm]">
              &nbsp;
            </span>
          </div>
          <div>
            <span className="text-neutral-500">Jam mulai: </span>
            <span className="inline-block border-b border-neutral-400 min-w-[22mm]">
              &nbsp;
            </span>
          </div>
        </div>

        {f.catatan && (
          <div className="mt-3 text-[11.5px]">
            <span className="text-neutral-500">Brief: </span>
            {f.catatan}
          </div>
        )}
        {f.alasan_revisi && (
          <div className="mt-1 text-[11.5px]">
            <span className="text-neutral-500">Alasan revisi: </span>
            {f.alasan_revisi}
          </div>
        )}

        {/* ===== PENIMBANGAN ===== */}
        <div className="text-[11px] uppercase tracking-wide text-neutral-500 mt-5 mb-1">
          {bahan.length} bahan · timbang urut per fase, isi kolom aktual dengan
          angka timbangan
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wide border-b-2 border-[#1a1a1a]">
              <th className="py-2 pr-2 text-left w-[9mm]">No</th>
              <th className="py-2 pr-2 text-left w-[12mm]">Fase</th>
              <th className="py-2 pr-2 text-left">Bahan</th>
              <th className="py-2 pr-2 text-right w-[18mm]">%</th>
              <th className="py-2 pr-2 text-right w-[24mm]">Takaran (g)</th>
              <th className="py-2 pr-2 text-center w-[26mm]">Aktual (g)</th>
              <th className="py-2 text-center w-[18mm]">Paraf</th>
            </tr>
          </thead>
          <tbody>
            {bahan.map((b, i) => (
              <tr key={i} className="border-b border-neutral-300">
                <td className="py-2.5 pr-2 text-neutral-500">{i + 1}</td>
                <td className="py-2.5 pr-2 text-[11px]">
                  {faseLabel(faseKey(b.fase)) === "Tanpa Fase"
                    ? "-"
                    : faseKey(b.fase)}
                </td>
                <td className="py-2.5 pr-2">
                  {b.nama}
                  <span className="text-neutral-500 font-mono text-[10.5px]">
                    {" "}
                    {b.kode}
                  </span>
                  {b.fungsi && (
                    <span className="text-neutral-500"> · {b.fungsi}</span>
                  )}
                </td>
                <td className="py-2.5 pr-2 text-right">
                  {angka(b.percentage, 4)}
                </td>
                <td className="py-2.5 pr-2 text-right font-medium">
                  {b.gram == null ? "-" : angka(b.gram)}
                </td>
                <td className="py-2.5 pr-2 border-l border-neutral-300">
                  &nbsp;
                </td>
                <td className="py-2.5 border-l border-neutral-300">&nbsp;</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-b-2 border-[#1a1a1a] font-bold">
              <td className="py-2 pr-2" colSpan={3}>
                TOTAL
              </td>
              <td className="py-2 pr-2 text-right">{angka(totalPct, 4)}</td>
              <td className="py-2 pr-2 text-right">
                {trialGram ? angka(totalGram) : "-"}
              </td>
              <td className="py-2 pr-2 border-l border-neutral-300">&nbsp;</td>
              <td className="py-2 border-l border-neutral-300">&nbsp;</td>
            </tr>
          </tfoot>
        </table>

        {/* ===== SPEK TARGET ===== */}
        {specs.length > 0 && (
          <div className="mt-6 break-inside-avoid">
            <div className="font-bold text-[13px] tracking-wide uppercase border-b border-[#1a1a1a] pb-1">
              Spesifikasi Target
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wide border-b-2 border-[#1a1a1a]">
                  <th className="py-2 pr-2 text-left w-[32mm]">Grup</th>
                  <th className="py-2 pr-2 text-left">Parameter</th>
                  <th className="py-2 pr-2 text-left w-[18mm]">Satuan</th>
                  <th className="py-2 pr-2 text-left w-[38mm]">Target</th>
                  <th className="py-2 text-center w-[40mm]">Hasil Uji</th>
                </tr>
              </thead>
              <tbody>
                {specs.map((s, i) => (
                  <tr key={i} className="border-b border-neutral-300">
                    <td className="py-2.5 pr-2 text-[11px] text-neutral-600">
                      {s.grup || "-"}
                    </td>
                    <td className="py-2.5 pr-2">{s.parameter}</td>
                    <td className="py-2.5 pr-2 text-[11px]">{s.satuan || "-"}</td>
                    <td className="py-2.5 pr-2">{s.target || "-"}</td>
                    <td className="py-2.5 border-l border-neutral-300">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ===== CATATAN HASIL ===== */}
        <div className="mt-6 break-inside-avoid">
          <div className="font-bold text-[13px] tracking-wide uppercase border-b border-[#1a1a1a] pb-1">
            Catatan Hasil Develop
          </div>
          <div className="mt-2 flex flex-col gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border-b border-neutral-300">
                &nbsp;
              </div>
            ))}
          </div>
        </div>

        {/* ===== TANDA TANGAN ===== */}
        <div className="mt-8 grid grid-cols-3 gap-6 text-center break-inside-avoid">
          {["Dikerjakan oleh,", "Diperiksa oleh,", "Disetujui oleh,"].map((l) => (
            <div key={l}>
              <div className="text-[12px]">{l}</div>
              <div className="h-[20mm]" />
              <div className="border-b border-[#1a1a1a] inline-block min-w-[40mm] pb-0.5">
                &nbsp;
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
