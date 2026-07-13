import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";

type MaterialRow = {
  id: string;
  material_code: string;
  tradename: string;
  origin: string | null;
  noc: string | null;
  suppliers: { nama: string } | null;
  material_inci: { inci_name: string; percentage: number }[];
};

export default async function MaterialsPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: materials } = await supabase
    .from("materials")
    .select("id, material_code, tradename, origin, noc, suppliers(nama), material_inci(inci_name, percentage)")
    .eq("organization_id", organizationId)
    .order("material_code");

  const list = (materials || []) as unknown as MaterialRow[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Master Material</h1>
          <p className="text-muted text-sm mt-1">
            {list.length} material terdaftar — data regulasi/komposisi bahan baku
          </p>
        </div>
        <Link
          href="/materials/new"
          className="flex items-center gap-1.5 bg-botanical-700 text-white text-[13.5px] font-medium px-4 py-2.5 rounded-sm hover:bg-botanical-800 transition-colors"
        >
          <Plus size={16} /> Tambah Material
        </Link>
      </div>

      <div className="mt-6 glass rounded-2xl overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">Kode</th>
              <th className="px-4 py-2.5 font-semibold">Tradename</th>
              <th className="px-4 py-2.5 font-semibold">Supplier</th>
              <th className="px-4 py-2.5 font-semibold">INCI / Komposisi</th>
              <th className="px-4 py-2.5 font-semibold">Origin</th>
              <th className="px-4 py-2.5 font-semibold">NOC</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-10 text-sm">
                  Belum ada material.
                </td>
              </tr>
            ) : (
              list.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0 hover:bg-white/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-[12.5px] font-medium">{m.material_code}</td>
                  <td className="px-4 py-3 font-medium">{m.tradename}</td>
                  <td className="px-4 py-3">{m.suppliers?.nama || "-"}</td>
                  <td className="px-4 py-3 w-[340px] min-w-[260px]">
                    <span className="block text-[12.5px] leading-relaxed">
                      {m.material_inci.length > 0
                        ? m.material_inci.map((i) => `${i.inci_name} (${i.percentage}%)`).join(", ")
                        : "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{m.origin || "-"}</td>
                  <td className="px-4 py-3">{m.noc || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/materials/${m.id}/edit`}
                      className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}