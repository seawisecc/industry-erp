import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PlanForm, { ProductOpt } from "./PlanForm";

export default async function NewPlanPage() {
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

  const canPlan =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_plan_production;

  const { data: products } = await supabase
    .from("products")
    .select("id, kode, nama_produk, brand, batch_size_kg")
    .eq("organization_id", organizationId)
    .eq("aktif", true)
    .order("kode");

  return (
    <div className="max-w-2xl">
      <Link
        href="/production"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Production
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Buat Plan Produksi
      </h1>
      <p className="text-muted text-sm mb-6">
        Instruksi produksi untuk tim — eksekusi &amp; penimbangan dilakukan
        setelah plan dibuat.
      </p>

      {canPlan ? (
        <PlanForm products={(products || []) as ProductOpt[]} />
      ) : (
        <div className="glass rounded-2xl p-8 text-center text-muted text-sm">
          Kamu tidak punya izin membuat plan produksi. Minta Admin mengaktifkan
          izin &ldquo;Bisa membuat instruksi produksi&rdquo; di menu Pengguna.
        </div>
      )}
    </div>
  );
}
