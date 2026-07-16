"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFinishedStock, fgKey } from "@/lib/salesStock";
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

    // Cek stok produk jadi
    const stock = await getFinishedStock(organizationId);
    for (const it of items) {
      const available = stock.get(fgKey(it.product_id, it.varian_ukuran))?.available ?? 0;
      if (it.qty_kirim > available) {
        throw new Error(
          `Stok tidak cukup untuk varian ${it.varian_ukuran || "-"} (tersedia ${available.toLocaleString("id-ID")} pcs)`
        );
      }
    }

    // Nomor CSG-YYYYMM###
    const ym = data.tanggal_kirim.slice(0, 7).replace("-", "");
    const prefix = `CSG.${ym}`;
    const { data: lastRow } = await supabase
      .from("consignments")
      .select("no_konsinyasi")
      .eq("organization_id", organizationId)
      .like("no_konsinyasi", `${prefix}%`)
      .order("no_konsinyasi", { ascending: false })
      .limit(1);
    const lastSeq = lastRow?.[0]?.no_konsinyasi
      ? parseInt((lastRow[0].no_konsinyasi as string).slice(prefix.length)) || 0
      : 0;

    const { data: cons, error } = await supabase
      .from("consignments")
      .insert({
        no_konsinyasi: prefix + String(lastSeq + 1).padStart(3, "0"),
        client_id: data.client_id,
        tanggal_kirim: data.tanggal_kirim,
        catatan: data.catatan?.trim() || null,
        dibuat_oleh: profile?.id || null,
        organization_id: organizationId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { error: itemsError } = await supabase.from("consignment_items").insert(
      items.map((it) => ({
        consignment_id: cons.id,
        product_id: it.product_id,
        varian_ukuran: it.varian_ukuran,
        qty_kirim: it.qty_kirim,
        harga_jual: it.harga_jual,
        organization_id: organizationId,
      }))
    );
    if (itemsError) {
      await supabase.from("consignments").delete().eq("id", cons.id);
      throw new Error(itemsError.message);
    }

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

    // Nomor invoice
    const today = new Date().toISOString().slice(0, 10);
    const ym = today.slice(0, 7).replace("-", "");
    const prefix = `INV.${ym}`;
    const { data: lastInv } = await supabase
      .from("sales_invoices")
      .select("no_invoice")
      .eq("organization_id", organizationId)
      .like("no_invoice", `${prefix}%`)
      .order("no_invoice", { ascending: false })
      .limit(1);
    const lastSeq = lastInv?.[0]?.no_invoice
      ? parseInt((lastInv[0].no_invoice as string).slice(prefix.length)) || 0
      : 0;

    const jatuhTempo =
      data.top_days == null
        ? null
        : new Date(
            new Date(today + "T00:00:00").getTime() + data.top_days * 86400000
          )
            .toISOString()
            .slice(0, 10);

    const { data: inv, error } = await supabase
      .from("sales_invoices")
      .insert({
        no_invoice: prefix + String(lastSeq + 1).padStart(3, "0"),
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
        organization_id: organizationId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { error: iErr } = await supabase.from("sales_invoice_items").insert(
      invItems.map((it) => ({
        invoice_id: inv.id,
        product_id: it.product_id,
        varian_ukuran: it.varian_ukuran,
        qty: it.qty,
        harga: it.harga,
        subtotal: it.qty * it.harga,
        organization_id: organizationId,
      }))
    );
    if (iErr) {
      await supabase.from("sales_invoices").delete().eq("id", inv.id);
      throw new Error(iErr.message);
    }

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
    return { ok: true, invoiceId: inv.id };
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
