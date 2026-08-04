import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ExpiryActions from "./ExpiryActions";
import { addDaysStr, localDateStr } from "@/lib/dates";
import DataTable from "@/components/DataTable";

type BatchRow = {
  id: string;
  no_lot_supplier: string | null;
  exp_date: string;
  qty_sisa: number;
  supplier_nama: string | null;
  retest_note: string | null;
  items: { kode: string; nama: string; satuan: string } | null;
};

type LogRow = {
  tipe: string;
  qty: number | null;
  exp_lama: string | null;
  exp_baru: string | null;
  catatan: string | null;
  created_at: string;
  items: { nama: string } | null;
};

function formatTanggal(iso: string) {
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ExpiryPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const todayStr = localDateStr();
  const in60 = addDaysStr(todayStr, 60);

  const [{ data: batches }, { data: logs }] = await Promise.all([
    supabase
      .from("purchase_batches")
      .select(
        "id, no_lot_supplier, exp_date, qty_sisa, supplier_nama, retest_note, items(kode, nama, satuan)"
      )
      .eq("organization_id", organizationId)
      .gt("qty_sisa", 0)
      .not("exp_date", "is", null)
      .lte("exp_date", in60)
      .order("exp_date"),
    supabase
      .from("batch_dispositions")
      .select("tipe, qty, exp_lama, exp_baru, catatan, created_at, items(nama)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const list = (batches || []) as unknown as BatchRow[];
  const logList = (logs || []) as unknown as LogRow[];
  const expiredCount = list.filter((b) => b.exp_date < todayStr).length;

  return (
    <div className="max-w-4xl">
      <Link
        href="/items"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Stock Items
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Expiry Control
      </h1>
      <p className="text-muted text-sm mb-6">
        {list.length} batch mendekati / lewat expired
        {expiredCount > 0 ? `, ${expiredCount} sudah expired` : ""}. Tindak
        lanjut: Re-test (perpanjang exp) atau Musnahkan.
      </p>

      <div className="mb-6">
        <DataTable
          rows={list}
          rowKey={(b) => b.id}
          minWidth={820}
          rowClassName={(b) => (b.exp_date < todayStr ? "bg-clay-100/30" : "")}
          empty="Tidak ada batch yang perlu tindak lanjut 🎉"
          columns={[
            {
              key: "item",
              header: "Item",
              role: "title",
              cell: (b) => (
                <>
                  <div className="font-medium max-w-[200px] truncate">
                    {b.items?.nama}
                  </div>
                  <div className="text-[11px] text-muted font-mono">
                    {b.items?.kode}
                    {b.retest_note && (
                      <span className="ml-1.5 text-botanical-700">
                        · re-test: {b.retest_note}
                      </span>
                    )}
                  </div>
                </>
              ),
              cardCell: (b) => (
                <>
                  <div>{b.items?.nama}</div>
                  <div className="text-[11px] text-muted font-mono font-normal">
                    {b.items?.kode}
                    {b.retest_note && (
                      <span className="ml-1.5 text-botanical-700">
                        · re-test: {b.retest_note}
                      </span>
                    )}
                  </div>
                </>
              ),
            },
            {
              key: "lot",
              header: "Lot Supplier",
              role: "primary",
              className: "whitespace-nowrap",
              cell: (b) => (
                <span className="font-mono text-[12px]">
                  {b.no_lot_supplier || "-"}
                </span>
              ),
            },
            {
              key: "exp",
              header: "Exp Date",
              role: "badge",
              className: "whitespace-nowrap",
              cell: (b) => {
                const expired = b.exp_date < todayStr;
                return (
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium whitespace-nowrap ${
                      expired
                        ? "bg-clay-100 text-clay-600"
                        : "bg-amber-100 text-amber-500"
                    }`}
                  >
                    {formatTanggal(b.exp_date)}
                    {expired ? " · expired" : ""}
                  </span>
                );
              },
            },
            {
              key: "qty",
              header: "Qty Sisa",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (b) =>
                `${Number(b.qty_sisa).toLocaleString("id-ID")} ${b.items?.satuan}`,
            },
            {
              key: "supplier",
              header: "Supplier",
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
              header: "Tindak Lanjut",
              role: "actions",
              align: "right",
              cell: (b) => (
                <ExpiryActions
                  batchId={b.id}
                  itemNama={b.items?.nama || ""}
                  qtySisa={Number(b.qty_sisa)}
                  satuan={b.items?.satuan || ""}
                />
              ),
            },
          ]}
        />
      </div>

      {/* ===== Audit log ===== */}
      <h2 className="font-display text-[15px] font-semibold text-ink mb-2">
        Riwayat Tindak Lanjut
      </h2>
      <DataTable
        rows={logList}
        rowKey={(_l, i) => String(i)}
        minWidth={720}
        empty="Belum ada riwayat."
        columns={[
          {
            key: "tanggal",
            header: "Tanggal",
            role: "subtitle",
            className: "whitespace-nowrap",
            cell: (l) => formatTanggal(l.created_at),
          },
          {
            key: "item",
            header: "Item",
            role: "title",
            cell: (l) => (
              <div className="max-w-[200px] truncate">{l.items?.nama}</div>
            ),
            cardCell: (l) => l.items?.nama,
          },
          {
            key: "tindakan",
            header: "Tindakan",
            role: "badge",
            cell: (l) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                  l.tipe === "Re-test"
                    ? "bg-botanical-100 text-botanical-700"
                    : "bg-clay-100 text-clay-600"
                }`}
              >
                {l.tipe}
              </span>
            ),
          },
          {
            key: "detail",
            header: "Detail",
            role: "primary",
            className: "text-[12.5px]",
            cell: (l) =>
              `${
                l.tipe === "Re-test"
                  ? `${l.exp_lama ? formatTanggal(l.exp_lama) : ""} → ${
                      l.exp_baru ? formatTanggal(l.exp_baru) : ""
                    }`
                  : `${Number(l.qty || 0).toLocaleString("id-ID")} dimusnahkan`
              }${l.catatan ? ` · ${l.catatan}` : ""}`,
          },
        ]}
      />
    </div>
  );
}
