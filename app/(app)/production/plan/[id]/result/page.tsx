import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ResultForm, { ResultVariant } from "./ResultForm";
import type { ExecutionData } from "../../../actions";

type PlanRaw = {
  id: string;
  no_batch: string;
  status: string;
  execution_data: ExecutionData | null;
  products: { nama_produk: string } | null;
};

export default async function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data } = await supabase
    .from("production_plans")
    .select("id, no_batch, status, execution_data, products(nama_produk)")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const plan = data as unknown as PlanRaw;
  if (plan.status === "Selesai") notFound();

  const variants: ResultVariant[] = (plan.execution_data?.variants || [])
    .filter((v) => v.rencana_pcs > 0)
    .map((v) => ({ nama_varian: v.nama_varian, teoritis_pcs: v.rencana_pcs }));

  return (
    <div className="max-w-3xl">
      <Link
        href="/production"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Production
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Result — <span className="font-mono text-[20px]">{plan.no_batch}</span>
      </h1>
      <p className="text-muted text-sm mb-6">{plan.products?.nama_produk}</p>

      {!plan.execution_data || variants.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-muted text-sm">
          Data eksekusi belum lengkap (rencana kemas per varian belum diisi).{" "}
          <Link
            href={`/production/plan/${plan.id}/execute`}
            className="text-botanical-700 font-medium hover:underline"
          >
            Isi tahap Execution dulu
          </Link>
          .
        </div>
      ) : (
        <ResultForm planId={plan.id} variants={variants} />
      )}
    </div>
  );
}
