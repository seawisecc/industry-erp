import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DataTable from "@/components/DataTable";

type AdjDetail = {
  id: string;
  tanggal: string;
  catatan: string | null;
  stock_adjustment_items: {
    qty_sebelum: number;
    qty_sesudah: number;
    harga_per_unit: number | null;
    items: { kode: string; nama: string; satuan: string } | null;
  }[];
};

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatId(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export default async function AdjustmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data } = await supabase
    .from("stock_adjustments")
    .select(
      `id, tanggal, catatan,
       stock_adjustment_items(qty_sebelum, qty_sesudah, harga_per_unit, items(kode, nama, satuan))`
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const adj = data as unknown as AdjDetail;

  return (
    <div className="max-w-3xl">
      <Link
        href="/data-migration/adjustment"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Adjustment Stok
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Adjustment {formatTanggal(adj.tanggal)}
      </h1>
      <p className="text-muted text-sm mb-6">{adj.catatan || "Tanpa catatan"}</p>

      <DataTable
        rows={adj.stock_adjustment_items}
        rowKey={(_r, i) => String(i)}
        minWidth={720}
        empty="Tidak ada item pada adjustment ini."
        columns={[
          {
            key: "item",
            header: "Item",
            role: "title",
            cell: (r) => (
              <>
                <span className="font-mono text-[11.5px] text-botanical-700 mr-2">
                  {r.items?.kode}
                </span>
                {r.items?.nama}
              </>
            ),
            cardCell: (r) => (
              <>
                <div>{r.items?.nama}</div>
                <div className="text-[11.5px] text-muted font-mono font-normal">
                  {r.items?.kode}
                </div>
              </>
            ),
          },
          {
            key: "sebelum",
            header: "Sebelum",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => `${formatId(Number(r.qty_sebelum))} ${r.items?.satuan}`,
          },
          {
            key: "sesudah",
            header: "Sesudah",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => `${formatId(Number(r.qty_sesudah))} ${r.items?.satuan}`,
          },
          {
            key: "selisih",
            header: "Selisih",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => {
              const diff = Number(r.qty_sesudah) - Number(r.qty_sebelum);
              return (
                <span
                  className={`font-medium ${
                    diff > 0 ? "text-botanical-700" : "text-clay-600"
                  }`}
                >
                  {diff > 0 ? "+" : ""}
                  {formatId(diff)}
                </span>
              );
            },
          },
          {
            key: "harga",
            header: "Harga/Unit",
            role: "secondary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) =>
              r.harga_per_unit != null
                ? "Rp " + Number(r.harga_per_unit).toLocaleString("id-ID")
                : "-",
          },
        ]}
      />
    </div>
  );
}
