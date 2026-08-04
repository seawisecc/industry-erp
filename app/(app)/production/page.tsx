import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Play, ClipboardCheck, Eye } from "lucide-react";
import ProdukShell from "@/components/ProdukShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";
import {
  ilikeOrWithIds,
  pageInfo,
  parseListQuery,
  type SearchParams,
} from "@/lib/pagination";

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

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

  const canPlan =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_plan_production;

  const sp = parseListQuery(await searchParams);

  // Nama produk ada di tabel products, cari id-nya dulu.
  let productIds: string[] = [];
  if (sp.q) {
    const { data: prods } = await supabase
      .from("products")
      .select("id")
      .eq("organization_id", organizationId)
      .or(`kode.ilike."%${sp.q}%",nama_produk.ilike."%${sp.q}%"`)
      .limit(500);
    productIds = (prods || []).map((p) => p.id as string);
  }

  let planQuery = supabase
    .from("production_plans")
    .select(
      "id, no_batch, jumlah_batch, tanggal_rencana, status, production_batch_id, products(kode, nama_produk)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    planQuery = planQuery.or(
      ilikeOrWithIds(["no_batch"], sp.q, "product_id", productIds)
    );
  if (sp.filter("status")) planQuery = planQuery.eq("status", sp.filter("status"));

  const [{ data: plans, count }, { data: batches }] = await Promise.all([
    planQuery.order("created_at", { ascending: false }).range(sp.from, sp.to),
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
  const info = pageInfo(sp.page, count, planList.length);
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
        <TableToolbar
          placeholder="Cari no. batch / produk..."
          info={info}
          filters={[
            {
              param: "status",
              label: "Semua Status",
              options: [
                "Direncanakan",
                "Sedang Produksi",
                "Selesai",
              ].map((s) => ({ value: s, label: s })),
            },
          ]}
        />
      </div>
      <DataTable
        rows={planList}
        rowKey={(p) => p.id}
        minWidth={800}
        empty={
          sp.q || sp.filter("status")
            ? "Tidak ada plan yang cocok dengan pencarian/filter."
            : `Belum ada plan produksi.${
                canPlan ? " Mulai dari tombol Buat Plan Produksi." : ""
              }`
        }
        columns={[
          {
            key: "batch",
            header: "No. Batch",
            role: "subtitle",
            className: "whitespace-nowrap",
            cell: (p) => (
              <span className="font-mono text-[12.5px]">{p.no_batch}</span>
            ),
          },
          {
            key: "produk",
            header: "Produk",
            role: "title",
            cell: (p) => (
              <>
                <div className="max-w-[220px] truncate font-medium">
                  {p.products?.nama_produk || "-"}
                </div>
                <div className="text-[11px] text-muted font-mono">
                  {p.products?.kode}
                </div>
              </>
            ),
            cardCell: (p) => (
              <>
                <div>{p.products?.nama_produk || "-"}</div>
                <div className="text-[11px] text-muted font-mono font-normal">
                  {p.products?.kode}
                </div>
              </>
            ),
          },
          {
            key: "jml",
            header: "Jml Batch",
            role: "primary",
            align: "right",
            cell: (p) => Number(p.jumlah_batch).toLocaleString("id-ID"),
          },
          {
            key: "rencana",
            header: "Rencana",
            cardLabel: "Tanggal Rencana",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (p) => formatTanggal(p.tanggal_rencana),
          },
          {
            key: "status",
            header: "Status",
            role: "badge",
            cell: (p) => (
              <span
                className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11.5px] font-medium ${PLAN_STYLE[p.status] || ""}`}
              >
                {p.status}
              </span>
            ),
          },
          {
            key: "aksi",
            header: "Aksi",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (p) => (
              <RowActions>
                {p.status === "Direncanakan" && (
                  <IconAction
                    icon={Play}
                    label="Mulai eksekusi"
                    href={`/production/plan/${p.id}/execute`}
                    tone="primary"
                  />
                )}
                {p.status === "Sedang Produksi" && (
                  <>
                    <IconAction
                      icon={Play}
                      label="Lanjut eksekusi"
                      href={`/production/plan/${p.id}/execute`}
                    />
                    <IconAction
                      icon={ClipboardCheck}
                      label="Input hasil produksi"
                      href={`/production/plan/${p.id}/result`}
                      tone="primary"
                    />
                  </>
                )}
                {p.status === "Selesai" && p.production_batch_id && (
                  <IconAction
                    icon={Eye}
                    label="Lihat detail batch"
                    href={`/production/${p.production_batch_id}`}
                    tone="primary"
                  />
                )}
              </RowActions>
            ),
          },
        ]}
      />

      <Pagination info={info} />

      {/* ===== HISTORY ===== */}
      <div className="mt-6">
        <h3 className="font-display text-[15px] font-semibold text-ink mb-2">
          Production History (HPP Real){" "}
          <span className="font-sans text-[12px] font-normal text-muted">
            · 30 terakhir
          </span>
        </h3>
        <DataTable
          rows={batchList}
          rowKey={(b) => b.id}
          minWidth={760}
          empty="Belum ada produksi selesai."
          columns={[
            {
              key: "batch",
              header: "No. Batch",
              role: "subtitle",
              className: "whitespace-nowrap",
              cell: (b) => (
                <span className="font-mono text-[12.5px]">
                  {b.no_batch_produksi}
                </span>
              ),
            },
            {
              key: "tanggal",
              header: "Tanggal",
              role: "secondary",
              className: "whitespace-nowrap",
              cell: (b) => formatTanggal(b.tanggal_produksi),
            },
            {
              key: "produk",
              header: "Produk",
              role: "title",
              cell: (b) => (
                <div className="max-w-[220px] truncate font-medium">
                  {b.production_outputs?.[0]?.products?.nama_produk || "-"}
                </div>
              ),
              cardCell: (b) =>
                b.production_outputs?.[0]?.products?.nama_produk || "-",
            },
            {
              key: "hasil",
              header: "Hasil",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap text-[12.5px]",
              cell: (b) =>
                b.production_outputs.length === 0
                  ? "-"
                  : b.production_outputs
                      .map(
                        (o) =>
                          `${o.varian_ukuran ? o.varian_ukuran + ": " : ""}${Number(o.qty_hasil).toLocaleString("id-ID")} ${o.satuan}`
                      )
                      .join(" · "),
            },
            {
              key: "cost",
              header: "Cost Bahan",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (b) => formatRupiah(Number(b.total_cost_bahan)),
            },
            {
              key: "aksi",
              role: "actions",
              align: "right",
              cell: (b) => (
                <RowActions>
                  <IconAction
                    icon={Eye}
                    label="Lihat batch record"
                    href={`/production/${b.id}`}
                    tone="primary"
                  />
                </RowActions>
              ),
            },
          ]}
        />
      </div>
    </ProdukShell>
  );
}
