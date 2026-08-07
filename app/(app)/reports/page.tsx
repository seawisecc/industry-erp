import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import PrintPageButton from "@/components/PrintPageButton";
import DataTable from "@/components/DataTable";
import { localDateStr, localMonthKey } from "@/lib/dates";
import { getMarginReport } from "@/lib/margin";
import type { ExecutionData } from "@/app/(app)/production/actions";

type ReportType =
  | "sales"
  | "consignment"
  | "purchasing"
  | "production"
  | "stock"
  | "margin"
  | "finance";

const TYPES: { key: ReportType; label: string; desc: string }[] = [
  { key: "sales", label: "Sales", desc: "Invoices & POS per period" },
  { key: "consignment", label: "Consignment", desc: "Shipped, sold, returned & remaining per outlet" },
  { key: "purchasing", label: "Purchasing", desc: "Purchase invoices per period" },
  { key: "production", label: "Production", desc: "Batches, COGS & yield" },
  { key: "stock", label: "Stock Movement", desc: "Material stock movement & finished goods corrections" },
  { key: "margin", label: "Product Margin", desc: "Real COGS vs actual selling price per product" },
  { key: "finance", label: "Receivables & Payables", desc: "Open sales & purchase balances" },
];

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
function formatQty(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}
function formatTanggal(iso: string) {
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const th = "px-3 py-2.5 font-semibold";
const td = "px-3 py-2.5";
const thead =
  "text-left text-muted text-[11px] uppercase tracking-wide border-b border-line";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const today = new Date();
  const defaultFrom = `${localMonthKey(today)}-01`;
  const todayStr = localDateStr(today);

  const type = (TYPES.some((t) => t.key === params.type)
    ? params.type
    : "sales") as ReportType;
  const from = params.from || defaultFrom;
  const to = params.to || todayStr;

  const { data: org } = await supabase
    .from("organizations")
    .select("nama")
    .eq("id", organizationId)
    .single();

  const active = TYPES.find((t) => t.key === type)!;

  // ============ DATA PER JENIS LAPORAN ============
  let content: React.ReactNode = null;

  if (type === "sales") {
    const { data } = await supabase
      .from("sales_invoices")
      .select(
        "no_invoice, tipe, sumber, tanggal, subtotal, diskon_percent, pakai_tax, tax_percent, total, status_bayar, nama_pembeli, clients(company_brand)"
      )
      .eq("organization_id", organizationId)
      .gte("tanggal", from)
      .lte("tanggal", to)
      .order("tanggal");

    const rows = (data || []) as unknown as {
      no_invoice: string | null;
      tipe: string;
      sumber: string;
      tanggal: string;
      subtotal: number;
      diskon_percent: number;
      pakai_tax: boolean;
      tax_percent: number;
      total: number;
      status_bayar: string;
      nama_pembeli: string | null;
      clients: { company_brand: string } | null;
    }[];

    const totalNilai = rows.reduce((s, r) => s + Number(r.total), 0);
    const totalLunas = rows
      .filter((r) => r.status_bayar === "Lunas")
      .reduce((s, r) => s + Number(r.total), 0);

    // Rekap per client
    const perClient = new Map<string, { count: number; total: number }>();
    for (const r of rows) {
      const nama = r.clients?.company_brand || r.nama_pembeli || "Walk-in";
      const e = perClient.get(nama) || { count: 0, total: 0 };
      e.count += 1;
      e.total += Number(r.total);
      perClient.set(nama, e);
    }
    const clientRekap = Array.from(perClient, ([nama, v]) => ({ nama, ...v })).sort(
      (a, b) => b.total - a.total
    );

    content = (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Jumlah Dokumen", value: String(rows.length) },
            { label: "Total Penjualan", value: formatRupiah(totalNilai) },
            { label: "Sudah Dibayar", value: formatRupiah(totalLunas) },
            { label: "Piutang", value: formatRupiah(totalNilai - totalLunas) },
          ].map((c) => (
            <div key={c.label} className="glass rounded-xl p-3.5">
              <div className="text-[10.5px] uppercase tracking-wide text-muted">
                {c.label}
              </div>
              <div className="font-display text-[17px] font-semibold text-ink mt-1">
                {c.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-5">
          <DataTable
            rows={rows}
            rowKey={(_r, i) => String(i)}
            minWidth={860}
            empty="Tidak ada penjualan pada periode ini."
            footer={{
              row: (
                <tr className="border-t-2 border-line font-semibold">
                  <td className={`${td} sticky-col`} colSpan={8}>
                    TOTAL ({rows.length} dokumen)
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    {formatRupiah(totalNilai)}
                  </td>
                  <td className={td}></td>
                </tr>
              ),
              card: (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] text-muted">
                    TOTAL ({rows.length} dokumen)
                  </span>
                  <span className="font-semibold">{formatRupiah(totalNilai)}</span>
                </div>
              ),
            }}
            columns={[
              {
                key: "no",
                header: "No.",
                role: "subtitle",
                className: "font-mono text-[11.5px] whitespace-nowrap",
                cell: (r) => r.no_invoice,
              },
              {
                key: "tanggal",
                header: "Tanggal",
                role: "primary",
                className: "whitespace-nowrap",
                cell: (r) => formatTanggal(r.tanggal),
              },
              {
                key: "client",
                header: "Client",
                role: "title",
                cell: (r) => (
                  <div className="max-w-[160px] truncate">
                    {r.clients?.company_brand || r.nama_pembeli || "Walk-in"}
                  </div>
                ),
                cardCell: (r) =>
                  r.clients?.company_brand || r.nama_pembeli || "Walk-in",
              },
              {
                key: "sumber",
                header: "Sumber",
                role: "secondary",
                cell: (r) => r.sumber,
              },
              {
                key: "tipe",
                header: "Tipe",
                role: "secondary",
                cell: (r) => r.tipe,
              },
              {
                key: "subtotal",
                header: "Subtotal",
                role: "secondary",
                align: "right",
                className: "whitespace-nowrap",
                cell: (r) => formatRupiah(Number(r.subtotal)),
              },
              {
                key: "disc",
                header: "Disc",
                role: "secondary",
                align: "right",
                cell: (r) =>
                  Number(r.diskon_percent) > 0
                    ? `${Number(r.diskon_percent)}%`
                    : "-",
              },
              {
                key: "tax",
                header: "Tax",
                role: "secondary",
                align: "right",
                cell: (r) => (r.pakai_tax ? `${Number(r.tax_percent)}%` : "-"),
              },
              {
                key: "total",
                header: "Total",
                role: "primary",
                align: "right",
                className: "whitespace-nowrap font-medium",
                cell: (r) => formatRupiah(Number(r.total)),
              },
              {
                key: "bayar",
                header: "Bayar",
                role: "badge",
                cell: (r) => r.status_bayar,
                cardCell: (r) => (
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                      r.status_bayar === "Lunas"
                        ? "bg-botanical-100 text-botanical-700"
                        : "bg-amber-100 text-amber-500"
                    }`}
                  >
                    {r.status_bayar}
                  </span>
                ),
              },
            ]}
          />
        </div>

        {clientRekap.length > 0 && (
          <div className="glass rounded-2xl overflow-x-auto max-w-xl">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className={thead}>
                  <th className={th}>Recap by Client</th>
                  <th className={`${th} text-right`}>Dokumen</th>
                  <th className={`${th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {clientRekap.map((c) => (
                  <tr key={c.nama} className="border-b border-line last:border-0">
                    <td className={td}>{c.nama}</td>
                    <td className={`${td} text-right`}>{c.count}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      {formatRupiah(c.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  if (type === "purchasing") {
    const { data } = await supabase
      .from("receivings")
      .select(
        "tanggal_terima, no_invoice, supplier_nama, total_invoice, top_days, status_bayar, purchase_orders(no_po)"
      )
      .eq("organization_id", organizationId)
      .gte("tanggal_terima", from)
      .lte("tanggal_terima", to)
      .order("tanggal_terima");

    const rows = (data || []) as unknown as {
      tanggal_terima: string;
      no_invoice: string | null;
      supplier_nama: string | null;
      total_invoice: number;
      top_days: number | null;
      status_bayar: string;
      purchase_orders: { no_po: string | null } | null;
    }[];

    const total = rows.reduce((s, r) => s + Number(r.total_invoice), 0);
    const totalLunas = rows
      .filter((r) => r.status_bayar === "Lunas")
      .reduce((s, r) => s + Number(r.total_invoice), 0);

    const perSupplier = new Map<string, number>();
    for (const r of rows) {
      const nama = r.supplier_nama || "-";
      perSupplier.set(nama, (perSupplier.get(nama) || 0) + Number(r.total_invoice));
    }
    const supplierRekap = Array.from(perSupplier, ([nama, t]) => ({ nama, t })).sort(
      (a, b) => b.t - a.t
    );

    content = (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Jumlah Faktur", value: String(rows.length) },
            { label: "Total Pembelian", value: formatRupiah(total) },
            { label: "Sudah Dibayar", value: formatRupiah(totalLunas) },
            { label: "Hutang", value: formatRupiah(total - totalLunas) },
          ].map((c) => (
            <div key={c.label} className="glass rounded-xl p-3.5">
              <div className="text-[10.5px] uppercase tracking-wide text-muted">
                {c.label}
              </div>
              <div className="font-display text-[17px] font-semibold text-ink mt-1">
                {c.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-5">
          <DataTable
            rows={rows}
            rowKey={(_r, i) => String(i)}
            minWidth={760}
            empty="Tidak ada pembelian pada periode ini."
            footer={{
              row: (
                <tr className="border-t-2 border-line font-semibold">
                  <td className={`${td} sticky-col`} colSpan={5}>
                    TOTAL ({rows.length} faktur)
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    {formatRupiah(total)}
                  </td>
                  <td className={td}></td>
                </tr>
              ),
              card: (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] text-muted">
                    TOTAL ({rows.length} faktur)
                  </span>
                  <span className="font-semibold">{formatRupiah(total)}</span>
                </div>
              ),
            }}
            columns={[
              {
                key: "tanggal",
                header: "Tanggal",
                role: "subtitle",
                className: "whitespace-nowrap",
                cell: (r) => formatTanggal(r.tanggal_terima),
              },
              {
                key: "faktur",
                header: "No. Faktur",
                role: "primary",
                className: "font-mono text-[11.5px]",
                cell: (r) => r.no_invoice || "-",
              },
              {
                key: "supplier",
                header: "Supplier",
                role: "title",
                cell: (r) => (
                  <div className="max-w-[180px] truncate">
                    {r.supplier_nama || "-"}
                  </div>
                ),
                cardCell: (r) => r.supplier_nama || "-",
              },
              {
                key: "po",
                header: "PO",
                cardLabel: "No. PO",
                role: "secondary",
                className: "font-mono text-[11.5px] whitespace-nowrap",
                cell: (r) => r.purchase_orders?.no_po || "-",
              },
              {
                key: "top",
                header: "TOP",
                cardLabel: "Termin (TOP)",
                role: "secondary",
                cell: (r) =>
                  r.top_days == null
                    ? "-"
                    : r.top_days === 0
                      ? "Tunai"
                      : `${r.top_days} hr`,
              },
              {
                key: "total",
                header: "Total",
                role: "primary",
                align: "right",
                className: "whitespace-nowrap font-medium",
                cell: (r) => formatRupiah(Number(r.total_invoice)),
              },
              {
                key: "bayar",
                header: "Bayar",
                role: "badge",
                cell: (r) => r.status_bayar,
                cardCell: (r) => (
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                      r.status_bayar === "Lunas"
                        ? "bg-botanical-100 text-botanical-700"
                        : "bg-amber-100 text-amber-500"
                    }`}
                  >
                    {r.status_bayar}
                  </span>
                ),
              },
            ]}
          />
        </div>

        {supplierRekap.length > 0 && (
          <div className="glass rounded-2xl overflow-x-auto max-w-xl">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className={thead}>
                  <th className={th}>Recap by Supplier</th>
                  <th className={`${th} text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {supplierRekap.map((s) => (
                  <tr key={s.nama} className="border-b border-line last:border-0">
                    <td className={td}>{s.nama}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      {formatRupiah(s.t)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  if (type === "production") {
    const [{ data: batches }, { data: plans }] = await Promise.all([
      supabase
        .from("production_batches")
        .select(
          "id, no_batch_produksi, tanggal_produksi, total_cost_bahan, production_outputs(qty_hasil, satuan, varian_ukuran, products(nama_produk))"
        )
        .eq("organization_id", organizationId)
        .gte("tanggal_produksi", from)
        .lte("tanggal_produksi", to)
        .order("tanggal_produksi"),
      supabase
        .from("production_plans")
        .select("production_batch_id, execution_data")
        .eq("organization_id", organizationId)
        .eq("status", "Selesai"),
    ]);

    const planByBatch = new Map(
      ((plans || []) as { production_batch_id: string | null; execution_data: ExecutionData | null }[])
        .filter((p) => p.production_batch_id)
        .map((p) => [p.production_batch_id as string, p.execution_data])
    );

    const rows = ((batches || []) as unknown as {
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
    }[]).map((b) => {
      const totalPcs = b.production_outputs.reduce(
        (s, o) => s + Number(o.qty_hasil),
        0
      );
      const exec = planByBatch.get(b.id);
      const teoritis = (exec?.variants || []).reduce(
        (s, v) => s + Number(v.rencana_pcs || 0),
        0
      );
      return {
        ...b,
        totalPcs,
        hpp: totalPcs > 0 ? Number(b.total_cost_bahan) / totalPcs : 0,
        yieldPct: teoritis > 0 ? (totalPcs / teoritis) * 100 : null,
      };
    });

    const totalCost = rows.reduce((s, r) => s + Number(r.total_cost_bahan), 0);
    const totalPcsAll = rows.reduce((s, r) => s + r.totalPcs, 0);

    content = (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Jumlah Batch", value: String(rows.length) },
            { label: "Total Output", value: `${formatQty(totalPcsAll)} pcs` },
            { label: "Total Cost Bahan", value: formatRupiah(totalCost) },
            {
              label: "Rata-rata HPP/pcs",
              value:
                totalPcsAll > 0 ? formatRupiah(totalCost / totalPcsAll) : "-",
            },
          ].map((c) => (
            <div key={c.label} className="glass rounded-xl p-3.5">
              <div className="text-[10.5px] uppercase tracking-wide text-muted">
                {c.label}
              </div>
              <div className="font-display text-[17px] font-semibold text-ink mt-1">
                {c.value}
              </div>
            </div>
          ))}
        </div>

        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          minWidth={820}
          empty="Tidak ada produksi pada periode ini."
          footer={{
            row: (
              <tr className="border-t-2 border-line font-semibold">
                <td className={`${td} sticky-col`} colSpan={4}>
                  TOTAL ({rows.length} batch · {formatQty(totalPcsAll)} pcs)
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  {formatRupiah(totalCost)}
                </td>
                <td className={td} colSpan={2}></td>
              </tr>
            ),
            card: (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] text-muted">
                  TOTAL ({rows.length} batch · {formatQty(totalPcsAll)} pcs)
                </span>
                <span className="font-semibold">{formatRupiah(totalCost)}</span>
              </div>
            ),
          }}
          columns={[
            {
              key: "batch",
              header: "No. Batch",
              role: "subtitle",
              className: "font-mono text-[11.5px] whitespace-nowrap",
              cell: (r) => r.no_batch_produksi,
            },
            {
              key: "tanggal",
              header: "Tanggal",
              role: "secondary",
              className: "whitespace-nowrap",
              cell: (r) => formatTanggal(r.tanggal_produksi),
            },
            {
              key: "produk",
              header: "Produk",
              role: "title",
              cell: (r) => (
                <div className="max-w-[180px] truncate">
                  {r.production_outputs[0]?.products?.nama_produk || "-"}
                </div>
              ),
              cardCell: (r) =>
                r.production_outputs[0]?.products?.nama_produk || "-",
            },
            {
              key: "output",
              header: "Output",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap text-[11.5px]",
              cell: (r) =>
                r.production_outputs
                  .map(
                    (o) =>
                      `${o.varian_ukuran ? o.varian_ukuran + ": " : ""}${formatQty(Number(o.qty_hasil))}`
                  )
                  .join(" · "),
            },
            {
              key: "cost",
              header: "Cost Bahan",
              role: "secondary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) => formatRupiah(Number(r.total_cost_bahan)),
            },
            {
              key: "hpp",
              header: "HPP/pcs",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap font-medium",
              cell: (r) => (r.totalPcs > 0 ? formatRupiah(r.hpp) : "-"),
            },
            {
              key: "yield",
              header: "Yield",
              role: "badge",
              align: "right",
              className: "whitespace-nowrap font-medium",
              cell: (r) => (
                <span
                  className={
                    r.yieldPct == null
                      ? "text-muted"
                      : r.yieldPct >= 95
                        ? "text-botanical-700"
                        : "text-clay-600"
                  }
                >
                  {r.yieldPct == null
                    ? "-"
                    : `${r.yieldPct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}
                </span>
              ),
              cardCell: (r) => (
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                    r.yieldPct == null
                      ? "bg-white/70 text-muted"
                      : r.yieldPct >= 95
                        ? "bg-botanical-100 text-botanical-700"
                        : "bg-clay-100 text-clay-600"
                  }`}
                >
                  yield{" "}
                  {r.yieldPct == null
                    ? "-"
                    : `${r.yieldPct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}
                </span>
              ),
            },
          ]}
        />
      </>
    );
  }

  if (type === "stock") {
    const [
      { data: items },
      { data: masukRows },
      { data: pakaiRows },
      { data: musnahRows },
      { data: adjRows },
      { data: issueRows },
      { data: returRows },
      { data: fgAdjRows },
    ] = await Promise.all([
        supabase
          .from("items")
          .select("id, kode, nama, satuan, purchase_batches(qty_sisa)")
          .eq("organization_id", organizationId)
          .order("kode"),
        supabase
          .from("purchase_batches")
          .select("item_id, qty_masuk")
          .eq("organization_id", organizationId)
          .gte("tanggal_terima", from)
          .lte("tanggal_terima", to),
        supabase
          .from("production_components")
          .select("item_id, qty_terpakai, production_batches!inner(tanggal_produksi)")
          .eq("organization_id", organizationId)
          .gte("production_batches.tanggal_produksi", from)
          .lte("production_batches.tanggal_produksi", to),
        supabase
          .from("batch_dispositions")
          .select("item_id, qty, created_at")
          .eq("organization_id", organizationId)
          .eq("tipe", "Musnah")
          .gte("created_at", from)
          .lte("created_at", to + "T23:59:59"),
        supabase
          .from("stock_adjustment_items")
          .select("item_id, qty_sebelum, qty_sesudah, stock_adjustments!inner(tanggal)")
          .eq("organization_id", organizationId)
          .gte("stock_adjustments.tanggal", from)
          .lte("stock_adjustments.tanggal", to),
        supabase
          .from("material_issue_items")
          .select("item_id, qty, material_issues!inner(tanggal)")
          .eq("organization_id", organizationId)
          .gte("material_issues.tanggal", from)
          .lte("material_issues.tanggal", to),
        // Retur ke supplier. Yang dihitung qty_dari_karantina + qty_dari_sisa,
        // BUKAN qty: baris untuk lot yang sudah ditolak QC nilainya nol di
        // dua kolom itu karena stoknya sudah keluar lewat pemusnahan QC.
        // Memakai qty akan menghitung barang yang sama dua kali.
        supabase
          .from("purchase_return_items")
          .select(
            "item_id, qty_dari_karantina, qty_dari_sisa, purchase_returns!inner(tanggal)"
          )
          .eq("organization_id", organizationId)
          .gte("purchase_returns.tanggal", from)
          .lte("purchase_returns.tanggal", to),
        // Koreksi stok produk jadi dari opname. Tabel ini tidak menyentuh
        // purchase_batches sama sekali, jadi tidak bisa digabung ke baris
        // item di atas dan tampil sebagai bagian tersendiri. Kalau tidak
        // ditampilkan di sini, ada penyesuaian stok yang tidak muncul di
        // laporan mana pun.
        supabase
          .from("finished_goods_adjustments")
          .select(
            "id, tanggal, varian, qty_delta, alasan, products(kode, nama_produk), stock_opnames(no_opname)"
          )
          .eq("organization_id", organizationId)
          .gte("tanggal", from)
          .lte("tanggal", to)
          .order("tanggal", { ascending: false }),
      ]);

    const masuk = new Map<string, number>();
    for (const r of (masukRows || []) as { item_id: string; qty_masuk: number }[]) {
      masuk.set(r.item_id, (masuk.get(r.item_id) || 0) + Number(r.qty_masuk));
    }
    const keluar = new Map<string, number>();
    for (const r of (pakaiRows || []) as unknown as {
      item_id: string;
      qty_terpakai: number;
    }[]) {
      keluar.set(r.item_id, (keluar.get(r.item_id) || 0) + Number(r.qty_terpakai));
    }
    for (const r of (musnahRows || []) as { item_id: string; qty: number | null }[]) {
      keluar.set(r.item_id, (keluar.get(r.item_id) || 0) + Number(r.qty || 0));
    }
    // Pemakaian di luar produksi (R&D, cleaning, sampel, rusak).
    // Satu dokumen bisa punya beberapa baris per item kalau FEFO
    // menyeberang lot, jadi semuanya dijumlahkan.
    for (const r of (issueRows || []) as unknown as {
      item_id: string;
      qty: number;
    }[]) {
      keluar.set(r.item_id, (keluar.get(r.item_id) || 0) + Number(r.qty));
    }
    for (const r of (returRows || []) as unknown as {
      item_id: string;
      qty_dari_karantina: number;
      qty_dari_sisa: number;
    }[]) {
      const qty = Number(r.qty_dari_karantina) + Number(r.qty_dari_sisa);
      if (qty > 0) keluar.set(r.item_id, (keluar.get(r.item_id) || 0) + qty);
    }
    // Adjustment turun = keluar (adjustment naik sudah tercatat sebagai batch masuk)
    for (const r of (adjRows || []) as unknown as {
      item_id: string;
      qty_sebelum: number;
      qty_sesudah: number;
    }[]) {
      const diff = Number(r.qty_sebelum) - Number(r.qty_sesudah);
      if (diff > 0) keluar.set(r.item_id, (keluar.get(r.item_id) || 0) + diff);
    }

    const rows = ((items || []) as unknown as {
      id: string;
      kode: string;
      nama: string;
      satuan: string;
      purchase_batches: { qty_sisa: number }[];
    }[]).map((it) => {
      const akhir = it.purchase_batches.reduce((s, b) => s + Number(b.qty_sisa), 0);
      const m = masuk.get(it.id) || 0;
      const k = keluar.get(it.id) || 0;
      return { ...it, akhir, masuk: m, keluar: k, awal: akhir - m + k };
    });

    const adaMutasi = rows.filter((r) => r.masuk > 0 || r.keluar > 0);

    const koreksiFg = ((fgAdjRows || []) as unknown as {
      id: string;
      tanggal: string;
      varian: string | null;
      qty_delta: number;
      alasan: string | null;
      products: { kode: string | null; nama_produk: string } | null;
      stock_opnames: { no_opname: string } | null;
    }[]).map((r) => ({
      id: r.id,
      tanggal: r.tanggal,
      kode: r.products?.kode || "-",
      nama: r.products?.nama_produk || "(produk terhapus)",
      varian: r.varian || "-",
      qty_delta: Number(r.qty_delta),
      sumber: r.stock_opnames?.no_opname || r.alasan || "Koreksi manual",
    }));

    content = (
      <>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          minWidth={780}
          empty="Belum ada item."
          rowClassName={(r) => (r.masuk > 0 || r.keluar > 0 ? "" : "text-muted")}
          columns={[
            {
              key: "kode",
              header: "Kode",
              role: "subtitle",
              className: "font-mono text-[11.5px] whitespace-nowrap",
              cell: (r) => r.kode,
            },
            {
              key: "nama",
              header: "Item",
              role: "title",
              cell: (r) => <div className="max-w-[220px] truncate">{r.nama}</div>,
              cardCell: (r) => r.nama,
            },
            {
              key: "awal",
              header: "Saldo Awal",
              role: "secondary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) => `${formatQty(r.awal)} ${r.satuan}`,
            },
            {
              key: "masuk",
              header: "Masuk",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) => (
                <span
                  className={r.masuk > 0 ? "text-botanical-700 font-medium" : ""}
                >
                  {r.masuk > 0 ? `+${formatQty(r.masuk)}` : "-"}
                </span>
              ),
            },
            {
              key: "keluar",
              header: "Keluar",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) => (
                <span className={r.keluar > 0 ? "text-clay-600 font-medium" : ""}>
                  {r.keluar > 0 ? `−${formatQty(r.keluar)}` : "-"}
                </span>
              ),
            },
            {
              key: "akhir",
              header: "Saldo Akhir",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap font-semibold",
              cell: (r) => `${formatQty(r.akhir)} ${r.satuan}`,
            },
          ]}
        />
        <p className="text-[11.5px] text-muted px-1 pt-2">
          {adaMutasi.length} dari {rows.length} item bergerak pada periode ini.
          Masuk = receiving + adjustment naik; Keluar = produksi + pemakaian di
          luar produksi + retur ke supplier + pemusnahan + adjustment turun.
        </p>

        {koreksiFg.length > 0 && (
          <div className="mt-7">
            <h3 className="font-display text-[15px] font-semibold text-ink mb-1">
              Koreksi Stok Produk Jadi
            </h3>
            <p className="text-[11.5px] text-muted mb-3">
              Stok produk jadi tidak disimpan sebagai batch, jadi selisih
              opname-nya dicatat terpisah dari tabel di atas.
            </p>
            <DataTable
              rows={koreksiFg}
              rowKey={(r) => r.id}
              minWidth={720}
              empty="Belum ada koreksi produk jadi pada periode ini."
              columns={[
                {
                  key: "tanggal",
                  header: "Tanggal",
                  role: "subtitle",
                  className: "whitespace-nowrap",
                  cell: (r) => formatTanggal(r.tanggal),
                },
                {
                  key: "produk",
                  header: "Produk",
                  role: "title",
                  cell: (r) => (
                    <>
                      <div className="max-w-[220px] truncate">{r.nama}</div>
                      <div className="text-[11px] text-muted font-mono">
                        {r.kode}
                      </div>
                    </>
                  ),
                  cardCell: (r) => (
                    <>
                      <div>{r.nama}</div>
                      <div className="text-[11px] text-muted font-mono font-normal">
                        {r.kode}
                      </div>
                    </>
                  ),
                },
                {
                  key: "varian",
                  header: "Varian",
                  role: "badge",
                  className: "whitespace-nowrap",
                  cell: (r) => r.varian,
                },
                {
                  key: "selisih",
                  header: "Koreksi",
                  role: "primary",
                  align: "right",
                  className: "whitespace-nowrap",
                  cell: (r) => (
                    <span
                      className={`font-medium ${
                        r.qty_delta > 0 ? "text-botanical-700" : "text-clay-600"
                      }`}
                    >
                      {r.qty_delta > 0 ? "+" : "−"}
                      {formatQty(Math.abs(r.qty_delta))}
                    </span>
                  ),
                },
                {
                  key: "sumber",
                  header: "Sumber",
                  role: "secondary",
                  cell: (r) => (
                    <div className="max-w-[260px] truncate">{r.sumber}</div>
                  ),
                  cardCell: (r) => r.sumber,
                },
              ]}
            />
          </div>
        )}
      </>
    );
  }

  if (type === "consignment") {
    const { data } = await supabase
      .from("consignments")
      .select(
        "no_konsinyasi, tanggal_kirim, status, clients(company_brand), consignment_items(qty_kirim, qty_terjual, qty_retur, harga_jual, varian_ukuran, products(nama_produk))"
      )
      .eq("organization_id", organizationId)
      .gte("tanggal_kirim", from)
      .lte("tanggal_kirim", to)
      .order("tanggal_kirim");

    type CItem = {
      qty_kirim: number;
      qty_terjual: number;
      qty_retur: number;
      harga_jual: number;
      varian_ukuran: string | null;
      products: { nama_produk: string } | null;
    };
    const rows = ((data || []) as unknown as {
      no_konsinyasi: string | null;
      tanggal_kirim: string;
      status: string;
      clients: { company_brand: string } | null;
      consignment_items: CItem[];
    }[]).map((c) => {
      const kirim = c.consignment_items.reduce((s, i) => s + Number(i.qty_kirim), 0);
      const terjual = c.consignment_items.reduce((s, i) => s + Number(i.qty_terjual), 0);
      const retur = c.consignment_items.reduce((s, i) => s + Number(i.qty_retur), 0);
      const nilai = c.consignment_items.reduce(
        (s, i) => s + Number(i.qty_terjual) * Number(i.harga_jual),
        0
      );
      return { ...c, kirim, terjual, retur, sisa: kirim - terjual - retur, nilai };
    });

    const tKirim = rows.reduce((s, r) => s + r.kirim, 0);
    const tJual = rows.reduce((s, r) => s + r.terjual, 0);
    const tRetur = rows.reduce((s, r) => s + r.retur, 0);
    const tNilai = rows.reduce((s, r) => s + r.nilai, 0);

    const perOutlet = new Map<string, { kirim: number; jual: number; sisa: number; nilai: number }>();
    for (const r of rows) {
      const nama = r.clients?.company_brand || "-";
      const e = perOutlet.get(nama) || { kirim: 0, jual: 0, sisa: 0, nilai: 0 };
      e.kirim += r.kirim;
      e.jual += r.terjual;
      e.sisa += r.sisa;
      e.nilai += r.nilai;
      perOutlet.set(nama, e);
    }
    const outletRekap = Array.from(perOutlet, ([nama, v]) => ({ nama, ...v })).sort(
      (a, b) => b.nilai - a.nilai
    );

    content = (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Total Terkirim", value: `${formatQty(tKirim)} pcs` },
            { label: "Total Terjual", value: `${formatQty(tJual)} pcs` },
            { label: "Nilai Laku", value: formatRupiah(tNilai) },
            { label: "Sisa di Outlet", value: `${formatQty(tKirim - tJual - tRetur)} pcs` },
          ].map((c) => (
            <div key={c.label} className="glass rounded-xl p-3.5">
              <div className="text-[10.5px] uppercase tracking-wide text-muted">
                {c.label}
              </div>
              <div className="font-display text-[17px] font-semibold text-ink mt-1">
                {c.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-5">
          <DataTable
            rows={rows}
            rowKey={(_r, i) => String(i)}
            minWidth={820}
            empty="Tidak ada konsinyasi pada periode ini."
            footer={{
              row: (
                <tr className="border-t-2 border-line font-semibold">
                  <td className={`${td} sticky-col`} colSpan={3}>
                    TOTAL ({rows.length} pengiriman)
                  </td>
                  <td className={`${td} text-right`}>{formatQty(tKirim)}</td>
                  <td className={`${td} text-right`}>{formatQty(tJual)}</td>
                  <td className={`${td} text-right`}>{formatQty(tRetur)}</td>
                  <td className={`${td} text-right`}>
                    {formatQty(tKirim - tJual - tRetur)}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    {formatRupiah(tNilai)}
                  </td>
                  <td className={td}></td>
                </tr>
              ),
              card: (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] text-muted">
                    TOTAL ({rows.length} pengiriman · laku {formatQty(tJual)})
                  </span>
                  <span className="font-semibold">{formatRupiah(tNilai)}</span>
                </div>
              ),
            }}
            columns={[
              {
                key: "no",
                header: "No.",
                role: "subtitle",
                className: "font-mono text-[11.5px] whitespace-nowrap",
                cell: (r) => r.no_konsinyasi,
              },
              {
                key: "tanggal",
                header: "Tanggal",
                role: "secondary",
                className: "whitespace-nowrap",
                cell: (r) => formatTanggal(r.tanggal_kirim),
              },
              {
                key: "outlet",
                header: "Outlet",
                role: "title",
                cell: (r) => (
                  <div className="max-w-[160px] truncate">
                    {r.clients?.company_brand || "-"}
                  </div>
                ),
                cardCell: (r) => r.clients?.company_brand || "-",
              },
              {
                key: "kirim",
                header: "Kirim",
                role: "secondary",
                align: "right",
                cell: (r) => formatQty(r.kirim),
              },
              {
                key: "laku",
                header: "Laku",
                role: "primary",
                align: "right",
                className: "text-botanical-700 font-medium",
                cell: (r) => (
                  <span className="text-botanical-700 font-medium">
                    {formatQty(r.terjual)}
                  </span>
                ),
              },
              {
                key: "retur",
                header: "Retur",
                role: "secondary",
                align: "right",
                cell: (r) => formatQty(r.retur),
              },
              {
                key: "sisa",
                header: "Sisa",
                role: "primary",
                align: "right",
                cell: (r) => formatQty(r.sisa),
              },
              {
                key: "nilai",
                header: "Nilai Laku",
                role: "primary",
                align: "right",
                className: "whitespace-nowrap font-medium",
                cell: (r) => formatRupiah(r.nilai),
              },
              {
                key: "status",
                header: "Status",
                role: "badge",
                cell: (r) => r.status,
                cardCell: (r) => (
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                      r.status === "Aktif"
                        ? "bg-amber-100 text-amber-500"
                        : "bg-botanical-100 text-botanical-700"
                    }`}
                  >
                    {r.status}
                  </span>
                ),
              },
            ]}
          />
        </div>

        {outletRekap.length > 0 && (
          <div className="glass rounded-2xl overflow-x-auto max-w-4xl">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className={thead}>
                  <th className={th}>Recap by Outlet</th>
                  <th className={`${th} text-right`}>Kirim</th>
                  <th className={`${th} text-right`}>Laku</th>
                  <th className={`${th} text-right`}>Sisa</th>
                  <th className={`${th} text-right`}>Nilai Laku</th>
                </tr>
              </thead>
              <tbody>
                {outletRekap.map((o) => (
                  <tr key={o.nama} className="border-b border-line last:border-0">
                    <td className={td}>{o.nama}</td>
                    <td className={`${td} text-right`}>{formatQty(o.kirim)}</td>
                    <td className={`${td} text-right`}>{formatQty(o.jual)}</td>
                    <td className={`${td} text-right`}>{formatQty(o.sisa)}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      {formatRupiah(o.nilai)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  if (type === "margin") {
    const m = await getMarginReport(organizationId!, from, to);

    const persen = (n: number | null) =>
      n == null
        ? "-"
        : `${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

    content = (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Omzet", value: formatRupiah(m.totalOmzet) },
            { label: "HPP Terjual", value: formatRupiah(m.totalHpp) },
            { label: "Margin Kotor", value: formatRupiah(m.totalMargin) },
            { label: "Margin %", value: persen(m.marginPct) },
          ].map((c) => (
            <div key={c.label} className="glass rounded-xl p-3.5">
              <div className="text-[10.5px] uppercase tracking-wide text-muted">
                {c.label}
              </div>
              <div className="font-display text-[17px] font-semibold text-ink mt-1">
                {c.value}
              </div>
            </div>
          ))}
        </div>

        {m.tanpaHpp > 0 && (
          <div className="bg-amber-100 text-amber-500 rounded-lg px-3 py-2.5 text-[12px] leading-relaxed mb-4">
            ⚠ {m.tanpaHpp} baris senilai {formatRupiah(m.omzetTanpaHpp)} belum
            punya HPP karena produknya belum pernah diproduksi lewat modul
            Produksi (mis. stok awal dari adjustment). Baris itu tidak ikut
            dihitung di kartu Margin di atas.
          </div>
        )}

        <DataTable
          rows={m.rows}
          rowKey={(r) => r.key}
          minWidth={900}
          empty="Tidak ada penjualan produk pada periode ini."
          footer={{
            row: (
              <tr className="border-t-2 border-line font-semibold">
                <td className={`${td} sticky-col`} colSpan={3}>
                  TOTAL ({m.rows.length} produk-varian)
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  {formatRupiah(m.totalOmzet)}
                </td>
                <td className={td}></td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  {formatRupiah(m.totalHpp)}
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  {formatRupiah(m.totalMargin)}
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  {persen(m.marginPct)}
                </td>
              </tr>
            ),
            card: (
              <div className="flex flex-col gap-1 text-[13px]">
                <div className="flex justify-between text-muted">
                  <span>Omzet</span>
                  <span>{formatRupiah(m.totalOmzet)}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>HPP</span>
                  <span>{formatRupiah(m.totalHpp)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Margin ({persen(m.marginPct)})</span>
                  <span>{formatRupiah(m.totalMargin)}</span>
                </div>
              </div>
            ),
          }}
          columns={[
            {
              key: "produk",
              header: "Produk",
              role: "title",
              cell: (r) => (
                <>
                  <div className="max-w-[220px] truncate">{r.nama_produk}</div>
                  <div className="text-[11px] text-muted font-mono">{r.kode}</div>
                </>
              ),
              cardCell: (r) => (
                <>
                  <div>{r.nama_produk}</div>
                  <div className="text-[11px] text-muted font-mono font-normal">
                    {r.kode}
                  </div>
                </>
              ),
            },
            {
              key: "varian",
              header: "Varian",
              role: "subtitle",
              className: "whitespace-nowrap",
              cell: (r) => r.varian,
            },
            {
              key: "qty",
              header: "Terjual",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) => formatQty(r.qtyTerjual),
            },
            {
              key: "omzet",
              header: "Omzet",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) => formatRupiah(r.omzet),
            },
            {
              key: "hpp",
              header: "HPP/pcs",
              role: "secondary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) =>
                r.hppPerPcs == null ? (
                  <span className="text-muted">belum ada</span>
                ) : (
                  formatRupiah(r.hppPerPcs)
                ),
            },
            {
              key: "totalHpp",
              header: "HPP Terjual",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) =>
                r.totalHpp == null ? (
                  <span className="text-muted">-</span>
                ) : (
                  formatRupiah(r.totalHpp)
                ),
            },
            {
              key: "margin",
              header: "Margin",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap font-medium",
              cell: (r) =>
                r.margin == null ? (
                  <span className="text-muted">-</span>
                ) : (
                  <span
                    className={
                      r.margin >= 0 ? "text-botanical-700" : "text-clay-600"
                    }
                  >
                    {formatRupiah(r.margin)}
                  </span>
                ),
            },
            {
              key: "pct",
              header: "Margin %",
              role: "badge",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) =>
                r.marginPct == null ? (
                  <span className="text-muted">-</span>
                ) : (
                  <span
                    className={
                      r.marginPct >= 0
                        ? "text-botanical-700 font-medium"
                        : "text-clay-600 font-medium"
                    }
                  >
                    {persen(r.marginPct)}
                  </span>
                ),
              cardCell: (r) => (
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                    r.marginPct == null
                      ? "bg-white/70 text-muted"
                      : r.marginPct >= 0
                        ? "bg-botanical-100 text-botanical-700"
                        : "bg-clay-100 text-clay-600"
                  }`}
                >
                  margin {persen(r.marginPct)}
                </span>
              ),
            },
          ]}
        />
        <p className="text-[11.5px] text-muted px-1 pt-2 leading-relaxed">
          HPP diambil dari biaya bahan batch produksi yang sebenarnya, dihitung
          dari SELURUH riwayat produksi (bukan hanya periode ini) supaya produk
          yang terjual dari stok lama tetap punya harga pokok. Biaya batch yang
          menghasilkan beberapa ukuran dibagi menurut netto tiap varian. Batch
          yang ditolak QA tidak ikut. Omzet memakai subtotal baris, jadi belum
          dipotong diskon dan pajak tingkat invoice.
        </p>
      </>
    );
  }

  if (type === "finance") {
    const [{ data: piutangInv }, { data: pays }, { data: hutangRcv }] = await Promise.all([
      supabase
        .from("sales_invoices")
        .select("id, no_invoice, tanggal, jatuh_tempo, total, nama_pembeli, clients(company_brand)")
        .eq("organization_id", organizationId)
        .eq("status_bayar", "Belum Lunas")
        .order("jatuh_tempo", { nullsFirst: false }),
      supabase
        .from("sales_payments")
        .select("invoice_id, jumlah")
        .eq("organization_id", organizationId),
      supabase
        .from("receivings")
        .select("no_invoice, tanggal_terima, jatuh_tempo, total_invoice, supplier_nama")
        .eq("organization_id", organizationId)
        .eq("status_bayar", "Belum Lunas")
        .order("jatuh_tempo", { nullsFirst: false }),
    ]);

    const paidBy = new Map<string, number>();
    for (const p of (pays || []) as { invoice_id: string; jumlah: number }[]) {
      paidBy.set(p.invoice_id, (paidBy.get(p.invoice_id) || 0) + Number(p.jumlah));
    }

    const piutang = ((piutangInv || []) as unknown as {
      id: string;
      no_invoice: string | null;
      tanggal: string;
      jatuh_tempo: string | null;
      total: number;
      nama_pembeli: string | null;
      clients: { company_brand: string } | null;
    }[]).map((r) => ({
      no: r.no_invoice,
      pihak: r.clients?.company_brand || r.nama_pembeli || "-",
      tanggal: r.tanggal,
      jatuh_tempo: r.jatuh_tempo,
      sisa: Number(r.total) - (paidBy.get(r.id) || 0),
    }));

    const hutang = ((hutangRcv || []) as unknown as {
      no_invoice: string | null;
      tanggal_terima: string;
      jatuh_tempo: string | null;
      total_invoice: number;
      supplier_nama: string | null;
    }[]).map((r) => ({
      no: r.no_invoice,
      pihak: r.supplier_nama || "-",
      tanggal: r.tanggal_terima,
      jatuh_tempo: r.jatuh_tempo,
      sisa: Number(r.total_invoice),
    }));

    const totalPiutang = piutang.reduce((s, r) => s + r.sisa, 0);
    const totalHutang = hutang.reduce((s, r) => s + r.sisa, 0);
    const overdue = (d: string | null) => d !== null && d < todayStr;
    const jt = (d: string | null) => (d ? formatTanggal(d) : "-");

    const tabel = (
      judul: string,
      data: typeof piutang,
      total: number,
      pihakLabel: string,
      tone: string
    ) => (
      <div>
        <h3 className={`font-display text-[13px] font-semibold mb-2 ${tone}`}>
          {judul}
        </h3>
        <DataTable
          rows={data}
          rowKey={(_r, i) => String(i)}
          minWidth={560}
          empty="Tidak ada tagihan terbuka."
          rowClassName={(r) => (overdue(r.jatuh_tempo) ? "bg-clay-100/30" : "")}
          footer={{
            row: (
              <tr className="border-t-2 border-line font-semibold">
                <td className={`${td} sticky-col`} colSpan={4}>
                  TOTAL ({data.length})
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  {formatRupiah(total)}
                </td>
              </tr>
            ),
            card: (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] text-muted">TOTAL ({data.length})</span>
                <span className="font-semibold">{formatRupiah(total)}</span>
              </div>
            ),
          }}
          columns={[
            {
              key: "no",
              header: "No.",
              role: "subtitle",
              className: "font-mono text-[11.5px] whitespace-nowrap",
              cell: (r) => r.no || "-",
            },
            {
              key: "pihak",
              header: pihakLabel,
              role: "title",
              cell: (r) => <div className="max-w-[180px] truncate">{r.pihak}</div>,
              cardCell: (r) => r.pihak,
            },
            {
              key: "tanggal",
              header: "Tanggal",
              role: "secondary",
              className: "whitespace-nowrap",
              cell: (r) => formatTanggal(r.tanggal),
            },
            {
              key: "tempo",
              header: "Jatuh Tempo",
              role: "primary",
              className: "whitespace-nowrap",
              cell: (r) => (
                <span
                  className={
                    overdue(r.jatuh_tempo) ? "text-clay-600 font-semibold" : ""
                  }
                >
                  {jt(r.jatuh_tempo)}
                  {overdue(r.jatuh_tempo) && (
                    <span className="block text-[10px]">terlambat</span>
                  )}
                </span>
              ),
            },
            {
              key: "sisa",
              header: "Sisa",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap font-medium",
              cell: (r) => formatRupiah(r.sisa),
            },
          ]}
        />
      </div>
    );

    content = (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {[
            { label: "Receivables (Outstanding)", value: formatRupiah(totalPiutang), tone: "text-botanical-700" },
            { label: "Payables (Outstanding)", value: formatRupiah(totalHutang), tone: "text-clay-600" },
            { label: "Net Position", value: formatRupiah(totalPiutang - totalHutang), tone: "text-ink" },
          ].map((c) => (
            <div key={c.label} className="glass rounded-xl p-3.5">
              <div className="text-[10.5px] uppercase tracking-wide text-muted">
                {c.label}
              </div>
              <div className={`font-display text-[17px] font-semibold mt-1 ${c.tone}`}>
                {c.value}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {tabel("Accounts Receivable", piutang, totalPiutang, "Client", "text-botanical-700")}
          {tabel("Accounts Payable", hutang, totalHutang, "Supplier", "text-clay-600")}
        </div>
      </>
    );
  }

  return (
    <div>
      {/* ===== Kop cetak (muncul hanya saat print) ===== */}
      <div className="hidden print:block mb-4 border-b-2 border-ink pb-3">
        <div className="font-display text-xl font-bold">{org?.nama}</div>
        <div className="text-sm mt-0.5">
          {active.label} · Periode {formatTanggal(from)} s/d {formatTanggal(to)}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap print-hide">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Reports</h1>
          <p className="text-muted text-sm mt-1">
            Laporan operasional per periode, siap cetak dengan kop perusahaan
          </p>
        </div>
        <PrintPageButton />
      </div>

      {/* ===== Tab jenis laporan (satu baris, bisa di-swipe) ===== */}
      <div className="mt-5 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar print-hide">
        <div className="flex gap-2 w-max">
          {TYPES.map((t) => {
            const isActive = t.key === type;
            return (
              <a
                key={t.key}
                href={`/reports?type=${t.key}&from=${from}&to=${to}`}
                className={`inline-flex items-center px-4 py-2 rounded-full text-[13px] font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                  isActive
                    ? "bg-botanical-700 text-white shadow-sm"
                    : "glass text-ink/70 hover:text-ink"
                }`}
              >
                {t.label}
              </a>
            );
          })}
        </div>
      </div>

      {/* ===== Filter periode ===== */}
      <form
        method="get"
        action="/reports"
        className="mt-3 glass rounded-2xl p-4 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-end gap-3 print-hide"
      >
        <input type="hidden" name="type" value={type} />
        <div className="min-w-0 sm:w-44">
          <label className="block text-[11.5px] font-medium text-muted mb-1">
            Dari
          </label>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="w-full h-[42px] glass-input rounded-lg px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
        <div className="min-w-0 sm:w-44">
          <label className="block text-[11.5px] font-medium text-muted mb-1">
            Sampai
          </label>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="w-full h-[42px] glass-input rounded-lg px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
        <button
          type="submit"
          className="col-span-2 sm:col-auto h-[42px] bg-botanical-700 text-white text-[13px] font-medium px-5 rounded-lg hover:bg-botanical-800 transition-colors"
        >
          Terapkan
        </button>
      </form>

      <div className="mt-4 mb-3 print-hide">
        <h2 className="font-display text-lg font-semibold text-ink">
          {active.label}
        </h2>
        <p className="text-muted text-[12.5px]">
          {active.desc} · {formatTanggal(from)} · {formatTanggal(to)}
        </p>
      </div>

      {content}
    </div>
  );
}
