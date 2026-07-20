import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";
import ProdukShell from "@/components/ProdukShell";
import TableSearch from "@/components/TableSearch";

type ServiceRow = {
  id: string;
  kode: string | null;
  nama_jasa: string;
  keterangan: string | null;
  biaya: number;
  aktif: boolean;
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export default async function ServicesPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: services } = await supabase
    .from("services")
    .select("id, kode, nama_jasa, keterangan, biaya, aktif")
    .eq("organization_id", organizationId)
    .order("kode");

  const list = (services || []) as ServiceRow[];

  return (
    <ProdukShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Services</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {list.length} layanan jasa — bisa dijual lewat Invoice &amp; POS
          </p>
        </div>
        <Link
          href="/services/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={14} /> Tambah Jasa
        </Link>
      </div>

      <div className="mt-4">
        <TableSearch
          placeholder="Cari kode / nama jasa..."
          filters={[{ label: "Semua Status", options: ["Aktif", "Nonaktif"] }]}
        />
      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Kode</th>
              <th className="px-4 py-2.5 font-semibold">Nama Jasa</th>
              <th className="px-4 py-2.5 font-semibold">Keterangan</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Biaya</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted py-10 text-sm">
                  Belum ada layanan jasa. Tambahkan misalnya: Jasa Formulasi, Uji
                  Stabilitas, Notifikasi BPOM.
                </td>
              </tr>
            ) : (
              list.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-[12.5px] whitespace-nowrap">
                    {s.kode || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium max-w-[240px] truncate" title={s.nama_jasa}>
                      {s.nama_jasa}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className="max-w-[260px] text-[12.5px] text-muted line-clamp-2"
                      title={s.keterangan || undefined}
                    >
                      {s.keterangan || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                    {formatRupiah(Number(s.biaya))}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                        s.aktif
                          ? "bg-botanical-100 text-botanical-700"
                          : "bg-clay-100 text-clay-600"
                      }`}
                    >
                      {s.aktif ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/services/${s.id}/edit`}
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
    </ProdukShell>
  );
}
