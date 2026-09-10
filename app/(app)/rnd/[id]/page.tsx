import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import DataTable from "@/components/DataTable";
import CancelTxButton from "@/components/CancelTxButton";
import { canAccessModule } from "@/lib/modules";
import { localDateTimeStr } from "@/lib/dates";
import { faseKey, faseLabel, urutkanFormula } from "@/lib/formulaOrder";
import { klasStatusRnd, labelRevisi, statusBeku } from "@/lib/rnd";
import { hitungBiayaFormula, kunciBahan, takaranTrial } from "@/lib/rndCost";
import { getRndOptions } from "../data";
import { deleteRndFormula } from "../actions";
import HasilForm, { type SpecRow } from "./HasilForm";
import ProduksiCek from "./ProduksiCek";
import RevisiButton from "./RevisiButton";
import KeputusanButton from "./KeputusanButton";

type Detail = {
  id: string;
  no_formula: string;
  induk_id: string | null;
  revisi: number;
  nama_produk: string;
  brand: string | null;
  client_id: string | null;
  tanggal_develop: string;
  status: string;
  trial_gram: number | null;
  netto_gram: number | null;
  catatan: string | null;
  alasan_revisi: string | null;
  hasil_develop: string | null;
  disetujui_oleh: string | null;
  disetujui_pada: string | null;
  dibuat_oleh: string | null;
  clients: { company_brand: string } | null;
  rnd_formula_items: {
    material_id: string | null;
    item_id: string | null;
    fase: string | null;
    percentage: number;
    fungsi: string | null;
  }[];
  rnd_formula_specs: (SpecRow & { urutan: number })[];
  rnd_formula_packaging: {
    material_id: string | null;
    item_id: string | null;
    nama: string | null;
    qty_per_pcs: number;
    harga_estimasi: number | null;
  }[];
};

type Versi = {
  id: string;
  no_formula: string;
  revisi: number;
  status: string;
  tanggal_develop: string;
  alasan_revisi: string | null;
};

const TABS = [
  { key: "formula", label: "Formula" },
  { key: "hasil", label: "Spek & Hasil" },
  { key: "biaya", label: "Biaya & Produksi" },
  { key: "revisi", label: "Revisi" },
] as const;

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
function angka(n: number, desimal = 3) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: desimal });
}

export default async function RndDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const aktif = TABS.some((t) => t.key === tab) ? tab! : "formula";

  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

  const [{ data }, opts] = await Promise.all([
    supabase
      .from("rnd_formulas")
      .select(
        "id, no_formula, induk_id, revisi, nama_produk, brand, client_id, tanggal_develop, status, " +
          "trial_gram, netto_gram, catatan, alasan_revisi, hasil_develop, disetujui_oleh, disetujui_pada, dibuat_oleh, " +
          "clients(company_brand), " +
          "rnd_formula_items(material_id, item_id, fase, percentage, fungsi), " +
          "rnd_formula_specs(id, urutan, grup, parameter, satuan, target, hasil), " +
          "rnd_formula_packaging(material_id, item_id, nama, qty_per_pcs, harga_estimasi)"
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    getRndOptions(organizationId!),
  ]);

  if (!data) notFound();
  const f = data as unknown as Detail;

  const indukId = f.induk_id ?? f.id;

  const [{ data: versiRaw }, { data: profiles }] = await Promise.all([
    supabase
      .from("rnd_formulas")
      .select("id, no_formula, revisi, status, tanggal_develop, alasan_revisi")
      .eq("organization_id", organizationId)
      .or(`id.eq.${indukId},induk_id.eq.${indukId}`)
      .order("revisi", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, nama")
      .eq("organization_id", organizationId),
  ]);

  const versi = (versiRaw || []) as unknown as Versi[];
  const namaOleh = new Map(
    ((profiles || []) as { id: string; nama: string }[]).map((p) => [p.id, p.nama])
  );

  const bahanOf = (key: string) => opts.bahan.find((b) => b.key === key);

  const trialGram = f.trial_gram == null ? null : Number(f.trial_gram);
  const nettoGram = f.netto_gram == null ? null : Number(f.netto_gram);

  const barisFormula = (f.rnd_formula_items || []).map((r) => ({
    key: kunciBahan(r.material_id, r.item_id),
    percentage: Number(r.percentage),
  }));
  const barisKemasan = (f.rnd_formula_packaging || []).map((p) => ({
    key:
      p.material_id || p.item_id ? kunciBahan(p.material_id, p.item_id) : null,
    nama: p.nama,
    qty_per_pcs: Number(p.qty_per_pcs),
    harga_estimasi: p.harga_estimasi == null ? null : Number(p.harga_estimasi),
  }));

  const biaya = hitungBiayaFormula(barisFormula, barisKemasan, nettoGram, bahanOf);
  const takaran = takaranTrial(barisFormula, trialGram);

  // Urutan baku formula, sama dengan detail produk, layar penimbangan,
  // dan Batch Record: per fase, persentase terbesar dulu.
  const barisBahan = urutkanFormula(
    (f.rnd_formula_items || []).map((r) => {
      const key = kunciBahan(r.material_id, r.item_id);
      const b = bahanOf(key);
      return {
        rowKey: key,
        kode: b?.kode || "-",
        nama: b?.nama || "(bahan terhapus)",
        satuan: b?.satuan || "",
        supplier: b?.supplier ?? null,
        harga: b?.harga ?? null,
        inci: b?.inci ?? null,
        terdaftar: !!b?.item_id,
        fase: r.fase,
        fungsi: r.fungsi,
        percentage: Number(r.percentage),
        gram: takaran.get(key) ?? null,
      };
    })
  );

  const totalPct = barisBahan.reduce((s, b) => s + b.percentage, 0);
  const belumJadiItem = barisBahan.filter((b) => !b.terdaftar).length;

  const specs = [...(f.rnd_formula_specs || [])]
    .sort((a, b) => a.urutan - b.urutan)
    .map((s) => ({
      id: s.id,
      grup: s.grup,
      parameter: s.parameter,
      satuan: s.satuan,
      target: s.target,
      hasil: s.hasil,
    }));

  const beku = statusBeku(f.status);
  const bisaHapus =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_cancel;
  const bisaPutuskan =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_plan_production;

  const bolehPpic = canAccessModule(
    {
      isSuperAdmin,
      role: profile?.role || "",
      allowedModules: profile?.allowed_modules ?? null,
    },
    "ppic"
  );

  const versiBerlaku = versi.find(
    (v) => v.status === "Disetujui" && v.id !== f.id
  );

  return (
    <div className="max-w-5xl">
      <Link
        href="/rnd"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke R&amp;D Formulation
      </Link>

      {/* ===== KEPALA ===== */}
      <div
        className={`glass rounded-2xl p-6 ${
          f.status === "Disetujui" ? "border-botanical-700/40" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-[13px] text-botanical-700">
                {f.no_formula}
              </span>
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${klasStatusRnd(
                  f.status
                )}`}
              >
                {f.status}
              </span>
              <span className="text-muted text-[12px]">
                {labelRevisi(f.revisi)}
              </span>
            </div>
            <h1 className="font-display text-2xl font-semibold text-ink mt-1.5">
              {f.nama_produk}
            </h1>
            <p className="text-muted text-[13px] mt-0.5">
              {[
                f.brand,
                f.clients?.company_brand,
                formatTanggal(f.tanggal_develop),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {f.status === "Disetujui" && (
              <p className="text-botanical-700 text-[12.5px] font-medium mt-1.5">
                Formula ini yang dipakai. Turunkan ke master Products secara
                manual kalau mau diproduksi.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link
              href={`/print/rnd/${f.id}`}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-line text-ink text-[12.5px] font-medium hover:bg-white/60 transition-colors"
            >
              <Printer size={15} /> Lembar Kerja Lab
            </Link>
            {!beku && (
              <Link
                href={`/rnd/${f.id}/edit`}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-line text-ink text-[12.5px] font-medium hover:bg-white/60 transition-colors"
              >
                <Pencil size={15} /> Ubah Formula
              </Link>
            )}
            <RevisiButton id={f.id} noFormula={f.no_formula} />
            {bisaPutuskan && (
              <KeputusanButton
                id={f.id}
                noFormula={f.no_formula}
                namaProduk={f.nama_produk}
                disetujui={f.status === "Disetujui"}
                versiLain={versiBerlaku?.no_formula ?? null}
              />
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Batch trial",
              nilai: trialGram ? `${angka(trialGram)} g` : "-",
            },
            {
              label: "Gramasi produk",
              nilai: nettoGram ? `${angka(nettoGram)} g/pcs` : "-",
            },
            { label: "Total formula", nilai: `${angka(totalPct, 2)}%` },
            {
              label: "Biaya per pcs",
              nilai:
                biaya.totalPerPcs == null ? "-" : rupiah(biaya.totalPerPcs),
            },
          ].map((k) => (
            <div key={k.label} className="rounded-xl bg-botanical-100/40 px-3 py-2.5">
              <div className="text-muted text-[11.5px]">{k.label}</div>
              <div className="font-display text-[15px] font-semibold text-ink mt-0.5">
                {k.nilai}
              </div>
            </div>
          ))}
        </div>

        {(f.catatan || f.alasan_revisi) && (
          <div className="mt-4 flex flex-col gap-1.5 text-[12.5px]">
            {f.catatan && (
              <div>
                <span className="text-muted">Brief: </span>
                {f.catatan}
              </div>
            )}
            {f.alasan_revisi && (
              <div>
                <span className="text-muted">Alasan revisi: </span>
                {f.alasan_revisi}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 text-muted text-[12px]">
          Modul R&amp;D tidak menyentuh stok. Bahan yang terpakai saat trial
          tetap dicatat lewat Material Issue seperti biasa.
        </div>

        <div className="mt-1.5 text-muted text-[12px]">
          Dibuat oleh {(f.dibuat_oleh && namaOleh.get(f.dibuat_oleh)) || "-"}
          {f.disetujui_pada && (
            <>
              {" · Disetujui "}
              {(f.disetujui_oleh && namaOleh.get(f.disetujui_oleh)) || "-"}
              {", "}
              {localDateTimeStr(f.disetujui_pada)}
            </>
          )}
        </div>
      </div>

      {/* ===== TAB ===== */}
      <div className="mt-5 flex items-center gap-1 border-b border-line overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/rnd/${f.id}?tab=${t.key}`}
            className={`px-3.5 py-2 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              aktif === t.key
                ? "border-botanical-700 text-botanical-700"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {t.key === "revisi" && versi.length > 1 ? ` (${versi.length})` : ""}
          </Link>
        ))}
      </div>

      <div className="mt-5">
        {aktif === "formula" && (
          <div className="flex flex-col gap-4">
            <div className="glass rounded-2xl p-6">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <h2 className="font-display text-[15.5px] font-semibold text-ink">
                  Formula Bahan Baku
                </h2>
                <span className="text-muted text-[12.5px]">
                  {barisBahan.length} bahan · takaran untuk{" "}
                  {trialGram ? `${angka(trialGram)} g` : "batch trial"}
                  {belumJadiItem > 0
                    ? ` · ${belumJadiItem} belum jadi item stok`
                    : ""}
                </span>
              </div>

              <DataTable
                rows={barisBahan}
                rowKey={(r) => r.rowKey}
                minWidth={880}
                chrome="bare"
                maxHeight={false}
                empty="Formula ini belum punya bahan."
                groupBy={{
                  key: (r) => faseKey(r.fase),
                  header: (g) =>
                    `${faseLabel(g.key)} · ${g.rows.length} bahan · ${angka(
                      g.rows.reduce((s, r) => s + r.percentage, 0),
                      2
                    )}%`,
                }}
                columns={[
                  {
                    key: "bahan",
                    header: "Bahan",
                    role: "title",
                    cell: (r) => (
                      <>
                        <div className="font-medium flex items-center gap-1.5">
                          <span>{r.nama}</span>
                          {!r.terdaftar && (
                            <span
                              className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-500 flex-shrink-0"
                              title="Bahan ini belum punya item stok"
                            >
                              belum diadakan
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted font-mono">
                          {r.kode}
                          {r.fungsi ? ` · ${r.fungsi}` : ""}
                        </div>
                      </>
                    ),
                  },
                  {
                    key: "pct",
                    header: "%",
                    role: "primary",
                    align: "right",
                    className: "whitespace-nowrap font-medium",
                    cell: (r) => `${angka(r.percentage, 4)}%`,
                  },
                  {
                    key: "gram",
                    header: "Takaran Trial",
                    role: "primary",
                    align: "right",
                    className: "whitespace-nowrap",
                    cell: (r) =>
                      r.gram == null ? "-" : `${angka(r.gram)} g`,
                  },
                  {
                    key: "harga",
                    header: "Harga Terakhir",
                    role: "secondary",
                    align: "right",
                    className: "whitespace-nowrap",
                    cell: (r) =>
                      r.harga != null
                        ? `${rupiah(r.harga)}/${r.satuan}`
                        : r.terdaftar
                          ? "belum pernah dibeli"
                          : "belum jadi item stok",
                  },
                  {
                    key: "perkg",
                    header: "Biaya / kg Ruahan",
                    role: "primary",
                    align: "right",
                    className: "whitespace-nowrap",
                    cell: (r) =>
                      r.harga == null
                        ? "-"
                        : rupiah((r.percentage / 100) * r.harga),
                  },
                  {
                    key: "supplier",
                    header: "Supplier",
                    role: "secondary",
                    cell: (r) => r.supplier || "-",
                  },
                  {
                    key: "inci",
                    header: "INCI",
                    role: "secondary",
                    cell: (r) => (
                      <div className="max-w-[260px] truncate">{r.inci || "-"}</div>
                    ),
                    cardCell: (r) => r.inci || "-",
                  },
                ]}
                footer={{
                  row: (
                    <tr className="font-medium">
                      <td className="px-4 py-2.5">Total</td>
                      <td className="px-4 py-2.5 text-right">
                        {angka(totalPct, 2)}%
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {trialGram ? `${angka(trialGram)} g` : "-"}
                      </td>
                      <td className="px-4 py-2.5" />
                      <td className="px-4 py-2.5 text-right">
                        {rupiah(biaya.bahanPerKg)}
                      </td>
                      <td className="px-4 py-2.5" />
                      <td className="px-4 py-2.5" />
                    </tr>
                  ),
                  card: (
                    <div className="flex items-baseline justify-between">
                      <span className="text-muted text-[12.5px]">
                        Total {angka(totalPct, 2)}%
                      </span>
                      <span className="font-medium">
                        {rupiah(biaya.bahanPerKg)} / kg
                      </span>
                    </div>
                  ),
                }}
              />
            </div>

            <div className="glass rounded-2xl p-6">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <h2 className="font-display text-[15.5px] font-semibold text-ink">
                  Rencana Kemasan per pcs
                </h2>
                <span className="text-muted text-[12.5px]">
                  {rupiah(biaya.kemasanPerPcs)} per pcs
                </span>
              </div>
              <DataTable
                rows={biaya.rincianKemasan}
                rowKey={(r, i) => `${r.key ?? "manual"}-${i}`}
                minWidth={640}
                chrome="bare"
                maxHeight={false}
                sticky={false}
                empty="Belum ada rencana kemasan."
                columns={[
                  {
                    key: "nama",
                    header: "Kemasan",
                    role: "title",
                    cell: (r) => (
                      <>
                        <div className="font-medium">{r.nama}</div>
                        <div className="text-[11px] text-muted font-mono">
                          {r.key
                            ? r.kode + (r.adaStok ? "" : " · belum jadi item stok")
                            : "belum terdaftar di master"}
                        </div>
                      </>
                    ),
                  },
                  {
                    key: "qty",
                    header: "Qty / pcs",
                    role: "primary",
                    align: "right",
                    cell: (r) => angka(r.qty),
                  },
                  {
                    key: "harga",
                    header: "Harga",
                    role: "primary",
                    align: "right",
                    className: "whitespace-nowrap",
                    cell: (r) => (r.harga == null ? "-" : rupiah(r.harga)),
                  },
                  {
                    key: "sub",
                    header: "Subtotal",
                    role: "primary",
                    align: "right",
                    className: "whitespace-nowrap font-medium",
                    cell: (r) => rupiah(r.subtotal),
                  },
                ]}
              />
            </div>
          </div>
        )}

        {aktif === "hasil" && (
          <HasilForm
            id={f.id}
            hasilDevelop={f.hasil_develop}
            specs={specs}
            beku={beku}
          />
        )}

        {aktif === "biaya" && (
          <ProduksiCek
            formula={barisFormula}
            kemasan={barisKemasan}
            nettoGram={nettoGram}
            bahan={opts.bahan}
            ppicHref={bolehPpic ? "/ppic" : null}
          />
        )}

        {aktif === "revisi" && (
          <div className="flex flex-col gap-4">
            <div className="glass rounded-2xl p-6">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <div>
                  <h2 className="font-display text-[15.5px] font-semibold text-ink">
                    Silsilah Formula
                  </h2>
                  <p className="text-muted text-[12.5px] mt-0.5">
                    Tiap revisi adalah dokumen sendiri dengan nomor turunan, dan
                    versi sebelumnya tidak pernah ditimpa.
                  </p>
                </div>
                <RevisiButton id={f.id} noFormula={f.no_formula} />
              </div>

              <DataTable
                rows={versi}
                rowKey={(r) => r.id}
                minWidth={760}
                chrome="bare"
                maxHeight={false}
                rowClassName={(r) =>
                  r.id === f.id
                    ? "bg-botanical-100/50"
                    : r.status === "Disetujui"
                      ? "bg-botanical-100/25"
                      : ""
                }
                empty="Belum ada versi lain."
                columns={[
                  {
                    key: "no",
                    header: "No. Formula",
                    role: "title",
                    cell: (r) => (
                      <Link
                        href={`/rnd/${r.id}`}
                        className="font-mono text-[12.5px] text-botanical-700 hover:underline"
                      >
                        {r.no_formula}
                      </Link>
                    ),
                  },
                  {
                    key: "versi",
                    header: "Versi",
                    role: "primary",
                    cell: (r) =>
                      r.id === f.id
                        ? `${labelRevisi(r.revisi)} (dibuka)`
                        : labelRevisi(r.revisi),
                  },
                  {
                    key: "status",
                    header: "Status",
                    role: "badge",
                    cell: (r) => (
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${klasStatusRnd(
                          r.status
                        )}`}
                      >
                        {r.status}
                      </span>
                    ),
                  },
                  {
                    key: "tanggal",
                    header: "Tanggal",
                    role: "primary",
                    className: "whitespace-nowrap",
                    cell: (r) => formatTanggal(r.tanggal_develop),
                  },
                  {
                    key: "alasan",
                    header: "Alasan Revisi",
                    role: "secondary",
                    cell: (r) => (
                      <div className="max-w-[280px] truncate">
                        {r.alasan_revisi || "-"}
                      </div>
                    ),
                    cardCell: (r) => r.alasan_revisi || "-",
                  },
                ]}
              />
            </div>

            <div className="glass rounded-2xl p-6">
              <h2 className="font-display text-[15.5px] font-semibold text-ink mb-1">
                Hapus Percobaan Ini
              </h2>
              <p className="text-muted text-[12.5px] mb-3">
                Hanya untuk percobaan yang batal sebelum diputuskan. Versi yang
                sudah disetujui atau yang punya revisi turunan tidak bisa
                dihapus: nomor turunannya menunjuk ke sini.
              </p>
              <CancelTxButton
                id={f.id}
                action={deleteRndFormula}
                canCancel={bisaHapus}
                label="Hapus Formula"
                judul="Hapus Formula"
                keterangan={`Formula ${f.no_formula} beserta bahan, spesifikasi, dan rencana kemasannya dihapus permanen.`}
                redirectTo="/rnd"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
