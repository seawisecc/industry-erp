import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Printer, Eye, Truck, Wallet, PackageCheck } from "lucide-react";
import PembelianShell from "@/components/PembelianShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";
import StatCard from "@/components/StatCard";
import { getPoPipeline, type PipelinePO } from "@/lib/poPipeline";
import { localDateStr, selisihHariStr } from "@/lib/dates";
import {
  ilikeOrWithIds,
  pageInfo,
  parseListQuery,
  type SearchParams,
  orderFor,
} from "@/lib/pagination";

type ReceivingRow = {
  id: string;
  tanggal_terima: string;
  no_invoice: string | null;
  supplier_nama: string | null;
  total_invoice: number;
  purchase_orders: { no_po: string | null } | null;
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Baris PO yang ditampilkan di panel menunggu kedatangan. */
const DAFTAR_TUNGGU = 5;

const STATUS_TUNGGU_STYLE: Record<string, string> = {
  Dikirim: "bg-clay-100 text-clay-600",
  "Diterima Sebagian": "bg-botanical-100 text-botanical-700",
};

const SORT: Record<string, string> = {
  tanggal: "tanggal_terima",
  invoice: "no_invoice",
  supplier: "supplier_nama",
  total: "total_invoice",
};

export default async function ReceivingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  const ord = orderFor(sp, SORT, { column: "created_at", ascending: false });

  // PO yang sudah dikirim ke supplier dan barangnya belum datang semua.
  // Diurutkan dari tanggal PO paling lama, jadi yang paling telat di atas.
  const tungguP = getPoPipeline(supabase, organizationId!, [
    "Dikirim",
    "Diterima Sebagian",
  ]);

  // No. PO ada di tabel purchase_orders, jadi dicari id-nya dulu.
  let poIds: string[] = [];
  if (sp.q) {
    const { data: pos } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("no_po", `%${sp.q}%`)
      .limit(500);
    poIds = (pos || []).map((p) => p.id as string);
  }

  let query = supabase
    .from("receivings")
    .select(
      "id, tanggal_terima, no_invoice, supplier_nama, total_invoice, purchase_orders(no_po)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(
      ilikeOrWithIds(["no_invoice", "supplier_nama"], sp.q, "po_id", poIds)
    );

  const { data: receivings, count } = await query
    .order(ord.column, { ascending: ord.ascending })
    .range(sp.from, sp.to);

  const list = (receivings || []) as unknown as ReceivingRow[];
  const info = pageInfo(sp.page, count, list.length);

  const tunggu = await tungguP;
  const hariIni = localDateStr();
  const jumlahDikirim = (tunggu || []).filter((p) => p.status === "Dikirim").length;
  const jumlahSebagian = (tunggu || []).length - jumlahDikirim;
  const nilaiTunggu = (tunggu || []).reduce((s, p) => s + p.sisa, 0);

  return (
    <PembelianShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Receiving</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} penerimaan, stok bertambah
            lewat halaman ini
          </p>
        </div>
        <Link
          href="/receivings/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} /> Terima Barang
        </Link>
      </div>

      {tunggu ? (
        <MenungguKedatangan
          rows={tunggu}
          hariIni={hariIni}
          jumlahDikirim={jumlahDikirim}
          jumlahSebagian={jumlahSebagian}
          nilai={nilaiTunggu}
        />
      ) : (
        <p className="mt-4 text-[12.5px] text-clay-600">
          Daftar PO yang menunggu kedatangan gagal dimuat. Muat ulang halaman
          untuk mencoba lagi.
        </p>
      )}

      <h3 className="font-display text-[15px] font-semibold text-ink mt-6">
        Riwayat Penerimaan
      </h3>
      <div className="mt-2">
        <TableToolbar placeholder="Cari no. PO / supplier..." info={info} />
      </div>
      <DataTable
        rows={list}
        rowKey={(r) => r.id}
        minWidth={760}
        empty={
          sp.q
            ? "Tidak ada penerimaan yang cocok dengan pencarian."
            : "Belum ada penerimaan barang."
        }
        columns={[
          {
            key: "tanggal",
            header: "Tanggal",
            sort: "tanggal",
            role: "subtitle",
            className: "whitespace-nowrap",
            cell: (r) => formatTanggal(r.tanggal_terima),
          },
          {
            key: "po",
            header: "No. PO",
            role: "primary",
            cell: (r) => (
              <span className="font-mono text-[12.5px]">
                {r.purchase_orders?.no_po || "-"}
              </span>
            ),
          },
          {
            key: "invoice",
            header: "No. Invoice",
            sort: "invoice",
            role: "primary",
            cell: (r) => (
              <span className="font-mono text-[12.5px]">{r.no_invoice || "-"}</span>
            ),
          },
          {
            key: "supplier",
            header: "Supplier",
            sort: "supplier",
            role: "title",
            cell: (r) => (
              <div className="max-w-[220px] truncate font-medium">
                {r.supplier_nama || "-"}
              </div>
            ),
            cardCell: (r) => r.supplier_nama || "-",
          },
          {
            key: "total",
            header: "Total Invoice",
            sort: "total",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => formatRupiah(Number(r.total_invoice)),
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => (
              <RowActions>
                <IconAction
                  icon={Printer}
                  label="Cetak bukti terima"
                  href={`/print/receiving/${r.id}`}
                />
                <IconAction
                  icon={Eye}
                  label="Lihat detail penerimaan"
                  href={`/receivings/${r.id}`}
                  tone="primary"
                />
              </RowActions>
            ),
          },
        ]}
      />
      <Pagination info={info} />
    </PembelianShell>
  );
}

function MenungguKedatangan({
  rows,
  hariIni,
  jumlahDikirim,
  jumlahSebagian,
  nilai,
}: {
  rows: PipelinePO[];
  hariIni: string;
  jumlahDikirim: number;
  jumlahSebagian: number;
  nilai: number;
}) {
  const tampil = rows.slice(0, DAFTAR_TUNGGU);
  const lainnya = rows.length - tampil.length;

  return (
    <>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard
          icon={Truck}
          label="PO Menunggu Kedatangan"
          value={`${rows.length.toLocaleString("id-ID")} PO`}
          sub={`${jumlahDikirim.toLocaleString("id-ID")} sudah dikirim, ${jumlahSebagian.toLocaleString("id-ID")} diterima sebagian`}
          tone={rows.length > 0 ? "amber" : "botanical"}
        />
        <StatCard
          icon={Wallet}
          label="Nilai Barang Belum Datang"
          value={formatRupiah(nilai)}
          sub="Sisa qty yang belum diterima, bukan total PO"
        />
      </div>

      {tampil.length > 0 && (
        <>
          <h3 className="font-display text-[15px] font-semibold text-ink mt-6 mb-2">
            Menunggu Kedatangan{" "}
            <span className="font-sans text-[12px] font-normal text-muted">
              · paling lama menunggu di atas
            </span>
          </h3>
          <DataTable
            rows={tampil}
            rowKey={(p) => p.id}
            minWidth={760}
            maxHeight={false}
            columns={[
              {
                key: "no",
                header: "No. PO",
                role: "subtitle",
                cell: (p) => (
                  <span className="font-mono text-[12.5px]">{p.no_po || "-"}</span>
                ),
              },
              {
                key: "supplier",
                header: "Supplier",
                role: "title",
                cell: (p) => (
                  <div className="max-w-[200px] truncate font-medium">
                    {p.supplier_nama}
                  </div>
                ),
                cardCell: (p) => p.supplier_nama,
              },
              {
                key: "tanggal",
                header: "Tanggal PO",
                role: "primary",
                className: "whitespace-nowrap",
                cell: (p) => {
                  const umur = selisihHariStr(p.tanggal_po, hariIni);
                  return (
                    <>
                      <div>{formatTanggal(p.tanggal_po)}</div>
                      <div className="text-[11px] text-muted">
                        {umur <= 0 ? "hari ini" : `${umur} hari lalu`}
                      </div>
                    </>
                  );
                },
              },
              {
                key: "status",
                header: "Status",
                role: "badge",
                cell: (p) => (
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium whitespace-nowrap ${STATUS_TUNGGU_STYLE[p.status] || ""}`}
                  >
                    {p.status}
                  </span>
                ),
              },
              {
                key: "item",
                header: "Item Belum Datang",
                role: "primary",
                align: "right",
                className: "whitespace-nowrap",
                cell: (p) => `${p.itemSisa.toLocaleString("id-ID")} item`,
              },
              {
                key: "sisa",
                header: "Nilai Belum Datang",
                role: "primary",
                align: "right",
                className: "whitespace-nowrap",
                cell: (p) => formatRupiah(p.sisa),
              },
              {
                key: "aksi",
                role: "actions",
                align: "right",
                className: "whitespace-nowrap",
                cell: (p) => (
                  <RowActions>
                    <Link
                      href={`/receivings/new?po=${p.id}`}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-botanical-700 text-white text-[12px] font-medium hover:bg-botanical-800 transition-colors"
                    >
                      <PackageCheck size={13} /> Terima
                    </Link>
                  </RowActions>
                ),
              },
            ]}
          />
          {lainnya > 0 && (
            <p className="text-[12px] text-muted mt-2">
              dan {lainnya.toLocaleString("id-ID")} PO lainnya, semuanya bisa
              dipilih di{" "}
              <Link
                href="/receivings/new"
                className="text-botanical-700 font-medium hover:underline"
              >
                Terima Barang
              </Link>
              .
            </p>
          )}
        </>
      )}
    </>
  );
}
