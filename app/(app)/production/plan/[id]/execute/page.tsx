import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ExecuteForm, { PlanInfo, ItemInfo } from "./ExecuteForm";
import type { ExecutionData } from "../../../actions";

type PlanRaw = {
  id: string;
  no_batch: string;
  jumlah_batch: number;
  status: string;
  execution_data: ExecutionData | null;
  products: {
    nama_produk: string;
    batch_size_kg: number | null;
    product_formulas: { item_id: string; percentage: number }[];
    product_variants: {
      nama_varian: string;
      netto: number | null;
      variant_packaging: { item_id: string; qty_per_pcs: number }[];
    }[];
  } | null;
};

export default async function ExecutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: items }] = await Promise.all([
    supabase
      .from("production_plans")
      .select(
        `id, no_batch, jumlah_batch, status, execution_data,
         products(nama_produk, batch_size_kg,
           product_formulas(item_id, percentage),
           product_variants(nama_varian, netto, variant_packaging(item_id, qty_per_pcs)))`
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    supabase
      .from("items")
      .select("id, kode, nama, satuan, purchase_batches(qty_sisa)")
      .eq("organization_id", organizationId)
      .eq("aktif", true)
      .order("kode"),
  ]);

  if (!data) notFound();
  const plan = data as unknown as PlanRaw;
  if (plan.status === "Selesai" || !plan.products) notFound();

  const itemInfos: ItemInfo[] = (
    (items || []) as unknown as {
      id: string;
      kode: string;
      nama: string;
      satuan: string;
      purchase_batches: { qty_sisa: number }[];
    }[]
  ).map((it) => ({
    id: it.id,
    kode: it.kode,
    nama: it.nama,
    satuan: it.satuan,
    stok: (it.purchase_batches || []).reduce((s, b) => s + Number(b.qty_sisa), 0),
  }));

  const planInfo: PlanInfo = {
    id: plan.id,
    no_batch: plan.no_batch,
    jumlah_batch: Number(plan.jumlah_batch),
    bulkKg:
      Number(plan.jumlah_batch) * Number(plan.products.batch_size_kg || 0),
    formulas: plan.products.product_formulas.map((f) => ({
      item_id: f.item_id,
      percentage: Number(f.percentage),
    })),
    variants: plan.products.product_variants.map((v) => ({
      nama_varian: v.nama_varian,
      netto: v.netto == null ? null : Number(v.netto),
      packaging: v.variant_packaging.map((p) => ({
        item_id: p.item_id,
        qty_per_pcs: Number(p.qty_per_pcs),
      })),
    })),
    saved: plan.execution_data,
  };

  return (
    <div className="max-w-4xl">
      <Link
        href="/production"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Production
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Execution — <span className="font-mono text-[20px]">{plan.no_batch}</span>
      </h1>
      <p className="text-muted text-sm mb-6">
        {plan.products.nama_produk} · {Number(plan.jumlah_batch).toLocaleString("id-ID")}{" "}
        batch = {planInfo.bulkKg.toLocaleString("id-ID")} kg bulk
      </p>

      <ExecuteForm plan={planInfo} items={itemInfos} />
    </div>
  );
}
