import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { Supplier } from "@/lib/types";
import TableSearch from "@/components/TableSearch";

export default async function SuppliersPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("*")
    .eq("organization_id", organizationId)
    .order("nama");

  const list = (suppliers || []) as Supplier[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Suppliers</h1>
          <p className="text-muted text-sm mt-1">{list.length} supplier terdaftar</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/suppliers/new"
            className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus size={16} /> Tambah Supplier
          </Link>
        </div>
      </div>

      <div className="mt-4">

        <TableSearch placeholder="Cari nama / kontak supplier..." />

      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[860px] text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Nama</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Kontak</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Telp</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Email</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">NPWP</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted py-10 text-sm">
                  Belum ada supplier.
                </td>
              </tr>
            ) : (
              list.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-white/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium whitespace-nowrap">{s.nama}</div>
                    <div
                      className="text-[11.5px] text-muted max-w-[300px] truncate"
                      title={s.alamat || undefined}
                    >
                      {s.alamat}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{s.nama_kontak || "-"}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-[12.5px]">
                    {s.no_telp || "-"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{s.email || "-"}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-[12.5px]">
                    {s.npwp || "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/suppliers/${s.id}/edit`} className="text-botanical-700 text-[12.5px] font-medium hover:underline">
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