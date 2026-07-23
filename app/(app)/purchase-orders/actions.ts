"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type POItemInput = {
  item_id: string;
  qty_pesan: number;
  harga_per_unit: number;
};

export type POInput = {
  supplier_id: string;
  tanggal_po: string; // yyyy-mm-dd
  ppn_percent: number;
  catatan: string | null;
  items: POItemInput[];
};

function validatePO(data: POInput) {
  if (!data.supplier_id) throw new Error("Supplier wajib dipilih");
  if (!data.tanggal_po) throw new Error("Tanggal PO wajib diisi");
  if (!data.items || data.items.length === 0)
    throw new Error("Minimal satu item harus diisi");
  for (const it of data.items) {
    if (!it.item_id) throw new Error("Ada baris item yang belum dipilih");
    if (!it.qty_pesan || it.qty_pesan <= 0)
      throw new Error("Qty setiap item harus lebih dari 0");
    if (it.harga_per_unit < 0) throw new Error("Harga tidak boleh negatif");
  }
  const ids = data.items.map((i) => i.item_id);
  if (new Set(ids).size !== ids.length)
    throw new Error("Ada item yang dipilih dua kali — gabungkan qty-nya");
}


// Validasi MOQ server-side: qty >= MOQ & kelipatannya
async function assertMoq(
  organizationId: string,
  items: POItemInput[]
) {
  const supabase = await createClient();
  const ids = items.map((it) => it.item_id);
  const { data: rows } = await supabase
    .from("items")
    .select("id, nama, satuan, moq")
    .eq("organization_id", organizationId)
    .in("id", ids);
  const map = new Map(
    ((rows || []) as { id: string; nama: string; satuan: string; moq: number | null }[]).map(
      (r) => [r.id, r]
    )
  );
  for (const it of items) {
    const item = map.get(it.item_id);
    const moq = item?.moq == null ? null : Number(item.moq);
    if (!item || !moq || moq <= 0) continue;
    const ratio = it.qty_pesan / moq;
    if (it.qty_pesan < moq || Math.abs(ratio - Math.round(ratio)) > 1e-9) {
      throw new Error(
        `${item.nama}: qty harus minimal ${moq} ${item.satuan} dan kelipatannya (MOQ)`
      );
    }
  }
}

export async function createPO(data: POInput) {
  const supabase = await createClient();
  const { profile, organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }

  validatePO(data);
  await assertMoq(organizationId, data.items);

  // 1. Insert PO — no_po diisi otomatis oleh trigger database (PO-MMYY-001)
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .insert({
      supplier_id: data.supplier_id,
      tanggal_po: data.tanggal_po,
      ppn_percent: data.ppn_percent,
      catatan: data.catatan?.trim() || null,
      dibuat_oleh: profile?.id || null,
      organization_id: organizationId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // 2. Insert semua baris item
  const { error: itemsError } = await supabase.from("po_items").insert(
    data.items.map((it) => ({
      po_id: po.id,
      item_id: it.item_id,
      qty_pesan: it.qty_pesan,
      harga_per_unit: it.harga_per_unit,
      organization_id: organizationId,
    }))
  );

  if (itemsError) {
    // Bersihkan PO yang telanjur dibuat supaya tidak ada PO kosong
    await supabase.from("purchase_orders").delete().eq("id", po.id);
    throw new Error(itemsError.message);
  }

  revalidatePath("/purchase-orders");
  return { success: true };
}

async function getEditablePO(id: string) {
  const supabase = await createClient();
  const { data: po, error } = await supabase
    .from("purchase_orders")
    .select("id, status")
    .eq("id", id)
    .single();

  if (error || !po) throw new Error("PO tidak ditemukan");
  if (po.status !== "Dibuat") {
    throw new Error(
      `PO ini statusnya "${po.status}" — hanya PO berstatus "Dibuat" yang bisa diubah/dihapus.`
    );
  }
  return po;
}

// ===== Alur approval & pengiriman =====

export async function approvePO(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, isSuperAdmin } = await getEffectiveOrg();

    const boleh =
      isSuperAdmin || profile?.role === "Admin" || profile?.can_approve_po;
    if (!boleh) {
      throw new Error(
        "Kamu tidak punya izin menyetujui PO. Minta Admin mengaktifkannya di menu Pengguna."
      );
    }

    const { data: po } = await supabase
      .from("purchase_orders")
      .select("id, status")
      .eq("id", id)
      .single();
    if (!po) throw new Error("PO tidak ditemukan");
    if (po.status !== "Dibuat")
      throw new Error(`PO ini statusnya sudah "${po.status}".`);

    const { error } = await supabase
      .from("purchase_orders")
      .update({ status: "Disetujui" })
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/purchase-orders");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

export async function markPOSent(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: po } = await supabase
      .from("purchase_orders")
      .select("id, status")
      .eq("id", id)
      .single();
    if (!po) throw new Error("PO tidak ditemukan");
    if (po.status !== "Disetujui")
      throw new Error(
        `PO harus berstatus "Disetujui" dulu (sekarang "${po.status}").`
      );

    const { error } = await supabase
      .from("purchase_orders")
      .update({ status: "Dikirim" })
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/purchase-orders");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

export async function setPOTop(
  id: string,
  topDays: number | null // null = hapus, 0 = Tunai/CIA
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    if (topDays !== null && (topDays < 0 || topDays > 365)) {
      throw new Error("TOP harus antara 0-365 hari");
    }

    const { error } = await supabase
      .from("purchase_orders")
      .update({ top_days: topDays })
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/purchase-orders");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

export async function updatePO(id: string, data: POInput) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }

  validatePO(data);
  await assertMoq(organizationId, data.items);
  await getEditablePO(id);

  const { error } = await supabase
    .from("purchase_orders")
    .update({
      supplier_id: data.supplier_id,
      tanggal_po: data.tanggal_po,
      ppn_percent: data.ppn_percent,
      catatan: data.catatan?.trim() || null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  // Ganti seluruh baris item: hapus yang lama, masukkan yang baru
  const { error: delError } = await supabase
    .from("po_items")
    .delete()
    .eq("po_id", id);
  if (delError) throw new Error(delError.message);

  const { error: itemsError } = await supabase.from("po_items").insert(
    data.items.map((it) => ({
      po_id: id,
      item_id: it.item_id,
      qty_pesan: it.qty_pesan,
      harga_per_unit: it.harga_per_unit,
      organization_id: organizationId,
    }))
  );
  if (itemsError) throw new Error(itemsError.message);

  revalidatePath("/purchase-orders");
  return { success: true };
}

export async function deletePO(id: string) {
  const supabase = await createClient();

  await getEditablePO(id);

  const { error: delItemsError } = await supabase
    .from("po_items")
    .delete()
    .eq("po_id", id);
  if (delItemsError) throw new Error(delItemsError.message);

  const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/purchase-orders");
  return { success: true };
}

/** Batalkan PO (koreksi operasional) — hanya bila belum ada barang diterima. */
export async function cancelPO(
  id: string,
  alasan: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!(isSuperAdmin || profile?.role === "Admin" || profile?.can_cancel))
      throw new Error("Tidak punya izin membatalkan transaksi");
    if (!alasan?.trim()) throw new Error("Alasan pembatalan wajib diisi");

    const { data: po } = await supabase
      .from("purchase_orders")
      .select("id, status, po_items(qty_diterima)")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single();
    if (!po) throw new Error("PO tidak ditemukan");

    const adaDiterima = (po.po_items as { qty_diterima: number }[]).some(
      (it) => Number(it.qty_diterima) > 0
    );
    if (adaDiterima || ["Diterima Sebagian", "Selesai"].includes(po.status))
      throw new Error(
        "PO sudah ada barang diterima — batalkan penerimaannya dulu di menu Receiving."
      );
    if (po.status === "Dibatalkan") throw new Error("PO sudah dibatalkan");

    const { error } = await supabase
      .from("purchase_orders")
      .update({ status: "Dibatalkan", catatan_batal: alasan.trim() })
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);

    revalidatePath("/purchase-orders");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}
