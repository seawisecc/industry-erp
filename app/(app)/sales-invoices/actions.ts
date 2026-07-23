"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
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

    const { subtotal, total } = computeTotals(
      items,
      data.diskon_percent,
      data.pakai_tax,
      data.tax_percent
    );

    const jatuhTempo =
      data.top_days == null ? null : addDays(data.tanggal, data.top_days);
    const lunas = !!data.langsung_lunas;

    // Cek stok + penomoran + insert dilakukan atomik di database
    // (advisory lock per organisasi) — anti-oversell & anti-duplikat nomor.
    const { data: invoiceId, error } = await supabase.rpc(
      "create_sales_invoice_tx",
      {
        p_organization_id: organizationId,
        p_header: {
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
        },
        p_items: items.map((it) => ({
          product_id: it.product_id,
          service_id: it.service_id || null,
          varian_ukuran: it.varian_ukuran,
          qty: it.qty,
          harga: it.harga,
        })),
      }
    );
    if (error) throw new Error(error.message);

    // POS / cash: langsung lunas → catat pembayaran penuh ke ledger supaya
    // riwayat kas konsisten (dokumen tetap tidak muncul di Sales Payments
    // karena statusnya sudah Lunas).
    if (lunas && total > 0) {
      await supabase.from("sales_payments").insert({
        invoice_id: invoiceId as string,
        tanggal: data.tanggal,
        jumlah: total,
        catatan: "Pembayaran tunai (POS)",
        dibuat_oleh: profile?.id || null,
        organization_id: organizationId,
      });
    }

    revalidatePath("/sales-invoices");
    revalidatePath("/sales-payments");
    revalidatePath("/finished-goods");
    return { ok: true, invoiceId: invoiceId as string };
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
