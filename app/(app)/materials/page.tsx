import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";
import BahanShell from "@/components/BahanShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import {
  ilikeOr,
  pageInfo,
  parseListQuery,
  type SearchParams,
} from "@/lib/pagination";

type MaterialRow = {
  id: string;
  material_code: string;
  tradename: string;
  origin: string | null;
  noc: string | null;
  kategori: "Bahan Baku" | "Kemasan";
  keterangan: string | null;
  suppliers: { nama: string } | null;
  material_inci: { inci_name: string; percentage: number }[];
};

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  let query = supabase
    .from("materials")
    .select(
      "id, material_code, tradename, origin, noc, kategori, keterangan, suppliers(nama), material_inci(inci_name, percentage)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(
      ilikeOr(["material_code", "tradename", "origin", "noc"], sp.q)
    );
  if (sp.filter("kategori"))
    query = query.eq("kategori", sp.filter("kategori"));

  const { data: materials, count } = await query
    .order("material_code")
    .range(sp.from, sp.to);

  const list = (materials || []) as unknown as MaterialRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <BahanShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Materials</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} material terdaftar, data
            regulasi/komposisi bahan baku
          </p>
        </div>
        <Link
          href="/materials/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} /> Tambah Material
        </Link>
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari kode / tradename..."
          info={info}
          filters={[
            {
              param: "kategori",
              label: "Semua Kategori",
              options: [
                { value: "Bahan Baku", label: "Bahan Baku" },
                { value: "Kemasan", label: "Kemasan" },
              ],
            },
          ]}
        />
      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[960px] text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Kode</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tradename</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Kategori</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Supplier</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">INCI / Keterangan</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Origin</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">NOC</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-10 text-sm">
                  {sp.q || sp.filter("kategori")
                    ? "Tidak ada material yang cocok dengan pencarian/filter."
                    : "Belum ada material."}
                </td>
              </tr>
            ) : (
              list.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0 hover:bg-white/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-[12.5px] font-medium whitespace-nowrap">
                    {m.material_code}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <div className="max-w-[200px] truncate" title={m.tradename}>
                      {m.tradename}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11.5px] font-medium ${m.kategori === "Kemasan" ? "bg-amber-100 text-amber-500" : "bg-botanical-100 text-botanical-700"}`}>
                      {m.kategori}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[170px] truncate" title={m.suppliers?.nama}>
                      {m.suppliers?.nama || "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const teks =
                        m.kategori === "Kemasan"
                          ? m.keterangan || "-"
                          : m.material_inci.length > 0
                            ? m.material_inci
                                .map((i) => `${i.inci_name} (${i.percentage}%)`)
                                .join(", ")
                            : "-";
                      return (
                        <div
                          className="w-[280px] text-[12px] leading-snug line-clamp-2"
                          title={teks}
                        >
                          {teks}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{m.origin || "-"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{m.noc || "-"}</td>
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
      <Pagination info={info} />
    </BahanShell>
  );
}