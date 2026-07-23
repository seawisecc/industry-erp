import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Store } from "lucide-react";
import SalesShell from "@/components/SalesShell";
import TableSearch from "@/components/TableSearch";
import OutletActions, { type OutletProdItem } from "./OutletActions";

type ConsItem = {
  product_id: string;
  qty_kirim: number;
  qty_terjual: number;
  qty_retur: number;
  harga_jual: number;
  varian_ukuran: string | null;
  products: { nama_produk: string } | null;
};

type ConsRow = {
  id: string;
  no_konsinyasi: string | null;
  tanggal_kirim: string;
  status: string;
  clients: { id: string; company_brand: string } | null;
  consignment_items: ConsItem[];
};

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ConsignmentsPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: cons } = await supabase
    .from("consignments")
    .select(
      "id, no_konsinyasi, tanggal_kirim, status, clients(id, company_brand), consignment_items(product_id, qty_kirim, qty_terjual, qty_retur, harga_jual, varian_ukuran, products(nama_produk))"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const list = (cons || []) as unknown as ConsRow[];

  // ===== Rekap per outlet (client) untuk konsinyasi yang masih Aktif =====
  type Outlet = {
    clientId: string;
    client: string;
    pengiriman: number;
    totalSisa: number;
    produk: Map<string, OutletProdItem>;
  };
  const outlets = new Map<string, Outlet>();
  for (const c of list) {
    if (c.status !== "Aktif" || !c.clients) continue;
    const cid = c.clients.id;
    const o =
      outlets.get(cid) ||
      ({
        clientId: cid,
        client: c.clients.company_brand,
        pengiriman: 0,
        totalSisa: 0,
        produk: new Map(),
      } as Outlet);
    o.pengiriman += 1;
    for (const it of c.consignment_items) {
      const sisa =
        Number(it.qty_kirim) - Number(it.qty_terjual) - Number(it.qty_retur);
      if (sisa <= 0) continue;
      o.totalSisa += sisa;
      const nama = it.products?.nama_produk || "—";
      const varian = it.varian_ukuran || "-";
      const key = `${it.product_id}|${varian}`;
      const p =
        o.produk.get(key) ||
        ({
          product_id: it.product_id,
          nama,
          varian,
          sisa: 0,
          harga: Number(it.harga_jual || 0),
        } as OutletProdItem);
      p.sisa += sisa;
      if (Number(it.harga_jual) > 0) p.harga = Number(it.harga_jual);
      o.produk.set(key, p);
    }
    outlets.set(cid, o);
  }
  const outletList = Array.from(outlets.values())
    .filter((o) => o.totalSisa > 0)
    .sort((a, b) => b.totalSisa - a.totalSisa);

  return (
    <SalesShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Consignment</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {list.length} pengiriman — catat laku/retur per outlet dari rekap di
            bawah
          </p>
        </div>
        <Link
          href="/consignments/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} /> Kirim Konsinyasi
        </Link>
      </div>

      {/* ===== Rekap stok per outlet (di atas) ===== */}
      {outletList.length > 0 && (
        <>
          <div className="flex items-center gap-2 mt-5 mb-3">
            <div className="rounded-lg p-1.5 bg-botanical-100 text-botanical-700">
              <Store size={16} />
            </div>
            <div>
              <h3 className="font-display text-[15px] font-semibold text-ink">
                Stok per Outlet
              </h3>
              <p className="text-muted text-[11.5px]">
                Total barang yang masih ada di tiap outlet — catat laku/retur
                langsung dari sini.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {outletList.map((o) => {
              const produkArr = Array.from(o.produk.values()).sort(
                (a, b) => b.sisa - a.sisa
              );
              return (
                <div key={o.clientId} className="glass rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-ink truncate" title={o.client}>
                        {o.client}
                      </div>
                      <div className="text-[11.5px] text-muted">
                        {o.pengiriman} pengiriman aktif
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-display text-[22px] font-semibold text-botanical-700 leading-none">
                        {o.totalSisa.toLocaleString("id-ID")}
                      </div>
                      <div className="text-[10.5px] uppercase tracking-wide text-muted">
                        total pcs di lokasi
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-line pt-2 flex flex-col gap-1">
                    {produkArr.map((p) => (
                      <div
                        key={`${p.product_id}|${p.varian}`}
                        className="flex items-center justify-between text-[12.5px] py-0.5"
                      >
                        <span className="truncate pr-3">
                          {p.nama}
                          {p.varian !== "-" && (
                            <span className="text-muted"> · {p.varian}</span>
                          )}
                        </span>
                        <span className="font-medium whitespace-nowrap">
                          {p.sisa.toLocaleString("id-ID")} pcs
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-line mt-3 pt-3">
                    <OutletActions
                      clientId={o.clientId}
                      clientName={o.client}
                      produk={produkArr}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ===== Detail pengiriman (di bawah) ===== */}
      <h3 className="font-display text-[15px] font-semibold text-ink mt-8 mb-3">
        Detail Pengiriman
      </h3>
      <div className="mb-3">
        <TableSearch
          placeholder="Cari no. konsinyasi / client..."
          filters={[{ label: "Semua Status", options: ["Aktif", "Selesai"] }]}
        />
      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[800px] text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">No.</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Client</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tanggal Kirim</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Terkirim</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Terjual</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Sisa di Lokasi</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-10 text-sm">
                  Belum ada konsinyasi.
                </td>
              </tr>
            ) : (
              list.map((c) => {
                const kirim = c.consignment_items.reduce(
                  (s, i) => s + Number(i.qty_kirim),
                  0
                );
                const terjual = c.consignment_items.reduce(
                  (s, i) => s + Number(i.qty_terjual),
                  0
                );
                const retur = c.consignment_items.reduce(
                  (s, i) => s + Number(i.qty_retur),
                  0
                );
                const sisa = kirim - terjual - retur;
                return (
                  <tr
                    key={c.id}
                    className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                      {c.no_konsinyasi}
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[200px] truncate font-medium">
                        {c.clients?.company_brand || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatTanggal(c.tanggal_kirim)}
                    </td>
                    <td className="px-4 py-3 text-right">{kirim.toLocaleString("id-ID")}</td>
                    <td className="px-4 py-3 text-right text-botanical-700 font-medium">
                      {terjual.toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3 text-right">{sisa.toLocaleString("id-ID")}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                          c.status === "Aktif"
                            ? "bg-amber-100 text-amber-500"
                            : "bg-botanical-100 text-botanical-700"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/consignments/${c.id}`}
                        className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </SalesShell>
  );
}
