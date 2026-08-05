import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import DataTable from "@/components/DataTable";
import CancelTxButton from "@/components/CancelTxButton";
import { localDateStr } from "@/lib/dates";
import { cancelStockOpname } from "../actions";
import OpnameCountForm, { type OpnameRow } from "../OpnameCountForm";

type OpnameDetail = {
  id: string;
  no_opname: string;
  tanggal: string;
  tanggal_selesai: string | null;
  kategori: string | null;
  status: string;
  catatan: string | null;
  adjustment_id: string | null;
  dibuat_oleh: string | null;
};

type ItemRaw = {
  item_id: string;
  qty_sistem: number;
  qty_fisik: number | null;
  catatan: string | null;
  items: { kode: string; nama: string; satuan: string; kategori: string } | null;
};

function formatTanggal(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function formatId(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
}

export default async function OpnameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

  const { data } = await supabase
    .from("stock_opnames")
    .select(
      "id, no_opname, tanggal, tanggal_selesai, kategori, status, catatan, adjustment_id, dibuat_oleh"
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const op = data as unknown as OpnameDetail;
  const berjalan = op.status === "Berjalan";

  const { data: rawItems } = await supabase
    .from("stock_opname_items")
    .select(
      "item_id, qty_sistem, qty_fisik, catatan, items(kode, nama, satuan, kategori)"
    )
    .eq("opname_id", id)
    .eq("organization_id", organizationId);

  const itemList = (rawItems || []) as unknown as ItemRaw[];

  // Stok sistem SEKARANG, untuk mendeteksi mutasi yang terjadi setelah
  // opname dibuka. Perbandingannya dipakai di layar, bukan disimpan.
  const stokKini = new Map<string, number>();
  if (itemList.length > 0) {
    const { data: batches } = await supabase
      .from("purchase_batches")
      .select("item_id, qty_sisa")
      .eq("organization_id", organizationId)
      .gt("qty_sisa", 0);
    for (const b of (batches || []) as { item_id: string; qty_sisa: number }[]) {
      stokKini.set(b.item_id, (stokKini.get(b.item_id) || 0) + Number(b.qty_sisa));
    }
  }

  const rows: OpnameRow[] = itemList
    .map((r) => ({
      item_id: r.item_id,
      kode: r.items?.kode || "-",
      nama: r.items?.nama || "(item terhapus)",
      satuan: r.items?.satuan || "",
      kategori: r.items?.kategori || "-",
      qty_sistem: Number(r.qty_sistem),
      stok_kini: stokKini.get(r.item_id) || 0,
      qty_fisik: r.qty_fisik == null ? null : Number(r.qty_fisik),
      catatan: r.catatan,
    }))
    .sort((a, b) => a.kode.localeCompare(b.kode));

  const namaOleh = op.dibuat_oleh
    ? (
        await supabase
          .from("profiles")
          .select("nama")
          .eq("id", op.dibuat_oleh)
          .maybeSingle()
      ).data?.nama
    : null;

  const canCancel = Boolean(
    isSuperAdmin || profile?.role === "Admin" || profile?.can_cancel
  );

  const terhitung = rows.filter((r) => r.qty_fisik !== null);
  const selisih = terhitung.filter(
    (r) => Math.abs((r.qty_fisik as number) - r.qty_sistem) > 0.000001
  );

  return (
    <div>
      <Link
        href="/stock-opname"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Stock Opname
      </Link>

      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {op.no_opname}
        </h1>
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
            berjalan
              ? "bg-amber-100 text-amber-500"
              : "bg-botanical-100 text-botanical-700"
          }`}
        >
          {op.status}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/print/stock-opname/${op.id}`}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-white border border-line text-ink text-[12.5px] font-medium hover:bg-porcelain transition-colors"
          >
            <Printer size={14} /> Lembar Hitung
          </Link>
          {berjalan && (
            <CancelTxButton
              id={op.id}
              action={cancelStockOpname}
              canCancel={canCancel}
              label="Batalkan Opname"
              judul="Batalkan Stock Opname"
              keterangan="Dokumen opname dan seluruh hasil hitung yang sudah diisi akan dihapus. Stok tidak berubah karena opname ini belum ditutup."
              redirectTo="/stock-opname"
            />
          )}
        </div>
      </div>
      <p className="text-muted text-sm mb-6">
        {formatTanggal(op.tanggal)} · cakupan {op.kategori || "semua item"} ·{" "}
        {rows.length} item
        {namaOleh ? ` · oleh ${namaOleh}` : ""}
        {op.tanggal_selesai
          ? ` · ditutup ${formatTanggal(op.tanggal_selesai)}`
          : ""}
      </p>

      {op.catatan && (
        <div className="glass rounded-2xl px-5 py-4 mb-5 text-[13px]">
          <span className="text-muted">Catatan: </span>
          {op.catatan}
        </div>
      )}

      {berjalan ? (
        <OpnameCountForm
          opnameId={op.id}
          rows={rows}
          hariIni={localDateStr()}
        />
      ) : (
        <>
          <div className="glass rounded-2xl p-5 mb-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
                Item Dihitung
              </div>
              <div className="font-medium">
                {terhitung.length} / {rows.length}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
                Selisih Ditemukan
              </div>
              <div className="font-medium text-clay-600">{selisih.length}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
                Ditutup
              </div>
              <div className="font-medium">
                {formatTanggal(op.tanggal_selesai)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
                Adjustment
              </div>
              <div className="font-medium">
                {op.adjustment_id ? (
                  <Link
                    href={`/data-migration/adjustment/${op.adjustment_id}`}
                    className="text-botanical-700 hover:underline"
                  >
                    Lihat penyesuaian
                  </Link>
                ) : (
                  <span className="text-muted">tanpa penyesuaian</span>
                )}
              </div>
            </div>
          </div>

          <DataTable
            rows={rows}
            rowKey={(r) => r.item_id}
            minWidth={860}
            empty="Tidak ada item pada opname ini."
            rowClassName={(r) =>
              r.qty_fisik !== null &&
              Math.abs(r.qty_fisik - r.qty_sistem) > 0.000001
                ? "bg-clay-100/25"
                : ""
            }
            columns={[
              {
                key: "item",
                header: "Item",
                role: "title",
                cell: (r) => (
                  <>
                    <div className="font-medium">{r.nama}</div>
                    <div className="text-[11px] text-muted font-mono">
                      {r.kode} · {r.kategori}
                    </div>
                  </>
                ),
                cardCell: (r) => (
                  <>
                    <div>{r.nama}</div>
                    <div className="text-[11px] text-muted font-mono font-normal">
                      {r.kode} · {r.kategori}
                    </div>
                  </>
                ),
              },
              {
                key: "sistem",
                header: "Stok Sistem",
                role: "primary",
                align: "right",
                className: "whitespace-nowrap",
                cell: (r) => `${formatId(r.qty_sistem)} ${r.satuan}`,
              },
              {
                key: "fisik",
                header: "Hitung Fisik",
                role: "primary",
                align: "right",
                className: "whitespace-nowrap",
                cell: (r) =>
                  r.qty_fisik === null ? (
                    <span className="text-muted">tidak dihitung</span>
                  ) : (
                    `${formatId(r.qty_fisik)} ${r.satuan}`
                  ),
              },
              {
                key: "selisih",
                header: "Selisih",
                role: "primary",
                align: "right",
                cell: (r) => {
                  if (r.qty_fisik === null)
                    return <span className="text-muted">-</span>;
                  const d = r.qty_fisik - r.qty_sistem;
                  if (Math.abs(d) < 0.000001)
                    return <span className="text-muted">cocok</span>;
                  return (
                    <span
                      className={`font-mono text-[12px] font-medium whitespace-nowrap ${
                        d > 0 ? "text-botanical-700" : "text-clay-600"
                      }`}
                    >
                      {d > 0 ? "+" : ""}
                      {formatId(d)}
                    </span>
                  );
                },
              },
              {
                key: "catatan",
                header: "Catatan",
                role: "secondary",
                cell: (r) => (
                  <div className="max-w-[220px] truncate">{r.catatan || "-"}</div>
                ),
                cardCell: (r) => r.catatan || "-",
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
