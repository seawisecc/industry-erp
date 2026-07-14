import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import POForm, { ItemOption } from "../POForm";

export default async function NewPOPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, nama")
    .eq("organization_id", organizationId)
    .order("nama");

  // Item yang bisa dipesan = item yang terhubung ke material (material menyimpan supplier-nya)
  const { data: materialLinks } = await supabase
    .from("materials")
    .select("supplier_id, items:item_id(id, kode, nama, satuan)")
    .eq("organization_id", organizationId)
    .not("item_id", "is", null);

  const seen = new Set<string>();
  const itemOptions: ItemOption[] = [];
  for (const link of (materialLinks || []) as unknown as {
    supplier_id: string | null;
    items: { id: string; kode: string; nama: string; satuan: string } | null;
  }[]) {
    if (!link.items || seen.has(link.items.id)) continue;
    seen.add(link.items.id);
    itemOptions.push({ ...link.items, supplier_id: link.supplier_id });
  }
  itemOptions.sort((a, b) => a.kode.localeCompare(b.kode));

  return (
    <div className="max-w-3xl">
      <Link
        href="/purchase-orders"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Purchase Order
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Buat Purchase Order
      </h1>
      <p className="text-muted text-sm mb-6">
        No. PO dibuat otomatis (PO-MMYY-001) saat disimpan.
      </p>

      <POForm suppliers={suppliers || []} items={itemOptions} />
    </div>
  );
}
