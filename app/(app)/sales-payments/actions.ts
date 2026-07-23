"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

/**
 * Hitung ulang status bayar sebuah dokumen dari ledger cicilan.
 * - Lunas (dibayar >= total)  → status "Lunas", dan Proforma otomatis jadi Invoice.
 * - Belum lunas               → status "Belum Lunas", tetap/kembali Proforma.
 */
async function recompute(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  invoiceId: string
) {
  const { data: inv } = await supabase
    .from("sales_invoices")
    .select("total")
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .single();
  if (!inv) return;

  const { data: pays } = await supabase
    .from("sales_payments")
    .select("jumlah")
    .eq("invoice_id", invoiceId)
    .eq("organization_id", organizationId);

  const dibayar = (pays || []).reduce((s, p) => s + Number(p.jumlah), 0);
  const total = Number(inv.total);
  const lunas = dibayar >= total - 0.5; // toleransi pembulatan rupiah
  const today = new Date().toLocaleDateString("sv-SE");

  await supabase
    .from("sales_invoices")
    .update({
      status_bayar: lunas ? "Lunas" : "Belum Lunas",
      tanggal_bayar: lunas ? today : null,
      tipe: lunas ? "Invoice" : "Proforma",
    })
    .eq("id", invoiceId)
    .eq("organization_id", organizationId);
}

/** Catat satu pembayaran (DP / cicilan / pelunasan) dari client. */
export async function recordSalesPayment(
  invoiceId: string,
  jumlah: number,
  tanggal: string,
  catatan: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!(jumlah > 0)) throw new Error("Jumlah pembayaran harus lebih dari 0");
    if (!tanggal) throw new Error("Tanggal pembayaran wajib diisi");

    const { data: inv } = await supabase
      .from("sales_invoices")
      .select("id, total")
      .eq("id", invoiceId)
      .eq("organization_id", organizationId)
      .single();
    if (!inv) throw new Error("Dokumen tidak ditemukan");

    // Jangan sampai total bayar melebihi tagihan
    const { data: pays } = await supabase
      .from("sales_payments")
      .select("jumlah")
      .eq("invoice_id", invoiceId)
      .eq("organization_id", organizationId);
    const sudah = (pays || []).reduce((s, p) => s + Number(p.jumlah), 0);
    const sisa = Number(inv.total) - sudah;
    if (jumlah > sisa + 0.5)
      throw new Error(
        `Melebihi sisa tagihan. Sisa Rp ${sisa.toLocaleString("id-ID")}`
      );

    const { error } = await supabase.from("sales_payments").insert({
      invoice_id: invoiceId,
      tanggal,
      jumlah,
      catatan: catatan?.trim() || null,
      dibuat_oleh: profile?.id || null,
      organization_id: organizationId,
    });
    if (error) throw new Error(error.message);

    await recompute(supabase, organizationId, invoiceId);

    revalidatePath("/sales-payments");
    revalidatePath("/sales-invoices");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

/** Hapus satu baris pembayaran (koreksi), lalu hitung ulang status. */
export async function deleteSalesPayment(
  paymentId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const { data: pay } = await supabase
      .from("sales_payments")
      .select("id, invoice_id")
      .eq("id", paymentId)
      .eq("organization_id", organizationId)
      .single();
    if (!pay) throw new Error("Pembayaran tidak ditemukan");

    const { error } = await supabase
      .from("sales_payments")
      .delete()
      .eq("id", paymentId)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);

    await recompute(supabase, organizationId, pay.invoice_id as string);

    revalidatePath("/sales-payments");
    revalidatePath("/sales-invoices");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}
