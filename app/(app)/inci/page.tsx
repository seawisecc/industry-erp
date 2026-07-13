import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { InciMaster } from "@/lib/types";
import ImportButton from "./ImportButton";

export default async function InciPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: inciList } = await supabase
    .from("inci_master")
    .select("*")
    .eq("organization_id", organizationId)
    .order("inci_name");

  const list = (inciList || []) as InciMaster[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Master INCI Name</h1>
          <p className="text-muted text-sm mt-1">{list.length} INCI Name terdaftar</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton />
          <Link
            href="/inci/new"
            className="flex items-center gap-1.5 bg-botanical-700 text-white text-[13.5px] font-medium px-4 py-2.5 rounded-sm hover:bg-botanical-800 transition-colors"
          >
            <Plus size={16} /> Tambah INCI Name
          </Link>
        </div>
      </div>

      <div className="mt-6 glass rounded-2xl overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">INCI Name</th>
              <th className="px-4 py-2.5 font-semibold">CAS Number</th>
              <th className="px-4 py-2.5 font-semibold">NOAEL</th>
              <th className="px-4 py-2.5 font-semibold">Function</th>
              <th className="px-4 py-2.5 font-semibold">Reference</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted py-10 text-sm">
                  Belum ada INCI Name.
                </td>
              </tr>
            ) : (
              list.map((item) => (
                <tr key={item.id} className="border-b border-line last:border-0 hover:bg-white/40 transition-colors">
                  <td className="px-4 py-3 font-medium">{item.inci_name}</td>
                  <td className="px-4 py-3">{item.cas_number || "-"}</td>
                  <td className="px-4 py-3">{item.noael || "-"}</td>
                  <td className="px-4 py-3">{item.function || "-"}</td>
                  <td className="px-4 py-3 w-[220px]">{item.reference ? (item.reference.startsWith("http") ? (<a href={item.reference} target="_blank" rel="noopener noreferrer" className="block max-w-[220px] truncate text-botanical-700 hover:underline" title={item.reference}>{item.reference.replace(/^https?:\/\/(www\.)?/, "")}</a>) : (<span className="block max-w-[220px] truncate" title={item.reference}>{item.reference}</span>)) : ("-")}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/inci/${item.id}/edit`} className="text-botanical-700 text-[12.5px] font-medium hover:underline">
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