"use server";

/* ============================================================
   Pencatatan cicilan penjualan.

   Cek sisa tagihan, insert pembayaran, dan hitung ulang status
   dilakukan dalam satu transaksi terkunci di database
   (record_sales_payment_tx). Sebelumnya ketiganya berjalan
   terpisah dari sini, sehingga dua pembayaran yang masuk
   bersamaan bisa sama-sama lolos pengecekan "sisa tagihan" dan
   menghasilkan lebih bayar.
   ============================================================ */

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { localDateStr } from "@/lib/dates";

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

    const { error } = await supabase.rpc("record_sales_payment_tx", {
      p_organization_id: organizationId,
      p_invoice_id: invoiceId,
      p_jumlah: jumlah,
      p_tanggal: tanggal,
      p_catatan: catatan?.trim() || null,
      p_dibuat_oleh: profile?.id || null,
      p_today: localDateStr(),
    });
    if (error) throw new Error(error.message);

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

    const { error } = await supabase.rpc("delete_sales_payment_tx", {
      p_organization_id: organizationId,
      p_payment_id: paymentId,
      p_today: localDateStr(),
    });
    if (error) throw new Error(error.message);

    revalidatePath("/sales-payments");
    revalidatePath("/sales-invoices");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}
