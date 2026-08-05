import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import DataTable from "@/components/DataTable";
import CancelTxButton from "@/components/CancelTxButton";
import AlasanBadge from "../AlasanBadge";
import { cancelPurchaseReturn } from "../actions";
import { sisaHutang } from "@/lib/purchaseReturn";

type ReturDetail = {
  id: string;
  no_retur: string;
  tanggal: string;
  supplier_nama: string | null;
  alasan: string;
  catatan: string | null;
  total_nilai: number;
  dibuat_oleh: string | null;
  receivings: {
    no_invoice: string | null;
    ppn_percent: number;
    total_invoice: number;
    total_retur: number;
  } | null;
  purchase_return_items: {
    qty: number;
    qty_dari_karantina: number;
    qty_dari_sisa: number;
    harga_per_unit: number;
    subtotal: number;
    items: { kode: string; nama: string; satuan: string } | null;
    purchase_batches: {
      no_lot_supplier: string | null;
      exp_date: string | null;
      qc_status: string | null;
    } | null;
  }[];
};

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function formatId(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export default async function PurchaseReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

  const { data } = await supabase
    .from("purchase_returns")
    .select(
      `id, no_retur, tanggal, supplier_nama, alasan, catatan, total_nilai, dibuat_oleh,
       receivings(no_invoice, ppn_percent, total_invoice, total_retur),
       purchase_return_items(qty, qty_dari_karantina, qty_dari_sisa, harga_per_unit, subtotal,
         items(kode, nama, satuan),
         purchase_batches(no_lot_supplier, exp_date, qc_status))`
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const retur = data as unknown as ReturDetail;

  const canCancel = Boolean(
    isSuperAdmin || profile?.role === "Admin" || profile?.can_cancel
  );

  const namaOleh = retur.dibuat_oleh
    ? (
        await supabase
          .from("profiles")
          .select("nama")
          .eq("id", retur.dibuat_oleh)
          .maybeSingle()
      ).data?.nama
    : null;

  const subtotal = retur.purchase_return_items.reduce(
    (s, r) => s + Number(r.subtotal),
    0
  );
  const ppn = Number(retur.total_nilai) - subtotal;

  return (
    <div className="max-w-5xl">
      <Link
        href="/purchase-returns"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Purchase Return
      </Link>

      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {retur.no_retur}
        </h1>
        <AlasanBadge alasan={retur.alasan} />
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/print/purchase-return/${retur.id}`}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-white border border-line text-ink text-[12.5px] font-medium hover:bg-porcelain transition-colors"
          >
            <Printer size={14} /> Cetak
          </Link>
          <CancelTxButton
            id={retur.id}
            action={cancelPurchaseReturn}
            canCancel={canCancel}
            label="Batalkan Retur"
            judul="Batalkan Retur Pembelian"
            keterangan="Qty dikembalikan ke stok asalnya (karantina atau stok siap pakai), tagihan faktur dipulihkan, dan dokumen ini dihapus. Lot yang sudah ditolak QC stoknya tidak ikut dikembalikan karena memang sudah dihapus sejak keputusan QC."
            redirectTo="/purchase-returns"
          />
        </div>
      </div>
      <p className="text-muted text-sm mb-6">
        {retur.supplier_nama || "-"} · {formatTanggal(retur.tanggal)}
        {namaOleh ? ` · oleh ${namaOleh}` : ""} · faktur{" "}
        <span className="font-mono">
          {retur.receivings?.no_invoice || "(tanpa nomor)"}
        </span>
      </p>

      {retur.catatan && (
        <div className="glass rounded-2xl px-5 py-4 mb-5 text-[13px]">
          <span className="text-muted">Catatan: </span>
          {retur.catatan}
        </div>
      )}

      {/* ===== Dampak ke tagihan ===== */}
      {retur.receivings && (
        <div className="glass rounded-2xl p-5 mb-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Nilai Faktur
            </div>
            <div className="font-medium">
              {formatRupiah(Number(retur.receivings.total_invoice))}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Retur Ini
            </div>
            <div className="font-medium text-clay-600">
              − {formatRupiah(Number(retur.total_nilai))}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Total Retur Faktur
            </div>
            <div className="font-medium">
              {formatRupiah(Number(retur.receivings.total_retur))}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Sisa Tagihan
            </div>
            <div className="font-semibold text-botanical-700">
              {formatRupiah(
                sisaHutang(
                  Number(retur.receivings.total_invoice),
                  Number(retur.receivings.total_retur)
                )
              )}
            </div>
          </div>
        </div>
      )}

      <DataTable
        rows={retur.purchase_return_items}
        rowKey={(_r, i) => String(i)}
        minWidth={860}
        empty="Tidak ada barang pada dokumen ini."
        columns={[
          {
            key: "item",
            header: "Barang",
            role: "title",
            cell: (r) => (
              <>
                <span className="font-mono text-[11.5px] text-botanical-700 mr-2">
                  {r.items?.kode}
                </span>
                {r.items?.nama}
              </>
            ),
            cardCell: (r) => (
              <>
                <div>{r.items?.nama}</div>
                <div className="text-[11.5px] text-muted font-mono font-normal">
                  {r.items?.kode}
                </div>
              </>
            ),
          },
          {
            key: "lot",
            header: "Lot Supplier",
            role: "secondary",
            className: "font-mono text-[11.5px] whitespace-nowrap",
            cell: (r) => r.purchase_batches?.no_lot_supplier || "-",
          },
          {
            key: "stok",
            header: "Dampak Stok",
            role: "secondary",
            className: "whitespace-nowrap text-[12px]",
            cell: (r) => {
              const kar = Number(r.qty_dari_karantina);
              const sis = Number(r.qty_dari_sisa);
              if (kar <= 0 && sis <= 0)
                return (
                  <span className="text-muted">
                    tidak dipotong (sudah hangus di QC)
                  </span>
                );
              return [
                kar > 0 ? `karantina −${formatId(kar)}` : null,
                sis > 0 ? `stok −${formatId(sis)}` : null,
              ]
                .filter(Boolean)
                .join(", ");
            },
          },
          {
            key: "qty",
            header: "Qty Retur",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => `${formatId(Number(r.qty))} ${r.items?.satuan ?? ""}`,
          },
          {
            key: "harga",
            header: "Harga/Unit",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => formatRupiah(Number(r.harga_per_unit)),
          },
          {
            key: "subtotal",
            header: "Subtotal",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap font-medium",
            cell: (r) => formatRupiah(Number(r.subtotal)),
          },
        ]}
        footer={{
          row: (
            <>
              <tr>
                <td colSpan={5} className="px-4 py-2 text-right text-muted">
                  Sub-Total
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {formatRupiah(subtotal)}
                </td>
              </tr>
              <tr>
                <td colSpan={5} className="px-4 py-2 text-right text-muted">
                  PPN {Number(retur.receivings?.ppn_percent ?? 0).toLocaleString("id-ID")}%
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {formatRupiah(ppn)}
                </td>
              </tr>
              <tr>
                <td colSpan={5} className="px-4 py-2.5 text-right font-semibold">
                  Nilai Retur
                </td>
                <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                  {formatRupiah(Number(retur.total_nilai))}
                </td>
              </tr>
            </>
          ),
          card: (
            <div className="flex flex-col gap-1 text-[13px]">
              <div className="flex justify-between text-muted">
                <span>Sub-Total</span>
                <span>{formatRupiah(subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>PPN</span>
                <span>{formatRupiah(ppn)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Nilai Retur</span>
                <span>{formatRupiah(Number(retur.total_nilai))}</span>
              </div>
            </div>
          ),
        }}
      />
    </div>
  );
}
