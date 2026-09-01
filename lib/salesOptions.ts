import { createClient } from "@/lib/supabase/server";
import { getFinishedStock } from "@/lib/salesStock";
import {
  clientPriceKey,
  type ClientDiscountMap,
  type ClientPriceMap,
} from "@/lib/clientPrice";

export type ClientOpt = { id: string; kode: string | null; company_brand: string };

export type ProductVariantOpt = {
  key: string;
  product_id: string; // "" untuk jasa
  varian: string;
  label: string;
  /** brand pemilik produk, dipisah dari label supaya bisa ditampilkan lebih redup */
  brand: string | null;
  available: number;
  harga_jual: number | null;
  service_id: string | null; // terisi bila baris ini layanan jasa
};



/**
 * Opsi client aktif + produk-varian dengan stok tersedia, dipakai Invoice,
 * POS, Konsinyasi. includeServices: sertakan layanan jasa (Invoice & POS saja -
 * jasa tidak bisa dikonsinyasikan).
 */
export async function getSalesOptions(
  organizationId: string,
  { includeServices = false }: { includeServices?: boolean } = {}
) {
  const supabase = await createClient();

  const [
    { data: clients },
    { data: products },
    { data: variants },
    stock,
    { data: hargaKhusus },
  ] = await Promise.all([
      supabase
        .from("clients")
        .select("id, kode, company_brand")
        .eq("organization_id", organizationId)
        .eq("aktif", true)
        .order("company_brand"),
      supabase
        .from("products")
        .select("id, kode, nama_produk, brand")
        .eq("organization_id", organizationId)
        .order("kode"),
      supabase
        .from("product_variants")
        .select("product_id, nama_varian, harga_jual")
        .eq("organization_id", organizationId),
      getFinishedStock(organizationId),
      // Seluruh harga khusus organisasi ditarik sekali di sini, bukan
      // per client lewat server action. Datanya kecil (satu baris per
      // kesepakatan harga, bukan per transaksi) dan dengan begini
      // penggantian client di form langsung memakai harganya tanpa
      // round-trip dan tanpa state loading yang bisa balapan.
      supabase
        .from("client_prices")
        .select("client_id, product_id, varian, harga")
        .eq("organization_id", organizationId),
    ]);

  // Harga jual per (produk|varian) dari master produk
  const hargaMap = new Map<string, number>();
  for (const v of (variants || []) as {
    product_id: string;
    nama_varian: string;
    harga_jual: number | null;
  }[]) {
    if (v.harga_jual != null) {
      hargaMap.set(`${v.product_id}|${v.nama_varian}`, Number(v.harga_jual));
    }
  }

  const productMap = new Map(
    (
      (products || []) as {
        id: string;
        kode: string | null;
        nama_produk: string;
        brand: string | null;
      }[]
    ).map((p) => [p.id, p])
  );

  const options: ProductVariantOpt[] = [];
  for (const s of stock.values()) {
    const p = productMap.get(s.product_id);
    if (!p) continue;
    options.push({
      key: `${s.product_id}|${s.varian}`,
      product_id: s.product_id,
      varian: s.varian,
      label: `${p.kode || ""}, ${p.nama_produk}${s.varian !== "-" ? ` (${s.varian})` : ""}`,
      brand: p.brand,
      available: s.available,
      harga_jual: hargaMap.get(`${s.product_id}|${s.varian}`) ?? null,
      service_id: null,
    });
  }
  // Diurutkan per brand dulu: satu pabrik maklon mengerjakan banyak brand,
  // dan orang mencari barang dengan mengingat brand-nya lebih dulu.
  options.sort(
    (a, b) =>
      (a.brand || "").localeCompare(b.brand || "") || a.label.localeCompare(b.label)
  );

  // Layanan jasa (tanpa stok), tampil setelah produk
  if (includeServices) {
    const { data: services } = await supabase
      .from("services")
      .select("id, kode, nama_jasa, biaya")
      .eq("organization_id", organizationId)
      .eq("aktif", true)
      .order("kode");
    for (const s of (services || []) as {
      id: string;
      kode: string | null;
      nama_jasa: string;
      biaya: number;
    }[]) {
      options.push({
        key: `svc|${s.id}`,
        product_id: "",
        varian: "-",
        label: `${s.kode || "JASA"}, ${s.nama_jasa} (Jasa)`,
        brand: null,
        available: 0,
        harga_jual: s.biaya == null ? null : Number(s.biaya),
        service_id: s.id,
      });
    }
  }

  const clientPrices: ClientPriceMap = {};
  for (const h of (hargaKhusus || []) as {
    client_id: string;
    product_id: string;
    varian: string | null;
    harga: number;
  }[]) {
    clientPrices[clientPriceKey(h.client_id, h.product_id, h.varian)] = Number(
      h.harga
    );
  }

  return { clients: (clients || []) as ClientOpt[], options, clientPrices };
}

/**
 * Diskon khusus seluruh client di organisasi ini, dikunci
 * `client|produk|varian`.
 *
 * Ditarik utuh sekali, bukan per client: datanya kecil (satu baris per
 * kesepakatan, bukan per transaksi) dan layar daftar konsinyasi memang
 * butuh diskon banyak outlet sekaligus.
 */
export async function getClientDiscounts(
  organizationId: string
): Promise<ClientDiscountMap> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("client_prices")
    .select("client_id, product_id, varian, diskon_persen")
    .eq("organization_id", organizationId)
    .not("diskon_persen", "is", null);

  const map: ClientDiscountMap = {};
  for (const r of (data || []) as {
    client_id: string;
    product_id: string;
    varian: string | null;
    diskon_persen: number | null;
  }[]) {
    if (r.diskon_persen == null) continue;
    map[clientPriceKey(r.client_id, r.product_id, r.varian)] = Number(
      r.diskon_persen
    );
  }
  return map;
}
