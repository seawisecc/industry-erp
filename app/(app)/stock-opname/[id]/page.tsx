import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import DataTable from "@/components/DataTable";
import CancelTxButton from "@/components/CancelTxButton";
import { localDateStr } from "@/lib/dates";
import { getFinishedStock } from "@/lib/salesStock";
import { varianKey } from "@/lib/clientPrice";
import { cancelStockOpname } from "../actions";
import { judulGolongan, URUT_GOLONGAN } from "../golongan";
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
  id: string;
  item_id: string | null;
  product_id: string | null;
  varian: string | null;
  qty_sistem: number;
  qty_fisik: number | null;
  catatan: string | null;
  items: { kode: string; nama: string; satuan: string; kategori: string } | null;
  products: { kode: string | null; nama_produk: string } | null;
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
      "id, item_id, product_id, varian, qty_sistem, qty_fisik, catatan, items(kode, nama, satuan, kategori), products(kode, nama_produk)"
    )
    .eq("opname_id", id)
    .eq("organization_id", organizationId);

  const itemList = (rawItems || []) as unknown as ItemRaw[];
  const adaBahan = itemList.some((r) => r.item_id !== null);
  const adaProduk = itemList.some((r) => r.product_id !== null);

  // Stok sistem SEKARANG, untuk mendeteksi mutasi yang terjadi setelah
  // opname dibuka. Perbandingannya dipakai di layar, bukan disimpan.
  //
  // Dua sumber terpisah karena stoknya memang disimpan berbeda: bahan ada
  // di purchase_batches, produk jadi dihitung dari mutasinya.
  const stokBahan = new Map<string, number>();
  if (adaBahan) {
    const { data: batches } = await supabase
      .from("purchase_batches")
      .select("item_id, qty_sisa")
      .eq("organization_id", organizationId)
      .gt("qty_sisa", 0);
    for (const b of (batches || []) as { item_id: string; qty_sisa: number }[]) {
      stokBahan.set(b.item_id, (stokBahan.get(b.item_id) || 0) + Number(b.qty_sisa));
    }
  }
  const stokProduk = adaProduk
    ? await getFinishedStock(organizationId!)
    : new Map<string, { available: number }>();

  const rows: OpnameRow[] = itemList
    .map((r): OpnameRow => {
      if (r.item_id) {
        const kategori = r.items?.kategori;
        return {
          id: r.id,
          golongan: kategori === "Kemasan" ? "Kemasan" : "Bahan Baku",
          kode: r.items?.kode || "-",
          nama: r.items?.nama || "(item terhapus)",
          varian: null,
          satuan: r.items?.satuan || "",
          qty_sistem: Number(r.qty_sistem),
          stok_kini: stokBahan.get(r.item_id) || 0,
          qty_fisik: r.qty_fisik == null ? null : Number(r.qty_fisik),
          catatan: r.catatan,
        };
      }
      const vk = varianKey(r.varian);
      return {
        id: r.id,
        golongan: "Produk Jadi",
        kode: r.products?.kode || "-",
        nama: r.products?.nama_produk || "(produk terhapus)",
        varian: vk,
        satuan: "pcs",
        qty_sistem: Number(r.qty_sistem),
        stok_kini: stokProduk.get(`${r.product_id}|${vk}`)?.available || 0,
        qty_fisik: r.qty_fisik == null ? null : Number(r.qty_fisik),
        catatan: r.catatan,
      };
    })
    .sort(
      (a, b) =>
        URUT_GOLONGAN[a.golongan] - URUT_GOLONGAN[b.golongan] ||
        a.kode.localeCompare(b.kode) ||
        a.nama.localeCompare(b.nama) ||
        (a.varian || "").localeCompare(b.varian || "")
    );

  // Koreksi produk jadi yang dihasilkan opname ini. Berbeda dari
  // adjustment bahan: koreksi produk jadi tidak punya dokumen sendiri,
  // jadi jumlahnya ditampilkan langsung di sini.
  const { count: jumlahKoreksiFg } = await supabase
    .from("finished_goods_adjustments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("opname_id", id);

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
        {formatTanggal(op.tanggal)} · cakupan {op.kategori || "semua golongan"}{" "}
        · {rows.length} baris
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
                Baris Dihitung
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
                Penyesuaian
              </div>
              <div className="font-medium">
                {op.adjustment_id ? (
                  <Link
                    href={`/data-migration/adjustment/${op.adjustment_id}`}
                    className="text-botanical-700 hover:underline"
                  >
                    Lihat penyesuaian bahan
                  </Link>
                ) : !jumlahKoreksiFg ? (
                  <span className="text-muted">tanpa penyesuaian</span>
                ) : null}
                {jumlahKoreksiFg ? (
                  <div className="text-[12px] text-muted font-normal">
                    {jumlahKoreksiFg} koreksi produk jadi
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            minWidth={860}
            empty="Tidak ada baris pada opname ini."
            groupBy={{
              key: (r) => r.golongan,
              header: (g) =>
                judulGolongan(
                  g.key,
                  g.rows.length,
                  g.rows.filter((r) => r.qty_fisik !== null).length
                ),
            }}
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
                      {r.kode}
                      {r.varian && r.varian !== "-" ? ` · ${r.varian}` : ""}
                    </div>
                  </>
                ),
                cardCell: (r) => (
                  <>
                    <div>{r.nama}</div>
                    <div className="text-[11px] text-muted font-mono font-normal">
                      {r.kode}
                      {r.varian && r.varian !== "-" ? ` · ${r.varian}` : ""}
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
