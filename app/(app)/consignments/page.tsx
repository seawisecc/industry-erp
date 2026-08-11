import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Store, Eye } from "lucide-react";
import SalesShell from "@/components/SalesShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";
import {
  ilikeOrWithIds,
  pageInfo,
  parseListQuery,
  type SearchParams,
} from "@/lib/pagination";
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

export default async function ConsignmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);
  const kolom =
    "id, no_konsinyasi, tanggal_kirim, status, clients(id, company_brand), consignment_items(product_id, qty_kirim, qty_terjual, qty_retur, harga_jual, varian_ukuran, products(nama_produk))";

  // Nama client ada di tabel lain, cari id-nya dulu.
  let clientIds: string[] = [];
  if (sp.q) {
    const { data: cs } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("company_brand", `%${sp.q}%`)
      .limit(500);
    clientIds = (cs || []).map((c) => c.id as string);
  }

  let query = supabase
    .from("consignments")
    .select(kolom, { count: "exact" })
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(
      ilikeOrWithIds(["no_konsinyasi"], sp.q, "client_id", clientIds)
    );
  if (sp.filter("status")) query = query.eq("status", sp.filter("status"));

  const { data: cons, count } = await query
    .order("created_at", { ascending: false })
    .range(sp.from, sp.to);

  const list = (cons || []) as unknown as ConsRow[];
  const info = pageInfo(sp.page, count, list.length);

  /** Sisa yang masih di outlet = terkirim - terjual - retur. */
  const qtyKonsinyasi = (c: ConsRow) => {
    const kirim = c.consignment_items.reduce((s, i) => s + Number(i.qty_kirim), 0);
    const terjual = c.consignment_items.reduce(
      (s, i) => s + Number(i.qty_terjual),
      0
    );
    const retur = c.consignment_items.reduce((s, i) => s + Number(i.qty_retur), 0);
    return { kirim, terjual, sisa: kirim - terjual - retur };
  };

  // Rekap outlet harus melihat SELURUH pengiriman yang masih aktif, bukan
  // cuma halaman yang sedang tampil, jadi diambil terpisah dari tabel.
  const { data: aktif } = await supabase
    .from("consignments")
    .select(kolom)
    .eq("organization_id", organizationId)
    .eq("status", "Aktif");
  const aktifList = (aktif || []) as unknown as ConsRow[];

  // ===== Rekap per outlet (client) untuk konsinyasi yang masih Aktif =====
  type Outlet = {
    clientId: string;
    client: string;
    pengiriman: number;
    totalSisa: number;
    produk: Map<string, OutletProdItem>;
  };
  const outlets = new Map<string, Outlet>();
  for (const c of aktifList) {
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
      const nama = it.products?.nama_produk || "-";
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
            {info.total.toLocaleString("id-ID")} pengiriman. Catat laku/retur
            per outlet dari rekap di bawah
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
                Total barang yang masih ada di tiap outlet, catat laku/retur
                langsung dari sini.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
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
        <TableToolbar
          placeholder="Cari no. konsinyasi / client..."
          info={info}
          filters={[
            {
              param: "status",
              label: "Semua Status",
              options: [
                { value: "Aktif", label: "Aktif" },
                { value: "Selesai", label: "Selesai" },
              ],
            },
          ]}
        />
      </div>
      <DataTable
        rows={list}
        rowKey={(c) => c.id}
        minWidth={800}
        empty={
          sp.q || sp.filter("status")
            ? "Tidak ada konsinyasi yang cocok dengan pencarian/filter."
            : "Belum ada konsinyasi."
        }
        columns={[
          {
            key: "no",
            header: "No.",
            role: "subtitle",
            className: "whitespace-nowrap",
            cell: (c) => (
              <span className="font-mono text-[12px]">{c.no_konsinyasi}</span>
            ),
          },
          {
            key: "client",
            header: "Client",
            role: "title",
            cell: (c) => (
              <div className="max-w-[200px] truncate font-medium">
                {c.clients?.company_brand || "-"}
              </div>
            ),
            cardCell: (c) => c.clients?.company_brand || "-",
          },
          {
            key: "tanggal",
            header: "Tanggal Kirim",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (c) => formatTanggal(c.tanggal_kirim),
          },
          {
            key: "kirim",
            header: "Terkirim",
            role: "secondary",
            align: "right",
            cell: (c) => qtyKonsinyasi(c).kirim.toLocaleString("id-ID"),
          },
          {
            key: "terjual",
            header: "Terjual",
            role: "primary",
            align: "right",
            className: "text-botanical-700 font-medium",
            cell: (c) => (
              <span className="text-botanical-700 font-medium">
                {qtyKonsinyasi(c).terjual.toLocaleString("id-ID")}
              </span>
            ),
          },
          {
            key: "sisa",
            header: "Sisa di Lokasi",
            role: "primary",
            align: "right",
            cell: (c) => qtyKonsinyasi(c).sisa.toLocaleString("id-ID"),
          },
          {
            key: "status",
            header: "Status",
            role: "badge",
            cell: (c) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                  c.status === "Aktif"
                    ? "bg-amber-100 text-amber-500"
                    : "bg-botanical-100 text-botanical-700"
                }`}
              >
                {c.status}
              </span>
            ),
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            cell: (c) => (
              <RowActions>
                <IconAction
                  icon={Eye}
                  label="Lihat detail konsinyasi"
                  href={`/consignments/${c.id}`}
                  tone="primary"
                />
              </RowActions>
            ),
          },
        ]}
      />
      <Pagination info={info} />
    </SalesShell>
  );
}
