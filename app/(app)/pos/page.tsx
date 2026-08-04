import { Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getSalesOptions } from "@/lib/salesOptions";
import SalesShell from "@/components/SalesShell";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";
import InvoiceForm from "../sales-invoices/InvoiceForm";
import { localDateStr } from "@/lib/dates";

type PosRow = {
  id: string;
  no_invoice: string | null;
  tanggal: string;
  total: number;
  nama_pembeli: string | null;
  clients: { company_brand: string } | null;
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export default async function PosPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();
  const { clients, options } = await getSalesOptions(organizationId!, { includeServices: true });

  const todayStr = localDateStr();
  const { data: todaySales } = await supabase
    .from("sales_invoices")
    .select("id, no_invoice, tanggal, total, nama_pembeli, clients(company_brand)")
    .eq("organization_id", organizationId)
    .eq("sumber", "POS")
    .eq("tanggal", todayStr)
    .order("created_at", { ascending: false });

  const list = (todaySales || []) as unknown as PosRow[];
  const totalHariIni = list.reduce((s, r) => s + Number(r.total), 0);

  return (
    <SalesShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">POS</h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Penjualan cepat walk-in &amp; event, langsung lunas, stok terpotong,
          bisa cetak struk/invoice
        </p>
      </div>

      <div className="mt-4">
        <InvoiceForm clients={clients} options={options} mode="pos" />
      </div>

      {/* ===== Penjualan hari ini ===== */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-[15px] font-semibold text-ink">
            Penjualan Hari Ini
          </h3>
          <span className="text-[13px] font-semibold text-botanical-700">
            {formatRupiah(totalHariIni)}
          </span>
        </div>
        <DataTable
          rows={list}
          rowKey={(r) => r.id}
          minWidth={560}
          empty="Belum ada penjualan hari ini."
          columns={[
            {
              key: "no",
              header: "No.",
              role: "subtitle",
              cell: (r) => (
                <span className="font-mono text-[12px]">{r.no_invoice}</span>
              ),
            },
            {
              key: "pembeli",
              header: "Pembeli",
              role: "title",
              cell: (r) =>
                r.clients?.company_brand || r.nama_pembeli || "Walk-in",
            },
            {
              key: "total",
              header: "Total",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (r) => formatRupiah(Number(r.total)),
            },
            {
              key: "aksi",
              role: "actions",
              align: "right",
              cell: (r) => (
                <RowActions>
                  <IconAction
                    icon={Printer}
                    label="Cetak faktur"
                    href={`/print/invoice/${r.id}`}
                    tone="primary"
                  />
                </RowActions>
              ),
            },
          ]}
        />
      </div>
    </SalesShell>
  );
}
