"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { canAccessModule } from "@/lib/modules";
import { getTaxSettings } from "@/lib/taxServer";
import { revalidatePath } from "next/cache";
import { toResult, type ActionResult } from "@/lib/actionResult";
import {
  adalahStatusQuotation,
  type QuotationHeaderInput,
  type QuotationItemInput,
} from "@/lib/quotation";

/**
 * Hasil aksi yang melahirkan dokumen. `ActionResult` sengaja tidak
 * diperluas, alasan yang sama dengan RndSaveResult.
 */
export type QuotationSaveResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function pesan(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Hak akses modul diperiksa di server, bukan cuma lewat menu yang
 * disembunyikan: server action punya URL sendiri dan bisa dipanggil
 * dari mana saja. Quotation tidak punya izin per aksi, cukup modulnya.
 */
async function requireQuotations() {
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Refresh halaman dan login ulang.");
  }
  const boleh = canAccessModule(
    {
      isSuperAdmin,
      role: profile?.role || "",
      allowedModules: profile?.allowed_modules ?? null,
    },
    "quotations"
  );
  if (!boleh) throw new Error("Kamu tidak punya akses ke modul Quotations");
  return { organizationId, profileId: profile?.id || null };
}

function segarkan(id?: string) {
  revalidatePath("/quotations");
  if (id) revalidatePath(`/quotations/${id}`);
}

/**
 * Simpan quotation, baru maupun perubahan. Header + seluruh baris
 * ditulis ulang utuh di `save_quotation_tx`, totalnya dihitung ulang di
 * sana. Aturan pajaknya dibaca di server (Settings), bukan dari form:
 * tab yang sudah lama terbuka tidak boleh membekukan aturan lama.
 */
export async function saveQuotation(
  id: string | null,
  header: QuotationHeaderInput,
  items: QuotationItemInput[]
): Promise<QuotationSaveResult> {
  try {
    const supabase = await createClient();
    const { organizationId, profileId } = await requireQuotations();
    const tax = await getTaxSettings(organizationId);

    const { data, error } = await supabase.rpc("save_quotation_tx", {
      p_organization_id: organizationId,
      p_quotation_id: id,
      p_header: {
        ...header,
        tax_mode: tax.taxMode,
        tax_percent: tax.taxPercent,
        tax_dpp_nilai_lain: tax.dppNilaiLain,
      },
      p_items: items,
      p_dibuat_oleh: profileId,
    });
    if (error) throw new Error(error.message);

    const qid = data as string;
    segarkan(qid);
    return { ok: true, id: qid };
  } catch (err) {
    return { ok: false, error: pesan(err, "Gagal menyimpan quotation") };
  }
}

/**
 * Ganti status (Draft / Terkirim / Diterima / Ditolak). Quotation yang
 * sudah jadi Proforma statusnya dikunci di Diterima: menurunkannya akan
 * membuat tagihan yang sedang berjalan menunjuk penawaran yang
 * "ditolak". Syarat itu ditaruh di WHERE, jadi tidak ada jeda antara
 * memeriksa dan menulis.
 */
export async function setQuotationStatus(
  id: string,
  status: string
): Promise<ActionResult> {
  return toResult(async () => {
    if (!adalahStatusQuotation(status)) throw new Error("Status tidak dikenal");
    const supabase = await createClient();
    const { organizationId } = await requireQuotations();

    const { data, error } = await supabase
      .from("quotations")
      .update({ status })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("invoice_id", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new Error(
        "Status tidak bisa diubah: quotation tidak ditemukan atau sudah diterbitkan jadi Proforma."
      );
    }
    segarkan(id);
  }, "Gagal mengubah status");
}

/**
 * Hapus quotation. Ditolak kalau sudah jadi Proforma: nomornya sudah
 * ditunjuk dokumen tagihan. Baris anak ikut terhapus (on delete cascade).
 */
export async function deleteQuotation(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { organizationId } = await requireQuotations();

    const { data, error } = await supabase
      .from("quotations")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("invoice_id", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      throw new Error(
        "Tidak bisa dihapus: quotation ini sudah diterbitkan jadi Proforma. Batalkan Proforma-nya dulu di menu Invoices."
      );
    }
    revalidatePath("/quotations");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: pesan(err, "Gagal menghapus quotation") };
  }
}

/**
 * Terbitkan Proforma dari quotation. Satu RPC mengerjakan semuanya:
 * invoice terbit lewat create_sales_invoice_tx (penomoran INV yang
 * sama), quotation ditautkan dan ditandai Diterima.
 */
export async function issueProformaFromQuotation(
  id: string,
  tanggal: string,
  topDays: number | null,
  catatan: string | null
): Promise<QuotationSaveResult> {
  try {
    const supabase = await createClient();
    const { organizationId, profileId } = await requireQuotations();
    if (!tanggal) throw new Error("Tanggal Proforma wajib diisi");

    const { data, error } = await supabase.rpc("issue_quotation_proforma_tx", {
      p_organization_id: organizationId,
      p_quotation_id: id,
      p_tanggal: tanggal,
      p_top_days: topDays,
      p_catatan: catatan,
      p_dibuat_oleh: profileId,
    });
    if (error) throw new Error(error.message);

    segarkan(id);
    revalidatePath("/sales-invoices");
    revalidatePath("/sales-payments");
    revalidatePath("/dashboard");
    return { ok: true, id: data as string };
  } catch (err) {
    return { ok: false, error: pesan(err, "Gagal menerbitkan Proforma") };
  }
}
