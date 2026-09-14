import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import {
  Plus,
  Wand2,
  Printer,
  Pencil,
  Eye,
  ClipboardClock,
  Truck,
} from "lucide-react";
import {
  hitungTotalPembelian,
  parsePurchaseTaxMode,
} from "@/lib/purchaseTax";
import PembelianShell from "@/components/PembelianShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import CancelTxButton from "@/components/CancelTxButton";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";
import StatCard from "@/components/StatCard";
import { getPoPipeline } from "@/lib/poPipeline";
import { cancelPO } from "./actions";
import {
  ilikeOrWithIds,
  pageInfo,
  parseListQuery,
  type SearchParams,
  orderFor,
} from "@/lib/pagination";

type POStatus =
  | "Dibuat"
  | "Disetujui"
  | "Dikirim"
  | "Diterima Sebagian"
  | "Selesai"
  | "Dibatalkan";

type PORow = {
  id: string;
  no_po: string | null;
  tanggal_po: string;
  status: POStatus;
  ppn_percent: number;
  tax_mode: string | null;
  tax_dpp_nilai_lain: boolean | null;
  top_days: number | null;
  suppliers: { nama: string } | null;
  po_items: {
    qty_pesan: number;
    harga_per_unit: number;
    items: { nama: string; satuan: string } | null;
  }[];
};

const STATUS_STYLE: Record<POStatus, string> = {
  Dibuat: "bg-white/70 text-muted border border-line",
  Disetujui: "bg-amber-100 text-amber-500",
  Dikirim: "bg-clay-100 text-clay-600",
  "Diterima Sebagian": "bg-botanical-100 text-botanical-700",
  Selesai: "bg-botanical-700 text-white",
  Dibatalkan: "bg-clay-100 text-clay-600",
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function formatAngka(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

/* ============================================================
   Catatan kecil isi PO, di bawah nama suppliernya.

   Dua PO ke supplier yang sama pada minggu yang sama cuma beda di
   isinya, dan tanpa catatan ini keduanya harus dibuka satu per satu
   untuk tahu mana yang sedang dicari.

   Yang tampil tiga baris pertama; sisanya dirangkum jadi satu entri
   "+n item lain" BESERTA nilainya, supaya rupiah di catatan tetap
   menutup seluruh isi PO. Catatan yang menyebut sebagian nilai saja
   akan terbaca seperti PO yang lebih murah daripada kolom Total di
   sebelahnya.

   Rupiahnya nilai baris apa adanya (qty x harga seperti yang tertulis
   di faktur), jadi pada PO Include angkanya sudah memuat pajak. Kolom
   Total yang menerapkan model pajaknya, dan itu memang pembagian yang
   sama dengan halaman cetak.
   ============================================================ */

const RINCIAN_TAMPIL = 3;

function rincianPO(po: PORow) {
  const baris = po.po_items.map((r) => {
    const nama = r.items?.nama || "Item terhapus";
    const satuan = r.items?.satuan || "";
    const qty = formatAngka(Number(r.qty_pesan));
    const nilai = Number(r.qty_pesan) * Number(r.harga_per_unit);
    return `${nama} ${qty}${satuan ? " " + satuan : ""} (${formatRupiah(nilai)})`;
  });

  if (baris.length === 0) return { ringkas: "Belum ada item.", lengkap: "" };

  const sisa = po.po_items.slice(RINCIAN_TAMPIL);
  const nilaiSisa = sisa.reduce(
    (s, r) => s + Number(r.qty_pesan) * Number(r.harga_per_unit),
    0
  );

  const ringkas =
    sisa.length === 0
      ? baris.join(" · ")
      : baris.slice(0, RINCIAN_TAMPIL).join(" · ") +
        ` · +${sisa.length} item lain (${formatRupiah(nilaiSisa)})`;

  return { ringkas, lengkap: baris.join(" · ") };
}

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const SORT: Record<string, string> = {
  no: "no_po",
  tanggal: "tanggal_po",
  top: "top_days",
  status: "status",
};

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  const canCancel =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_cancel;

  const sp = parseListQuery(await searchParams);

  const ord = orderFor(sp, SORT, { column: "created_at", ascending: false });

  // Ringkasan di atas tabel: PO yang belum di-approve, dan yang sudah
  // di-approve tapi barangnya belum diterima sama sekali. Begitu ada
  // penerimaan, PO-nya pindah ke ringkasan di halaman Receiving.
  const pipelineP = getPoPipeline(supabase, organizationId!, [
    "Dibuat",
    "Disetujui",
    "Dikirim",
  ]);

  // Nama supplier ada di tabel lain, cari id-nya dulu supaya PO tetap
  // bisa dicari lewat nama supplier, bukan cuma no. PO.
  let supplierIds: string[] = [];
  if (sp.q) {
    const { data: ss } = await supabase
      .from("suppliers")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("nama", `%${sp.q}%`)
      .limit(500);
    supplierIds = (ss || []).map((s) => s.id as string);
  }

  let query = supabase
    .from("purchase_orders")
    .select(
      "id, no_po, tanggal_po, status, ppn_percent, tax_mode, tax_dpp_nilai_lain, top_days, suppliers(nama), po_items(qty_pesan, harga_per_unit, items(nama, satuan))",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(
      ilikeOrWithIds(["no_po"], sp.q, "supplier_id", supplierIds)
    );
  if (sp.filter("status")) query = query.eq("status", sp.filter("status"));

  const { data: pos, count } = await query
    .order(ord.column, { ascending: ord.ascending })
    .range(sp.from, sp.to);

  const list = (pos || []) as unknown as PORow[];
  const info = pageInfo(sp.page, count, list.length);

  const pipeline = await pipelineP;
  const ringkas = (statuses: POStatus[]) => {
    const rows = (pipeline || []).filter((p) => statuses.includes(p.status));
    return {
      jumlah: rows.length,
      nilai: rows.reduce((s, p) => s + p.total, 0),
    };
  };
  const menunggu = ringkas(["Dibuat"]);
  const disetujui = ringkas(["Disetujui"]);
  const dikirim = ringkas(["Dikirim"]);

  /**
   * Nilai PO menurut model pajak yang dibekukan di dokumennya. Pada
   * Include totalnya berhenti di subtotal, pajaknya ada di dalam harga.
   */
  const totalPO = (po: PORow) => {
    const subtotal = po.po_items.reduce(
      (s, r) => s + Number(r.qty_pesan) * Number(r.harga_per_unit),
      0
    );
    return hitungTotalPembelian(
      subtotal,
      parsePurchaseTaxMode(po.tax_mode),
      Number(po.ppn_percent),
      po.tax_dpp_nilai_lain !== false
    ).total;
  };

  return (
    <PembelianShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Purchase Orders
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} PO, alur: Dibuat → Disetujui →
            Dikirim → Diterima
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Cetak rekap pengajuan. Cuma muncul kalau memang ada yang
              menunggu persetujuan: tombol yang mencetak kertas kosong
              lebih buruk daripada tidak ada tombol. Waktu ringkasannya
              gagal dimuat, jumlahnya tidak diketahui, jadi tombolnya
              tetap ditawarkan dan halaman cetaknya sendiri yang bilang
              kalau daftarnya kosong. */}
          {(pipeline === null || menunggu.jumlah > 0) && (
            <Link
              href="/print/po-pengajuan"
              className="inline-flex items-center gap-1.5 h-9 bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
            >
              <Printer size={14} /> Cetak Pengajuan
              {pipeline !== null && ` (${menunggu.jumlah})`}
            </Link>
          )}
          <Link
            href="/purchase-orders/guide"
            className="inline-flex items-center gap-1.5 h-9 bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
          >
            <Wand2 size={14} /> Guide Order
          </Link>
          <Link
            href="/purchase-orders/new"
            className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus size={15} /> Buat PO
          </Link>
        </div>
      </div>

      {pipeline ? (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link href="/purchase-orders?status=Dibuat" className="block">
            <StatCard
              icon={ClipboardClock}
              label="Menunggu Persetujuan"
              value={formatRupiah(menunggu.nilai)}
              sub={`${menunggu.jumlah.toLocaleString("id-ID")} PO belum di-approve`}
              tone={menunggu.jumlah > 0 ? "amber" : "botanical"}
            />
          </Link>
          <StatCard
            icon={Truck}
            label="Disetujui, Belum Diterima"
            value={formatRupiah(disetujui.nilai + dikirim.nilai)}
            sub={
              <>
                {(disetujui.jumlah + dikirim.jumlah).toLocaleString("id-ID")} PO
                {" · "}
                <Link
                  href="/purchase-orders?status=Disetujui"
                  className="underline decoration-line underline-offset-2 hover:text-ink"
                >
                  {disetujui.jumlah.toLocaleString("id-ID")} belum dikirim
                </Link>
                {", "}
                <Link
                  href="/purchase-orders?status=Dikirim"
                  className="underline decoration-line underline-offset-2 hover:text-ink"
                >
                  {dikirim.jumlah.toLocaleString("id-ID")} sudah dikirim
                </Link>
              </>
            }
          />
        </div>
      ) : (
        <p className="mt-4 text-[12.5px] text-clay-600">
          Ringkasan nilai PO gagal dimuat. Muat ulang halaman untuk mencoba lagi.
        </p>
      )}

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari no. PO / supplier..."
          info={info}
          filters={[
            {
              param: "status",
              label: "Semua Status",
              options: [
                "Dibuat",
                "Disetujui",
                "Dikirim",
                "Diterima Sebagian",
                "Selesai",
                "Dibatalkan",
              ].map((s) => ({ value: s, label: s })),
            },
          ]}
        />
      </div>
      <DataTable
        rows={list}
        rowKey={(po) => po.id}
        minWidth={960}
        empty={
          sp.q || sp.filter("status")
            ? "Tidak ada PO yang cocok dengan pencarian/filter."
            : "Belum ada Purchase Order."
        }
        columns={[
          {
            key: "no",
            header: "No. PO",
            sort: "no",
            role: "subtitle",
            cell: (po) => (
              <span className="font-mono text-[12.5px]">{po.no_po || "-"}</span>
            ),
          },
          {
            key: "tanggal",
            header: "Tanggal",
            sort: "tanggal",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (po) => formatTanggal(po.tanggal_po),
          },
          {
            key: "supplier",
            header: "Supplier",
            role: "title",
            cell: (po) => {
              const rincian = rincianPO(po);
              return (
                <div className="max-w-[280px]">
                  <div className="truncate font-medium">
                    {po.suppliers?.nama || "-"}
                  </div>
                  <div
                    className="text-[11px] text-muted leading-snug mt-0.5 line-clamp-2"
                    title={rincian.lengkap}
                  >
                    {rincian.ringkas}
                  </div>
                </div>
              );
            },
            cardCell: (po) => (
              <>
                {po.suppliers?.nama || "-"}
                <div className="text-[11.5px] font-normal text-muted leading-snug mt-0.5">
                  {rincianPO(po).ringkas}
                </div>
              </>
            ),
          },
          {
            key: "item",
            header: "Item",
            cardLabel: "Jumlah item",
            role: "secondary",
            cell: (po) => po.po_items.length,
          },
          {
            key: "total",
            header: "Total (incl. PPN)",
            cardLabel: "Total",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (po) => formatRupiah(totalPO(po)),
          },
          {
            key: "top",
            header: "TOP",
            sort: "top",
            cardLabel: "Termin (TOP)",
            role: "secondary",
            className: "whitespace-nowrap text-[12.5px]",
            cell: (po) =>
              po.top_days == null
                ? "-"
                : po.top_days === 0
                  ? "Tunai"
                  : `${po.top_days} hr`,
          },
          {
            key: "status",
            header: "Status",
            sort: "status",
            role: "badge",
            cell: (po) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium whitespace-nowrap ${STATUS_STYLE[po.status]}`}
              >
                {po.status}
              </span>
            ),
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (po) => {
              const editable = po.status === "Dibuat";
              return (
                <RowActions>
                  {canCancel &&
                    po.status !== "Selesai" &&
                    po.status !== "Diterima Sebagian" &&
                    po.status !== "Dibatalkan" && (
                      <CancelTxButton
                        id={po.id}
                        action={cancelPO}
                        canCancel={canCancel}
                        variant="icon"
                        label="Batalkan PO"
                        judul="Batalkan Purchase Order"
                        keterangan="PO akan ditandai Dibatalkan. Hanya bisa bila belum ada barang yang diterima."
                      />
                    )}
                  <IconAction
                    icon={Printer}
                    label="Cetak PO"
                    href={`/print/po/${po.id}`}
                  />
                  <IconAction
                    icon={editable ? Pencil : Eye}
                    label={editable ? "Edit PO" : "Lihat detail PO"}
                    href={`/purchase-orders/${po.id}/edit`}
                    tone="primary"
                  />
                </RowActions>
              );
            },
          },
        ]}
      />
      <Pagination info={info} />
    </PembelianShell>
  );
}
