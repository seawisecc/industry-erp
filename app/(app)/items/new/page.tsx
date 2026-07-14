import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ItemForm from "../ItemForm";

export default async function NewItemPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: materials } = await supabase
    .from("materials")
    .select("id, material_code, tradename, kategori")
    .eq("organization_id", organizationId)
    .order("material_code");

  return (
    <div className="max-w-2xl">
      <Link href="/items" className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink">
        <ArrowLeft size={15} /> Kembali ke Stok Bahan
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-6">Tambah Item</h1>

      <ItemForm materials={materials || []} />
    </div>
  );
}