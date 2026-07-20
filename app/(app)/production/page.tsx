import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";
import ProdukShell from "@/components/ProdukShell";
import TableSearch from "@/components/TableSearch";

type PlanRow = {
  id: string;
  no_batch: string;
  jumlah_batch: number;
  tanggal_rencana: string;
  status: string;
  production_batch_id: string | null;
  products: { kode: string | null; nama_produk: string } | null;
};

type BatchRow = {
  id: string;
  no_batch_produksi: string;
  tanggal_produksi: string;
  total_cost_bahan: number;
  production_outputs: {
    qty_hasil: number;
    satuan: string;
    varian_ukuran: string | null;
    products: { nama_produk: string } | null;
  }[];
};

const PLAN_STYLE: Record<string, string> = {
  Direncanakan: "bg-white/70 text-muted border border-line",
  "Sedang Produksi": "bg-amber-100 text-amber-500",
  Selesai: "bg-botanical-100 text-botanical-700",
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ProductionPage() {
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

  const canPlan =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_plan_production;

  const [{ data: plans }, { data: batches }] = await Promise.all([
    supabase
      .from("production_plans")
      .select(
        "id, no_batch, jumlah_batch, tanggal_rencana, status, production_batch_id, products(kode, nama_produk)"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("production_batches")
      .select(
        "id, no_batch_produksi, tanggal_produksi, total_cost_bahan, production_outputs(qty_hasil, satuan, varian_ukuran, products(nama_produk))"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const planList = (plans || []) as unknown as PlanRow[];
  const batchList = (batches || []) as unknown as BatchRow[];

  return (
    <ProdukShell>
      {/* ===== PLAN ===== */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Production</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            Alur: Plan (instruksi) → Execution (penimbangan) → Result (hasil &amp;
            HPP real)
          </p>
        </div>
        {canPlan && (
          <Link
            href="/production/plan/new"
            className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus size={15} /> Buat Plan Produksi
          </Link>
        )}
      </div>

      <div className="mt-4">
        <TableSearch
          placeholder="Cari no. batch / produk..."
          filters={[{ label: "Semua Status", options: ["Direncanakan", "Sedang Produksi", "Selesai"] }]}
        />
      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[800px] text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">No. Batch</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Produk</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Jml Batch</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Rencana</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {planList.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted py-10 text-sm">
                  Belum ada plan produksi.
                  {canPlan ? " Mulai dari tombol Buat Plan Produksi." : ""}
                </td>
              </tr>
            ) : (
              planList.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-[12.5px] whitespace-nowrap">
                    {p.no_batch}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[220px] truncate font-medium">
                      {p.products?.nama_produk || "—"}
                    </div>
                    <div className="text-[11px] text-muted font-mono">
                      {p.products?.kode}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {Number(p.jumlah_batch).toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatTanggal(p.tanggal_rencana)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11.5px] font-medium ${PLAN_STYLE[p.status] || ""}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {p.status === "Direncanakan" && (
                      <Link
                        href={`/production/plan/${p.id}/execute`}
                        className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                      >
                        Mulai Eksekusi
                      </Link>
                    )}
                    {p.status === "Sedang Produksi" && (
                      <>
                        <Link
                          href={`/production/plan/${p.id}/execute`}
                          className="text-muted text-[12.5px] font-medium hover:underline mr-3"
                        >
                          Eksekusi
                        </Link>
                        <Link
                          href={`/production/plan/${p.id}/result`}
                          className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                        >
                          Input Hasil
                        </Link>
                      </>
                    )}
                    {p.status === "Selesai" && p.production_batch_id && (
                      <Link
                        href={`/production/${p.production_batch_id}`}
                        className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                      >
                        Detail
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ===== HISTORY ===== */}
      <div className="mt-6">
        <h3 className="font-display text-[15px] font-semibold text-ink mb-2">
          Production History (HPP Real)
        </h3>
        <div className="glass rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13.5px]">
            <thead>
              <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
                <th className="px-4 py-2.5 font-semibold whitespace-nowrap">No. Batch</th>
                <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tanggal</th>
                <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Produk</th>
                <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Hasil</th>
                <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Cost Bahan</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {batchList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-8 text-sm">
                    Belum ada produksi selesai.
                  </td>
                </tr>
              ) : (
                batchList.map((b) => {
                  const out = b.production_outputs?.[0];
                  return (
                    <tr
                      key={b.id}
                      className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-[12.5px] whitespace-nowrap">
                        {b.no_batch_produksi}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatTanggal(b.tanggal_produksi)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[220px] truncate font-medium">
                          {out?.products?.nama_produk || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap text-[12.5px]">
                        {b.production_outputs.length === 0
                          ? "—"
                          : b.production_outputs
                              .map(
                                (o) =>
                                  `${o.varian_ukuran ? o.varian_ukuran + ": " : ""}${Number(o.qty_hasil).toLocaleString("id-ID")} ${o.satuan}`
                              )
                              .join(" · ")}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {formatRupiah(Number(b.total_cost_bahan))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/production/${b.id}`}
                          className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                        >
                          Detail
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ProdukShell>
  );
}
