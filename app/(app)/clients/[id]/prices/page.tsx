import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { varianKey } from "@/lib/clientPrice";
import ClientPriceForm, { type HargaOption } from "./ClientPriceForm";

type ProductRaw = {
  id: string;
  kode: string | null;
  nama_produk: string;
  aktif: boolean;
  product_variants: { nama_varian: string; harga_jual: number | null }[];
};

export default async function ClientPricesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: client }, { data: products }, { data: prices }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, kode, company_brand, kategori")
        .eq("id", id)
        .eq("organization_id", organizationId)
        .single(),
      // Seluruh kombinasi produk × varian, BUKAN lewat getSalesOptions:
      // di sana daftarnya dibangun dari stok yang ada, jadi produk yang
      // belum pernah diproduksi tidak muncul. Menyusun kesepakatan harga
      // justru sering dilakukan sebelum produksi pertama.
      // Produk NONAKTIF ikut ditarik. Kalau disaring, harga yang sudah
      // tersimpan untuk produk yang kemudian dinonaktifkan tidak punya
      // pasangan option — barisnya jadi tidak bisa dibaca dan ikut hilang
      // diam-diam waktu daftar disimpan ulang. Ditandai di labelnya saja.
      supabase
        .from("products")
        .select("id, kode, nama_produk, aktif, product_variants(nama_varian, harga_jual)")
        .eq("organization_id", organizationId)
        .order("kode"),
      supabase
        .from("client_prices")
        .select("product_id, varian, harga")
        .eq("organization_id", organizationId)
        .eq("client_id", id),
    ]);

  if (!client) notFound();

  const options: HargaOption[] = [];
  for (const p of (products || []) as unknown as ProductRaw[]) {
    const suffix = p.aktif ? "" : " · nonaktif";
    const varian = p.product_variants || [];
    if (varian.length === 0) {
      options.push({
        key: `${p.id}|-`,
        product_id: p.id,
        varian: "-",
        label: `${p.kode || ""}, ${p.nama_produk}${suffix}`,
        available: 0,
        service_id: null,
        harga_master: null,
      });
      continue;
    }
    for (const v of varian) {
      const vk = varianKey(v.nama_varian);
      options.push({
        key: `${p.id}|${vk}`,
        product_id: p.id,
        varian: vk,
        label: `${p.kode || ""}, ${p.nama_produk}${vk !== "-" ? ` (${vk})` : ""}${suffix}`,
        available: 0,
        service_id: null,
        harga_master: v.harga_jual == null ? null : Number(v.harga_jual),
      });
    }
  }
  options.sort((a, b) => a.label.localeCompare(b.label));

  const awal = ((prices || []) as {
    product_id: string;
    varian: string | null;
    harga: number;
  }[]).map((r) => ({
    key: `${r.product_id}|${varianKey(r.varian)}`,
    harga: Number(r.harga),
  }));

  // Harga yang produk/variannya sudah tidak ada lagi (mis. varian dihapus
  // lewat Edit Produk) tidak punya option yang cocok. Dibuang di sini
  // supaya barisnya tidak muncul kosong tanpa nama di layar.
  const keySah = new Set(options.map((o) => o.key));
  const awalSah = awal.filter((a) => keySah.has(a.key));

  return (
    <div className="max-w-5xl">
      <Link
        href="/clients"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Clients
      </Link>

      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Harga Khusus
        </h1>
        <span className="font-mono text-[13px] text-muted">{client.kode}</span>
      </div>
      <p className="text-muted text-sm mb-6">
        {client.company_brand}
        {client.kategori ? ` · ${client.kategori}` : ""} · dipakai otomatis di
        Invoice, POS, dan Konsinyasi begitu client ini dipilih.
      </p>

      {options.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-muted text-[13px]">
            Belum ada produk terdaftar. Tambahkan produk &amp; varian dulu di
            menu Products.
          </p>
        </div>
      ) : (
        <ClientPriceForm
          clientId={client.id}
          options={options}
          awal={awalSah}
        />
      )}
    </div>
  );
}
