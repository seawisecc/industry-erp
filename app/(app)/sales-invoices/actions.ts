"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { computeTotals } from "@/lib/invoiceMath";
import { getTaxSettings } from "@/lib/taxServer";
import { revalidatePath } from "next/cache";
import { addDaysStr, localDateStr } from "@/lib/dates";

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
  top_days: number | null;
  catatan: string | null;
  langsung_lunas?: boolean;
  items: InvoiceItemInput[];
};

export async function createInvoice(
  data: InvoiceInput
): Promise<{
  ok: boolean;
  error?: string;
  invoiceId?: string;
  noInvoice?: string | null;
}> {
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

    // Tarif & model pajaknya dibaca ulang di server, BUKAN diterima dari
    // form. PPN itu angka regulasi, bukan angka yang boleh dikirim klien.
    // Kolom sales_invoices.tax_mode diisi trigger dari sumber yang sama,
    // jadi total yang tersimpan pasti cocok dengan model yang tercatat di
    // dokumennya. Kalau nilainya diambil dari klien, tab yang sudah lama
    // terbuka bisa menerbitkan invoice dengan total model lama sementara
    // dokumennya tertulis model baru, dan selisihnya tidak menimbulkan
    // error apa pun saat terjadi.
    const tax = await getTaxSettings(organizationId);

    const { subtotal, total } = computeTotals(
      items,
      data.diskon_percent,
      data.pakai_tax,
      tax.taxPercent,
      tax.taxMode,
      tax.dppNilaiLain
    );

    const jatuhTempo =
      data.top_days == null ? null : addDaysStr(data.tanggal, data.top_days);
    const lunas = !!data.langsung_lunas;

    // Cek stok + penomoran + insert dilakukan atomik di database
    // (advisory lock per organisasi), anti-oversell & anti-duplikat nomor.
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
          tax_percent: tax.taxPercent,
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

    // Nomornya dibuat di dalam RPC, jadi baru bisa dibaca sesudahnya.
    // Dipakai POS untuk menampilkan nomor nota di layar konfirmasi.
    const { data: nomor } = await supabase
      .from("sales_invoices")
      .select("no_invoice")
      .eq("id", invoiceId as string)
      .maybeSingle();

    revalidatePath("/sales-invoices");
    revalidatePath("/sales-payments");
    revalidatePath("/finished-goods");
    revalidatePath("/pos");
    return {
      ok: true,
      invoiceId: invoiceId as string,
      noInvoice: nomor?.no_invoice ?? null,
    };
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

    const today = localDateStr();
    const { error } = await supabase
      .from("sales_invoices")
      .update({
        tipe: "Invoice",
        top_days: topDays,
        jatuh_tempo: topDays == null ? null : addDaysStr(today, topDays),
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

/**
 * Batalkan invoice/proforma (koreksi operasional): hapus baris item &
 * pembayaran, stok produk jadi otomatis kembali. Tidak bisa bila client
 * sudah membayar (selain kas POS) atau bila berasal dari konsinyasi.
 */
export async function cancelInvoice(
  id: string,
  _alasan: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!(isSuperAdmin || profile?.role === "Admin" || profile?.can_cancel))
      throw new Error("Tidak punya izin membatalkan transaksi");

    // Pemeriksaan + penghapusan pembayaran/item/header dilakukan atomik.
    // Versi lama menghapusnya berurutan dari sini: kalau penghapusan
    // header gagal, itemnya sudah hilang dan tinggal invoice kosong
    // dengan total yang tidak cocok.
    const { error } = await supabase.rpc("cancel_invoice_tx", {
      p_organization_id: organizationId,
      p_invoice_id: id,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/sales-invoices");
    revalidatePath("/sales-payments");
    revalidatePath("/finished-goods");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}
