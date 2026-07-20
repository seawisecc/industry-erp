import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";
import SalesShell from "@/components/SalesShell";
import TableSearch from "@/components/TableSearch";

type ClientRow = {
  id: string;
  kode: string | null;
  company_brand: string;
  cp: string | null;
  npwp: string | null;
  phone: string | null;
  kategori: string;
  alamat: string | null;
  aktif: boolean;
};

const KATEGORI_STYLE: Record<string, string> = {
  "Brand Owner": "bg-botanical-100 text-botanical-700",
  "University/Corporation": "bg-amber-100 text-amber-500",
  Research: "bg-amber-100 text-amber-500",
  Reseller: "bg-clay-100 text-clay-600",
  "Walk In Customer": "bg-white/70 text-muted border border-line",
  Other: "bg-white/70 text-muted border border-line",
};

export default async function ClientsPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .eq("organization_id", organizationId)
    .order("kode");

  const list = (clients || []) as ClientRow[];

  return (
    <SalesShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Clients</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {list.length} client terdaftar — dipakai di konsinyasi, invoice, dan POS
          </p>
        </div>
        <Link
          href="/clients/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} /> Tambah Client
        </Link>
      </div>

      <div className="mt-4">
        <TableSearch
          placeholder="Cari kode / nama client..."
          filters={[{ label: "Semua Kategori", options: ["Brand Owner", "University/Corporation", "Research", "Reseller", "Walk In Customer", "Other"] }]}
        />
      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[880px] text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Kode</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Company / Brand</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">CP</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Phone</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Kategori</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-10 text-sm">
                  Belum ada client.
                </td>
              </tr>
            ) : (
              list.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-[12.5px] whitespace-nowrap">
                    {c.kode || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className="font-medium max-w-[220px] truncate"
                      title={c.company_brand}
                    >
                      {c.company_brand}
                    </div>
                    {c.alamat && (
                      <div
                        className="text-[11.5px] text-muted max-w-[220px] truncate"
                        title={c.alamat}
                      >
                        {c.alamat}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{c.cp || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-[12.5px]">
                    {c.phone || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        KATEGORI_STYLE[c.kategori] || KATEGORI_STYLE.Other
                      }`}
                    >
                      {c.kategori}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                        c.aktif
                          ? "bg-botanical-100 text-botanical-700"
                          : "bg-clay-100 text-clay-600"
                      }`}
                    >
                      {c.aktif ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/clients/${c.id}/edit`}
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
    </SalesShell>
  );
}
