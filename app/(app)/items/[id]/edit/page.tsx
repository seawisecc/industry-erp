import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import ItemForm from "../../ItemForm";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: item }, { data: materials }, { data: linkedMaterial }] = await Promise.all([
    supabase.from("items").select("*").eq("id", id).single(),
    supabase
      .from("materials")
      .select("id, material_code, tradename, kategori")
      .eq("organization_id", organizationId)
      .order("material_code"),
    supabase.from("materials").select("id").eq("item_id", id).maybeSingle(),
  ]);

  if (!item) {
    notFound();
  }

  return (
    <div className="max-w-2xl">
      <Link href="/items" className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink">
        <ArrowLeft size={15} /> Kembali ke Stok Bahan
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-6">Edit Item</h1>

      <ItemForm
        materials={materials || []}
        item={{
          id: item.id,
          nama: item.nama,
          kategori: item.kategori,
          satuan: item.satuan,
          stok_minimum: Number(item.stok_minimum),
          material_id: linkedMaterial?.id || null,
        }}
      />
    </div>
  );
}