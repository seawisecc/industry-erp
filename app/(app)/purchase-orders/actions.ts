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

export async function createPO(data: POInput) {
  const supabase = await createClient();
  const { profile, organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }

  validatePO(data);

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
  if (po.status !== "Dikirim") {
    throw new Error(
      `PO ini statusnya "${po.status}" — sudah tidak bisa diubah/dihapus.`
    );
  }
  return po;
}

export async function updatePO(id: string, data: POInput) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }

  validatePO(data);
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
