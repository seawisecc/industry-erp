"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFinishedStock, fgKey } from "@/lib/salesStock";
import { computeTotals } from "@/lib/invoiceMath";
import { revalidatePath } from "next/cache";

export type InvoiceItemInput = {
  product_id: string | null; // null untuk baris jasa
  service_id?: string | null;
  varian_ukuran: string | null;
  qty: number;
  harga: number;
};

export type InvoiceInput = {
  tipe: "Proforma" | "Invoice";
  sumber: "Direct" | "POS";
  client_id: string | null;
  nama_pembeli: string | null;
  tanggal: string;
  diskon_percent: number;
  pakai_tax: boolean;
  tax_percent: number;
  top_days: number | null;
  catatan: string | null;
  langsung_lunas?: boolean;
  items: InvoiceItemInput[];
};

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv-SE");
}

async function nextInvoiceNo(
  organizationId: string,
  tanggal: string
): Promise<string> {
  const supabase = await createClient();
  const ym = tanggal.slice(0, 7).replace("-", "");
  const prefix = `INV.${ym}`;
  const { data } = await supabase
    .from("sales_invoices")
    .select("no_invoice")
    .eq("organization_id", organizationId)
    .like("no_invoice", `${prefix}%`)
    .order("no_invoice", { ascending: false })
    .limit(1);
  const last = data?.[0]?.no_invoice as string | undefined;
  const lastSeq = last ? parseInt(last.slice(prefix.length)) || 0 : 0;
  return prefix + String(lastSeq + 1).padStart(3, "0");
}

export async function createInvoice(
  data: InvoiceInput
): Promise<{ ok: boolean; error?: string; invoiceId?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    if (!data.tanggal) throw new Error("Tanggal wajib diisi");
    if (!data.client_id && !data.nama_pembeli?.trim())
      throw new Error("Pilih client atau isi nama pembeli");
    const items = data.items.filter(
      (it) => (it.product_id || it.service_id) && it.qty > 0
    );
    if (items.length === 0) throw new Error("Minimal satu item");

    // Cek stok produk jadi (Direct/POS memotong stok) — baris jasa dilewati
    const stock = await getFinishedStock(organizationId);
    for (const it of items) {
      if (!it.product_id) continue; // jasa: tidak ada stok
      const s = stock.get(fgKey(it.product_id, it.varian_ukuran));
      const available = s?.available ?? 0;
      if (it.qty > available) {
        throw new Error(
          `Stok produk jadi tidak cukup (tersedia ${available.toLocaleString("id-ID")} pcs untuk varian ${it.varian_ukuran || "-"})`
        );
      }
    }

    const { subtotal, total } = computeTotals(
      items,
      data.diskon_percent,
      data.pakai_tax,
      data.tax_percent
    );

    const jatuhTempo =
      data.top_days == null ? null : addDays(data.tanggal, data.top_days);
    const lunas = !!data.langsung_lunas;

    const { data: inv, error } = await supabase
      .from("sales_invoices")
      .insert({
        no_invoice: await nextInvoiceNo(organizationId, data.tanggal),
        tipe: data.tipe,
        sumber: data.sumber,
        client_id: data.client_id,
        nama_pembeli: data.nama_pembeli?.trim() || null,
        tanggal: data.tanggal,
        diskon_percent: data.diskon_percent,
        pakai_tax: data.pakai_tax,
        tax_percent: data.tax_percent,
        subtotal,
        total,
        top_days: data.top_days,
        jatuh_tempo: jatuhTempo,
        status_bayar: lunas ? "Lunas" : "Belum Lunas",
        tanggal_bayar: lunas ? data.tanggal : null,
        catatan: data.catatan?.trim() || null,
        dibuat_oleh: profile?.id || null,
        organization_id: organizationId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { error: itemsError } = await supabase.from("sales_invoice_items").insert(
      items.map((it) => ({
        invoice_id: inv.id,
        product_id: it.product_id,
        service_id: it.service_id || null,
        varian_ukuran: it.varian_ukuran,
        qty: it.qty,
        harga: it.harga,
        subtotal: it.qty * it.harga,
        organization_id: organizationId,
      }))
    );
    if (itemsError) {
      await supabase.from("sales_invoices").delete().eq("id", inv.id);
      throw new Error(itemsError.message);
    }

    revalidatePath("/sales-invoices");
    revalidatePath("/sales-payments");
    revalidatePath("/finished-goods");
    return { ok: true, invoiceId: inv.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

export async function convertToInvoice(
  id: string,
  topDays: number | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const { data: inv } = await supabase
      .from("sales_invoices")
      .select("id, tipe, tanggal")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single();
    if (!inv) throw new Error("Invoice tidak ditemukan");
    if (inv.tipe !== "Proforma") throw new Error("Sudah berupa Invoice");

    const today = new Date().toLocaleDateString("sv-SE");
    const { error } = await supabase
      .from("sales_invoices")
      .update({
        tipe: "Invoice",
        top_days: topDays,
        jatuh_tempo: topDays == null ? null : addDays(today, topDays),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/sales-invoices");
    revalidatePath("/sales-payments");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}
