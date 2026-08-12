import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { canAccessModule } from "@/lib/modules";
import type { ItemStok } from "@/lib/stokCek";
import PlanForm, { ProductOpt } from "./PlanForm";

type ProductRaw = {
  id: string;
  kode: string | null;
  nama_produk: string;
  brand: string | null;
  batch_size_kg: number | null;
  product_formulas: { item_id: string; percentage: number }[];
};

type ItemRaw = { id: string; kode: string; nama: string; satuan: string };

export default async function NewPlanPage() {
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

  const canPlan =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_plan_production;

  // Formula ikut diambil supaya kebutuhan bahan bisa dicek di layar,
  // sebelum plan disimpan. Stoknya dari qty_sisa, angka yang sama yang
  // dipakai create_production saat memotong nanti (lihat lib/stokCek.ts).
  const [{ data: products }, { data: items }, { data: batches }] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "id, kode, nama_produk, brand, batch_size_kg, product_formulas(item_id, percentage)"
        )
        .eq("organization_id", organizationId)
        .eq("aktif", true)
        .order("kode"),
      supabase
        .from("items")
        .select("id, kode, nama, satuan")
        .eq("organization_id", organizationId),
      supabase
        .from("purchase_batches")
        .select("item_id, qty_sisa")
        .eq("organization_id", organizationId),
    ]);

  const stok = new Map<string, number>();
  for (const b of (batches || []) as { item_id: string; qty_sisa: number }[]) {
    stok.set(b.item_id, (stok.get(b.item_id) || 0) + Number(b.qty_sisa));
  }

  const itemStok: ItemStok[] = ((items || []) as ItemRaw[]).map((it) => ({
    id: it.id,
    kode: it.kode,
    nama: it.nama,
    satuan: it.satuan,
    stok: stok.get(it.id) || 0,
  }));

  const productOpts: ProductOpt[] = ((products || []) as unknown as ProductRaw[]).map(
    (p) => ({
      id: p.id,
      kode: p.kode,
      nama_produk: p.nama_produk,
      brand: p.brand,
      batch_size_kg: p.batch_size_kg == null ? null : Number(p.batch_size_kg),
      formulas: (p.product_formulas || []).map((f) => ({
        item_id: f.item_id,
        percentage: Number(f.percentage),
      })),
    })
  );

  // Tautan PPIC cuma ditawarkan ke orang yang boleh membukanya, kalau
  // tidak, tombolnya berujung di layar "Tidak Punya Akses".
  const bolehPpic = canAccessModule(
    {
      isSuperAdmin,
      role: profile?.role || "",
      allowedModules: profile?.allowed_modules ?? null,
    },
    "ppic"
  );

  return (
    <div className="max-w-4xl">
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
        Instruksi produksi untuk tim, eksekusi &amp; penimbangan dilakukan
        setelah plan dibuat.
      </p>

      {canPlan ? (
        <PlanForm
          products={productOpts}
          items={itemStok}
          ppicHref={bolehPpic ? "/ppic" : null}
        />
      ) : (
        <div className="glass rounded-2xl p-8 text-center text-muted text-sm">
          Kamu tidak punya izin membuat plan produksi. Minta Admin mengaktifkan
          izin &ldquo;Bisa membuat instruksi produksi&rdquo; di menu Pengguna.
        </div>
      )}
    </div>
  );
}
