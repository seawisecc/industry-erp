import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import ReportSaleForm, { ConsItem } from "./ReportSaleForm";
import { clientPriceKey } from "@/lib/clientPrice";

type ConsDetail = {
  id: string;
  no_konsinyasi: string | null;
  tanggal_kirim: string;
  status: string;
  catatan: string | null;
  client_id: string;
  clients: { company_brand: string; cp: string | null } | null;
  consignment_items: {
    id: string;
    product_id: string;
    varian_ukuran: string | null;
    qty_kirim: number;
    qty_terjual: number;
    qty_retur: number;
    harga_jual: number;
    products: { nama_produk: string; brand: string | null } | null;
  }[];
};

export default async function ConsignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data } = await supabase
    .from("consignments")
    .select(
      `id, no_konsinyasi, tanggal_kirim, status, catatan, client_id,
       clients(company_brand, cp),
       consignment_items(id, product_id, varian_ukuran, qty_kirim, qty_terjual, qty_retur, harga_jual, products(nama_produk, brand))`
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const cons = data as unknown as ConsDetail;

  // Diskon khusus outlet ini. Diambil SEKARANG, bukan dibekukan saat
  // pengiriman: kesepakatan diskon berlaku pada saat barang laku, dan
  // itu yang ditagihkan.
  const { data: diskonRows } = await supabase
    .from("client_prices")
    .select("product_id, varian, diskon_persen")
    .eq("organization_id", organizationId)
    .eq("client_id", cons.client_id)
    .not("diskon_persen", "is", null);

  const diskonMap = new Map<string, number>();
  for (const d of (diskonRows || []) as {
    product_id: string;
    varian: string | null;
    diskon_persen: number | null;
  }[]) {
    if (d.diskon_persen == null) continue;
    diskonMap.set(
      clientPriceKey(cons.client_id, d.product_id, d.varian),
      Number(d.diskon_persen)
    );
  }

  const items: ConsItem[] = cons.consignment_items.map((it) => ({
    id: it.id,
    nama: it.products?.nama_produk || "-",
    brand: it.products?.brand || null,
    varian: it.varian_ukuran,
    qty_kirim: Number(it.qty_kirim),
    qty_terjual: Number(it.qty_terjual),
    qty_retur: Number(it.qty_retur),
    harga_jual: Number(it.harga_jual),
    diskon_persen:
      diskonMap.get(clientPriceKey(cons.client_id, it.product_id, it.varian_ukuran)) ??
      0,
  }));

  return (
    <div className="max-w-6xl">
      <Link
        href="/consignments"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Consignment
      </Link>

      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">
          <span className="font-mono text-[20px]">{cons.no_konsinyasi}</span>
        </h1>
        <span
          className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium ${
            cons.status === "Aktif"
              ? "bg-amber-100 text-amber-500"
              : "bg-botanical-100 text-botanical-700"
          }`}
        >
          {cons.status}
        </span>
        <Link
          href={`/print/konsinyasi/${cons.id}`}
          className="ml-auto flex items-center gap-1.5 bg-botanical-700 text-white text-[13px] font-medium px-3.5 py-2 rounded-lg hover:bg-botanical-800 transition-colors whitespace-nowrap"
        >
          <Printer size={15} /> Cetak Tanda Terima
        </Link>
      </div>
      <p className="text-muted text-sm mb-6">
        {cons.clients?.company_brand}
        {cons.clients?.cp ? ` · UP ${cons.clients.cp}` : ""}
        {cons.catatan ? `, ${cons.catatan}` : ""}
      </p>

      <ReportSaleForm
        consignmentId={cons.id}
        items={items}
        aktif={cons.status === "Aktif"}
      />
    </div>
  );
}
