import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import MaterialForm from "../../MaterialForm";

export default async function EditMaterialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: material }, { data: inciRows }, { data: suppliers }, { data: inciOptions }] =
    await Promise.all([
      supabase.from("materials").select("*").eq("id", id).single(),
      supabase
        .from("material_inci")
        .select("inci_master_id, inci_name, percentage")
        .eq("material_id", id),
      supabase
        .from("suppliers")
        .select("id, nama")
        .eq("organization_id", organizationId)
        .order("nama"),
      supabase
        .from("inci_master")
        .select("id, inci_name, cas_number")
        .eq("organization_id", organizationId)
        .order("inci_name"),
    ]);

  if (!material) {
    notFound();
  }

  // Angka yang sedang berlaku, supaya form bisa bilang mana yang dipakai
  // sistem. Yang nyata menang atas yang diketik: harga pembelian terakhir
  // mengalahkan harga referensi, dan MOQ item mengalahkan MOQ material.
  const [{ data: item }, { data: batch }] = await Promise.all([
    material.item_id
      ? supabase
          .from("items")
          .select("moq, satuan")
          .eq("id", material.item_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    material.item_id
      ? supabase
          .from("purchase_batches")
          .select("harga_per_unit")
          .eq("item_id", material.item_id)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="max-w-4xl">
      <Link href="/materials" className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink">
        <ArrowLeft size={15} /> Kembali ke Material
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-6">Edit Material</h1>

      <MaterialForm
        suppliers={suppliers || []}
        inciOptions={inciOptions || []}
        berlaku={{
          adaItem: !!material.item_id,
          hargaPembelian:
            batch?.harga_per_unit == null ? null : Number(batch.harga_per_unit),
          moqItem: item?.moq == null ? null : Number(item.moq),
          satuan: item?.satuan ?? null,
        }}
        material={{
          id: material.id,
          material_code: material.material_code,
          tradename: material.tradename,
          supplier_id: material.supplier_id,
          origin: material.origin,
          noc: material.noc,
          kategori: material.kategori || "Bahan Baku",
          keterangan: material.keterangan,
          harga_referensi:
            material.harga_referensi == null
              ? null
              : Number(material.harga_referensi),
          moq: material.moq == null ? null : Number(material.moq),
          inci_rows: (inciRows || []).map((r) => ({
            inci_master_id: r.inci_master_id || "",
            inci_name: r.inci_name,
            percentage: Number(r.percentage),
          })),
        }}
      />
    </div>
  );
}