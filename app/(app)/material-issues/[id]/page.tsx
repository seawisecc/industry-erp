import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DataTable from "@/components/DataTable";
import CancelTxButton from "@/components/CancelTxButton";
import TujuanBadge from "../TujuanBadge";
import { cancelMaterialIssue } from "../actions";

type IssueDetail = {
  id: string;
  no_pemakaian: string;
  tanggal: string;
  tujuan: string;
  catatan: string | null;
  total_biaya: number;
  dibuat_oleh: string | null;
  material_issue_items: {
    qty: number;
    harga_per_unit: number;
    subtotal: number;
    items: { kode: string; nama: string; satuan: string } | null;
    purchase_batches: {
      no_lot_supplier: string | null;
      exp_date: string | null;
      supplier_nama: string | null;
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
function formatExp(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    month: "short",
    year: "numeric",
  });
}
function formatId(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export default async function MaterialIssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

  const { data } = await supabase
    .from("material_issues")
    .select(
      `id, no_pemakaian, tanggal, tujuan, catatan, total_biaya, dibuat_oleh,
       material_issue_items(qty, harga_per_unit, subtotal,
         items(kode, nama, satuan),
         purchase_batches(no_lot_supplier, exp_date, supplier_nama))`
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const issue = data as unknown as IssueDetail;

  const canCancel = Boolean(
    isSuperAdmin || profile?.role === "Admin" || profile?.can_cancel
  );

  const namaOleh = issue.dibuat_oleh
    ? (
        await supabase
          .from("profiles")
          .select("nama")
          .eq("id", issue.dibuat_oleh)
          .maybeSingle()
      ).data?.nama
    : null;

  return (
    <div className="max-w-5xl">
      <Link
        href="/material-issues"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Material Issue
      </Link>

      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">
          {issue.no_pemakaian}
        </h1>
        <TujuanBadge tujuan={issue.tujuan} />
        <div className="ml-auto">
          <CancelTxButton
            id={issue.id}
            action={cancelMaterialIssue}
            canCancel={canCancel}
            label="Batalkan Pemakaian"
            judul="Batalkan Pemakaian Bahan"
            keterangan="Seluruh qty dikembalikan ke batch asalnya dan dokumen ini dihapus. Stok bahan akan naik kembali."
            redirectTo="/material-issues"
          />
        </div>
      </div>
      <p className="text-muted text-sm mb-6">
        {formatTanggal(issue.tanggal)}
        {namaOleh ? ` · oleh ${namaOleh}` : ""} · nilai bahan{" "}
        {formatRupiah(Number(issue.total_biaya))}
      </p>

      {issue.catatan && (
        <div className="glass rounded-2xl px-5 py-4 mb-5 text-[13px]">
          <span className="text-muted">Catatan: </span>
          {issue.catatan}
        </div>
      )}

      <DataTable
        rows={issue.material_issue_items}
        rowKey={(_r, i) => String(i)}
        minWidth={820}
        empty="Tidak ada bahan pada dokumen ini."
        columns={[
          {
            key: "item",
            header: "Bahan",
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
            key: "exp",
            header: "Exp",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (r) => formatExp(r.purchase_batches?.exp_date || null),
          },
          {
            key: "qty",
            header: "Qty",
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
            <tr>
              <td colSpan={5} className="px-4 py-2.5 text-right font-semibold">
                Total Nilai Bahan
              </td>
              <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                {formatRupiah(Number(issue.total_biaya))}
              </td>
            </tr>
          ),
          card: (
            <div className="flex justify-between text-[13px] font-semibold">
              <span>Total Nilai Bahan</span>
              <span>{formatRupiah(Number(issue.total_biaya))}</span>
            </div>
          ),
        }}
      />
      <p className="text-[11.5px] text-muted px-1 pt-2">
        Satu bahan bisa muncul beberapa baris kalau pemotongan FEFO menyeberang
        lot. Biayanya memakai harga lot yang benar-benar terpakai.
      </p>
    </div>
  );
}
