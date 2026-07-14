import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ProductForm, { ItemOption } from "../ProductForm";

export default async function NewProductPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: items } = await supabase
    .from("items")
    .select("id, kode, nama, satuan, kategori")
    .eq("organization_id", organizationId)
    .eq("aktif", true)
    .order("kode");

  return (
    <div className="max-w-3xl">
      <Link
        href="/products"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Produk
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Tambah Produk
      </h1>
      <p className="text-muted text-sm mb-6">
        Kode produk dibuat otomatis (PRD-0001) saat disimpan.
      </p>

      <ProductForm items={(items || []) as ItemOption[]} />
    </div>
  );
}
