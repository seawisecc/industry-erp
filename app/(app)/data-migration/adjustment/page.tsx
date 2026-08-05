import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Eye } from "lucide-react";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";

type AdjRow = {
  id: string;
  tanggal: string;
  catatan: string | null;
  created_at: string;
  dibuat_oleh: string | null;
  stock_adjustment_items: { id: string }[];
};

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function StockAdjustmentPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: adjustments }, { data: profiles }] = await Promise.all([
    supabase
      .from("stock_adjustments")
      .select("id, tanggal, catatan, created_at, dibuat_oleh, stock_adjustment_items(id)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, nama")
      .eq("organization_id", organizationId),
  ]);

  const list = (adjustments || []) as unknown as AdjRow[];
  const namaOleh = new Map(
    ((profiles || []) as { id: string; nama: string }[]).map((p) => [p.id, p.nama])
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            Stock Adjustment
          </h1>
          <p className="text-muted text-sm mt-1">
            {list.length} riwayat, untuk stock opname &amp; input stok awal
          </p>
        </div>
        <Link
          href="/data-migration/adjustment/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={16} /> Adjustment Baru
        </Link>
      </div>

      <DataTable
        rows={list}
        rowKey={(a) => a.id}
        minWidth={720}
        empty="Belum ada adjustment."
        columns={[
          {
            key: "tanggal",
            header: "Tanggal",
            role: "subtitle",
            className: "whitespace-nowrap",
            cell: (a) => formatTanggal(a.tanggal),
          },
          {
            key: "catatan",
            header: "Catatan",
            role: "title",
            cell: (a) => (
              <div className="max-w-[300px] truncate">{a.catatan || "-"}</div>
            ),
            cardCell: (a) => a.catatan || "-",
          },
          {
            key: "item",
            header: "Item Disesuaikan",
            role: "primary",
            cell: (a) => `${a.stock_adjustment_items.length} item`,
          },
          {
            key: "oleh",
            header: "Oleh",
            role: "primary",
            cell: (a) => (a.dibuat_oleh && namaOleh.get(a.dibuat_oleh)) || "-",
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            cell: (a) => (
              <RowActions>
                <IconAction
                  icon={Eye}
                  label="Lihat detail adjustment"
                  href={`/data-migration/adjustment/${a.id}`}
                  tone="primary"
                />
              </RowActions>
            ),
          },
        ]}
      />
    </div>
  );
}
