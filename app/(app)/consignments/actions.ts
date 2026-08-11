"use server";

/* ============================================================
   Semua mutasi stok konsinyasi lewat RPC transaksional
   (supabase/migrations/20260803_transactional_rpcs.sql).

   Sebelumnya alurnya dijahit di sini: potong stok lewat beberapa
   UPDATE, lalu buat invoice, atau sebaliknya. Kalau langkah kedua
   gagal, langkah pertama sudah terlanjur dan tidak ada yang
   membatalkannya. Sekarang cek stok, potong, dan penerbitan invoice
   terjadi dalam SATU transaksi di database: gagal di mana pun,
   semuanya batal.
   ============================================================ */

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { addDaysStr, localDateStr } from "@/lib/dates";

export type ConsignItemInput = {
  product_id: string;
  varian_ukuran: string | null;
  qty_kirim: number;
  harga_jual: number;
};

export type OutletLine = {
  product_id: string;
  varian_ukuran: string | null;
  qty: number;
  harga?: number;
};

type SaleOpts = {
  diskon_percent: number;
  pakai_tax: boolean;
  tax_percent: number;
  top_days: number | null;
};

/** Header pembayaran yang sama untuk semua penerbitan invoice konsinyasi. */
function invoiceOpts(opts: SaleOpts, dibuatOleh: string | null) {
  const tanggal = localDateStr();
  return {
    diskon_percent: opts.diskon_percent,
    pakai_tax: opts.pakai_tax,
    tax_percent: opts.tax_percent,
    top_days: opts.top_days,
    tanggal,
    jatuh_tempo:
      opts.top_days == null ? null : addDaysStr(tanggal, opts.top_days),
    dibuat_oleh: dibuatOleh,
  };
}

export async function createConsignment(data: {
  client_id: string;
  tanggal_kirim: string;
  catatan: string | null;
  items: ConsignItemInput[];
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    if (!data.client_id) throw new Error("Client wajib dipilih");
    if (!data.tanggal_kirim) throw new Error("Tanggal kirim wajib diisi");
    const items = data.items.filter((it) => it.product_id && it.qty_kirim > 0);
    if (items.length === 0) throw new Error("Minimal satu produk dikirim");

    // Cek stok + penomoran + insert atomik di database (advisory lock)
    const { error } = await supabase.rpc("create_consignment_tx", {
      p_organization_id: organizationId,
      p_header: {
        client_id: data.client_id,
        tanggal_kirim: data.tanggal_kirim,
        catatan: data.catatan?.trim() || null,
        dibuat_oleh: profile?.id || null,
      },
      p_items: items.map((it) => ({
        product_id: it.product_id,
        varian_ukuran: it.varian_ukuran,
        qty_kirim: it.qty_kirim,
        harga_jual: it.harga_jual,
      })),
    });
    if (error) throw new Error(error.message);

    revalidatePath("/consignments");
    revalidatePath("/finished-goods");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

/** Laku dari SATU pengiriman konsinyasi → potong stok + Proforma. */
export async function reportConsignmentSale(
  consignmentId: string,
  data: {
    items: { consignment_item_id: string; qty_laku: number }[];
    diskon_percent: number;
    pakai_tax: boolean;
    tax_percent: number;
    top_days: number | null;
  }
): Promise<{ ok: boolean; error?: string; invoiceId?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const laku = data.items.filter((it) => it.qty_laku > 0);
    if (laku.length === 0) throw new Error("Minimal satu item laku");

    const { data: invoiceId, error } = await supabase.rpc(
      "report_consignment_sale_tx",
      {
        p_organization_id: organizationId,
        p_consignment_id: consignmentId,
        p_items: laku,
        p_opts: invoiceOpts(data, profile?.id || null),
      }
    );
    if (error) throw new Error(error.message);

    revalidatePath("/consignments");
    revalidatePath("/sales-invoices");
    revalidatePath("/sales-payments");
    revalidatePath("/finished-goods");
    return { ok: true, invoiceId: invoiceId as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

/** Tutup konsinyasi: sisa yang tidak laku dianggap retur (kembali ke stok). */
export async function closeConsignment(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const { error } = await supabase.rpc("close_consignment_tx", {
      p_organization_id: organizationId,
      p_consignment_id: id,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/consignments");
    revalidatePath("/finished-goods");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

/* ============================================================
   Laku / Retur di level OUTLET (client), distribusi lintas
   pengiriman, pengiriman tertua dulu (FIFO). Pembagiannya sekarang
   dikerjakan di database supaya tidak ada lost update saat dua
   pencatatan terjadi bersamaan.
   ============================================================ */

/** Catat penjualan laku di sebuah outlet → potong stok + buat Proforma. */
export async function reportOutletSale(
  clientId: string,
  lines: OutletLine[],
  opts: SaleOpts
): Promise<{ ok: boolean; error?: string; invoiceId?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const items = lines.filter((l) => l.product_id && l.qty > 0);
    if (items.length === 0) throw new Error("Isi minimal satu produk yang laku");

    const { data: invoiceId, error } = await supabase.rpc(
      "report_outlet_sale_tx",
      {
        p_organization_id: organizationId,
        p_client_id: clientId,
        p_lines: items.map((l) => ({
          product_id: l.product_id,
          varian_ukuran: l.varian_ukuran,
          qty: l.qty,
          harga: l.harga && l.harga > 0 ? l.harga : null,
        })),
        p_opts: invoiceOpts(opts, profile?.id || null),
      }
    );
    if (error) throw new Error(error.message);

    revalidatePath("/consignments");
    revalidatePath("/sales-invoices");
    revalidatePath("/sales-payments");
    revalidatePath("/finished-goods");
    return { ok: true, invoiceId: invoiceId as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

/** Catat retur di sebuah outlet → barang kembali ke stok produk jadi. */
export async function returOutlet(
  clientId: string,
  lines: OutletLine[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const items = lines.filter((l) => l.product_id && l.qty > 0);
    if (items.length === 0)
      throw new Error("Isi minimal satu produk yang diretur");

    const { error } = await supabase.rpc("retur_outlet_tx", {
      p_organization_id: organizationId,
      p_client_id: clientId,
      p_lines: items.map((l) => ({
        product_id: l.product_id,
        varian_ukuran: l.varian_ukuran,
        qty: l.qty,
      })),
    });
    if (error) throw new Error(error.message);

    revalidatePath("/consignments");
    revalidatePath("/finished-goods");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}
