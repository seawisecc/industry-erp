"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { computeTotals } from "@/lib/invoiceMath";
import { revalidatePath } from "next/cache";

export type ConsignItemInput = {
  product_id: string;
  varian_ukuran: string | null;
  qty_kirim: number;
  harga_jual: number;
};

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

    const { data: cons } = await supabase
      .from("consignments")
      .select("id, client_id, status, consignment_items(id, product_id, varian_ukuran, qty_kirim, qty_terjual, qty_retur, harga_jual)")
      .eq("id", consignmentId)
      .eq("organization_id", organizationId)
      .single();
    if (!cons) throw new Error("Konsinyasi tidak ditemukan");
    if (cons.status !== "Aktif") throw new Error("Konsinyasi sudah selesai");

    const consItems = cons.consignment_items as {
      id: string;
      product_id: string;
      varian_ukuran: string | null;
      qty_kirim: number;
      qty_terjual: number;
      qty_retur: number;
      harga_jual: number;
    }[];

    const laku = data.items.filter((it) => it.qty_laku > 0);
    if (laku.length === 0) throw new Error("Minimal satu item laku");

    const invItems: {
      product_id: string;
      varian_ukuran: string | null;
      qty: number;
      harga: number;
    }[] = [];

    for (const it of laku) {
      const ci = consItems.find((c) => c.id === it.consignment_item_id);
      if (!ci) throw new Error("Item konsinyasi tidak ditemukan");
      const sisa = Number(ci.qty_kirim) - Number(ci.qty_terjual) - Number(ci.qty_retur);
      if (it.qty_laku > sisa) {
        throw new Error(
          `Qty laku melebihi sisa di lokasi konsinyasi (sisa ${sisa.toLocaleString("id-ID")} pcs)`
        );
      }
      invItems.push({
        product_id: ci.product_id,
        varian_ukuran: ci.varian_ukuran,
        qty: it.qty_laku,
        harga: Number(ci.harga_jual),
      });
    }

    const { subtotal, total } = computeTotals(
      invItems,
      data.diskon_percent,
      data.pakai_tax,
      data.tax_percent
    );

    const today = new Date().toLocaleDateString("sv-SE");
    const jatuhTempoDate =
      data.top_days == null ? null : new Date(today + "T00:00:00");
    if (jatuhTempoDate) jatuhTempoDate.setDate(jatuhTempoDate.getDate() + data.top_days!);
    const jatuhTempo = jatuhTempoDate
      ? jatuhTempoDate.toLocaleDateString("sv-SE")
      : null;

    // Sumber Konsinyasi tidak memotong stok jual — RPC hanya mengamankan
    // penomoran invoice dari duplikat.
    const { data: invoiceId, error } = await supabase.rpc(
      "create_sales_invoice_tx",
      {
        p_organization_id: organizationId,
        p_header: {
          tipe: "Proforma",
          sumber: "Konsinyasi",
          client_id: cons.client_id,
          consignment_id: consignmentId,
          tanggal: today,
          diskon_percent: data.diskon_percent,
          pakai_tax: data.pakai_tax,
          tax_percent: data.tax_percent,
          subtotal,
          total,
          top_days: data.top_days,
          jatuh_tempo: jatuhTempo,
          dibuat_oleh: profile?.id || null,
        },
        p_items: invItems.map((it) => ({
          product_id: it.product_id,
          varian_ukuran: it.varian_ukuran,
          qty: it.qty,
          harga: it.harga,
        })),
      }
    );
    if (error) throw new Error(error.message);

    // Update qty_terjual
    for (const it of laku) {
      const ci = consItems.find((c) => c.id === it.consignment_item_id)!;
      const { error: uErr } = await supabase
        .from("consignment_items")
        .update({ qty_terjual: Number(ci.qty_terjual) + it.qty_laku })
        .eq("id", it.consignment_item_id);
      if (uErr) throw new Error(uErr.message);
    }

    revalidatePath("/consignments");
    revalidatePath("/sales-invoices");
    revalidatePath("/sales-payments");
    return { ok: true, invoiceId: invoiceId as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

export async function closeConsignment(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const { data: cons } = await supabase
      .from("consignments")
      .select("id, status, consignment_items(id, qty_kirim, qty_terjual, qty_retur)")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single();
    if (!cons) throw new Error("Konsinyasi tidak ditemukan");
    if (cons.status !== "Aktif") throw new Error("Sudah selesai");

    // Sisa yang tidak laku dianggap retur (kembali ke stok)
    for (const ci of cons.consignment_items as {
      id: string;
      qty_kirim: number;
      qty_terjual: number;
      qty_retur: number;
    }[]) {
      const sisa =
        Number(ci.qty_kirim) - Number(ci.qty_terjual) - Number(ci.qty_retur);
      if (sisa > 0) {
        const { error } = await supabase
          .from("consignment_items")
          .update({ qty_retur: Number(ci.qty_retur) + sisa })
          .eq("id", ci.id);
        if (error) throw new Error(error.message);
      }
    }

    const { error } = await supabase
      .from("consignments")
      .update({ status: "Selesai" })
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/consignments");
    revalidatePath("/finished-goods");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}
