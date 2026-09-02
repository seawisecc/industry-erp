import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFeatures } from "@/lib/featuresServer";
import { redirect } from "next/navigation";
import BahanShell from "@/components/BahanShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";
import {
  ilikeOrWithIds,
  pageInfo,
  parseListQuery,
  type SearchParams,
  orderFor,
} from "@/lib/pagination";
import Link from "next/link";
import { ClipboardList, Printer, Eye, Tags } from "lucide-react";

type BatchRow = {
  id: string;
  no_lot_supplier: string | null;
  tanggal_terima: string;
  exp_date: string | null;
  qty_karantina: number;
  supplier_nama: string | null;
  items: { kode: string; nama: string; satuan: string } | null;
};

type HistoryRow = {
  id: string;
  qc_status: string;
  qc_note: string | null;
  qc_oleh: string | null;
  qc_tanggal: string | null;
  qty_masuk: number;
  no_lot_supplier: string | null;
  items: { kode: string; nama: string; satuan: string } | null;
};

function formatTanggal(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const SORT: Record<string, string> = {
  lot: "no_lot_supplier",
  diterima: "tanggal_terima",
  exp: "exp_date",
  qty: "qty_karantina",
  supplier: "supplier_nama",
};

export default async function QcIncomingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();
  const features = await getFeatures(organizationId!);
  if (!(features.qc)) redirect("/items");

  const sp = parseListQuery(await searchParams);

  const ord = orderFor(sp, SORT, { column: "tanggal_terima", ascending: true });

  // Kode/nama item ada di tabel items, cari id-nya dulu supaya pencarian
  // lewat nama item tetap jalan.
  let itemIds: string[] = [];
  if (sp.q) {
    const { data: its } = await supabase
      .from("items")
      .select("id")
      .eq("organization_id", organizationId)
      .or(`kode.ilike."%${sp.q}%",nama.ilike."%${sp.q}%"`)
      .limit(500);
    itemIds = (its || []).map((i) => i.id as string);
  }

  let karantinaQuery = supabase
    .from("purchase_batches")
    .select(
      "id, no_lot_supplier, tanggal_terima, exp_date, qty_karantina, supplier_nama, items(kode, nama, satuan)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId)
    .eq("qc_status", "Karantina");

  if (sp.q)
    karantinaQuery = karantinaQuery.or(
      ilikeOrWithIds(
        ["no_lot_supplier", "supplier_nama"],
        sp.q,
        "item_id",
        itemIds
      )
    );

  const [{ data: karantina, count }, { data: history }] = await Promise.all([
    karantinaQuery
      .order(ord.column, { ascending: ord.ascending })
      .range(sp.from, sp.to),
    supabase
      .from("purchase_batches")
      .select(
        "id, qc_status, qc_note, qc_oleh, qc_tanggal, qty_masuk, no_lot_supplier, items(kode, nama, satuan)"
      )
      .eq("organization_id", organizationId)
      .in("qc_status", ["Released", "Rejected"])
      .not("qc_tanggal", "is", null)
      .order("qc_tanggal", { ascending: false })
      .limit(15),
  ]);

  const list = (karantina || []) as unknown as BatchRow[];
  const logs = (history || []) as unknown as HistoryRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <BahanShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          QC Incoming
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          {info.total.toLocaleString("id-ID")} batch menunggu pemeriksaan,
          barang karantina belum bisa dipakai produksi sampai di-release.
        </p>
      </div>

      <div className="mt-4">
        <TableToolbar placeholder="Cari item / lot / supplier..." info={info} />
      </div>
      <DataTable
        rows={list}
        rowKey={(b) => b.id}
        minWidth={820}
        rowClassName={() => "bg-amber-100/20"}
        empty={
          sp.q
            ? "Tidak ada batch karantina yang cocok dengan pencarian."
            : "Tidak ada batch dalam karantina 🎉, barang baru dari Receiving akan muncul di sini."
        }
        columns={[
          {
            key: "item",
            header: "Item",
            role: "title",
            cell: (b) => (
              <>
                <div className="font-medium max-w-[200px] truncate" title={b.items?.nama}>
                  {b.items?.nama}
                </div>
                <div className="text-[11px] text-muted font-mono">{b.items?.kode}</div>
              </>
            ),
            cardCell: (b) => (
              <>
                <div>{b.items?.nama}</div>
                <div className="text-[11px] text-muted font-mono font-normal">
                  {b.items?.kode}
                </div>
              </>
            ),
          },
          {
            key: "lot",
            header: "Lot Supplier",
            sort: "lot",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (b) => (
              <span className="font-mono text-[12px]">
                {b.no_lot_supplier || "-"}
              </span>
            ),
          },
          {
            key: "diterima",
            header: "Diterima",
            sort: "diterima",
            cardLabel: "Tanggal Terima",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (b) => formatTanggal(b.tanggal_terima),
          },
          {
            key: "exp",
            header: "Exp",
            sort: "exp",
            cardLabel: "Kedaluwarsa",
            role: "secondary",
            className: "whitespace-nowrap text-[12.5px]",
            cell: (b) =>
              b.exp_date
                ? new Date(b.exp_date + "T00:00:00").toLocaleDateString("id-ID", {
                    month: "short",
                    year: "numeric",
                  })
                : "-",
          },
          {
            key: "qty",
            header: "Qty",
            sort: "qty",
            cardLabel: "Qty Karantina",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap font-medium",
            cell: (b) =>
              `${Number(b.qty_karantina).toLocaleString("id-ID")} ${b.items?.satuan}`,
          },
          {
            key: "supplier",
            header: "Supplier",
            sort: "supplier",
            role: "secondary",
            cell: (b) => (
              <div
                className="max-w-[150px] truncate text-[12.5px]"
                title={b.supplier_nama || undefined}
              >
                {b.supplier_nama || "-"}
              </div>
            ),
            cardCell: (b) => b.supplier_nama || "-",
          },
          {
            key: "aksi",
            header: "Aksi",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (b) => (
              <RowActions>
                <IconAction
                  icon={Tags}
                  label="Cetak label karantina"
                  href={`/print/label/lot/${b.id}`}
                />
                <Link
                  href={`/qc-incoming/${b.id}`}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-botanical-700 text-white text-[12px] font-medium hover:bg-botanical-800 transition-colors"
                >
                  <ClipboardList size={13} /> Uji &amp; Putuskan
                </Link>
              </RowActions>
            ),
          },
        ]}
      />
      <Pagination info={info} />

      {/* ===== Riwayat keputusan QC ===== */}
      <h3 className="font-display text-[15px] font-semibold text-ink mt-6 mb-2">
        Riwayat Keputusan QC{" "}
        <span className="font-sans text-[12px] font-normal text-muted">
          · 15 terakhir
        </span>
      </h3>
      <DataTable
        rows={logs}
        rowKey={(l) => l.id}
        minWidth={720}
        empty="Belum ada riwayat."
        columns={[
          {
            key: "tanggal",
            header: "Tanggal",
            role: "subtitle",
            className: "whitespace-nowrap",
            cell: (l) => formatTanggal(l.qc_tanggal),
          },
          {
            key: "item",
            header: "Item",
            role: "title",
            cell: (l) => (
              <>
                <div className="max-w-[200px] truncate" title={l.items?.nama}>
                  {l.items?.nama}
                </div>
                <div className="text-[11px] text-muted font-mono">
                  {l.items?.kode}
                  {l.no_lot_supplier ? ` · lot ${l.no_lot_supplier}` : ""}
                </div>
              </>
            ),
            cardCell: (l) => (
              <>
                <div>{l.items?.nama}</div>
                <div className="text-[11px] text-muted font-mono font-normal">
                  {l.items?.kode}
                  {l.no_lot_supplier ? ` · lot ${l.no_lot_supplier}` : ""}
                </div>
              </>
            ),
          },
          {
            key: "keputusan",
            header: "Keputusan",
            role: "badge",
            cell: (l) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                  l.qc_status === "Released"
                    ? "bg-botanical-100 text-botanical-700"
                    : "bg-clay-100 text-clay-600"
                }`}
              >
                {l.qc_status}
              </span>
            ),
          },
          {
            key: "oleh",
            header: "Oleh",
            cardLabel: "Diputuskan oleh",
            role: "primary",
            className: "whitespace-nowrap text-[12.5px]",
            cell: (l) => l.qc_oleh || "-",
          },
          {
            key: "catatan",
            header: "Catatan",
            role: "secondary",
            cell: (l) => (
              <div
                className="max-w-[240px] line-clamp-2 text-[12.5px]"
                title={l.qc_note || undefined}
              >
                {l.qc_note || "-"}
              </div>
            ),
            cardCell: (l) => (
              <span className="text-[12.5px]">{l.qc_note || "-"}</span>
            ),
          },
          {
            key: "aksi",
            header: "Dokumen",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (l) => (
              <RowActions>
                <IconAction
                  icon={Eye}
                  label="Lihat detail lembar uji"
                  href={`/qc-incoming/${l.id}/detail`}
                  tone="primary"
                />
                <IconAction
                  icon={Printer}
                  label="Cetak lembar QC"
                  href={`/print/qc/${l.id}`}
                />
                <IconAction
                  icon={Tags}
                  label={
                    l.qc_status === "Released"
                      ? "Cetak label release"
                      : "Cetak label reject"
                  }
                  href={`/print/label/lot/${l.id}`}
                />
              </RowActions>
            ),
          },
        ]}
      />
    </BahanShell>
  );
}
