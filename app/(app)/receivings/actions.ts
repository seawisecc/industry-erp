"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type ReceivingItemInput = {
  po_item_id: string;
  item_id: string;
  qty_masuk: number;
  harga_per_unit: number;
  no_lot_supplier: string | null;
  exp_date: string | null; // yyyy-mm-dd
};

export type ReceivingInput = {
  po_id: string;
  tanggal_terima: string; // yyyy-mm-dd
  no_invoice: string | null;
  ppn_percent: number;
  top_days: number | null; // 0 = Tunai/CIA, null = tidak diset
  items: ReceivingItemInput[];
};

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function createReceiving(data: ReceivingInput) {
  const supabase = await createClient();
  const { profile, organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }

  // ---- Validasi dasar ----
  if (!data.po_id) throw new Error("PO wajib dipilih");
  if (!data.tanggal_terima) throw new Error("Tanggal terima wajib diisi");
  const items = data.items.filter((it) => it.qty_masuk > 0);
  if (items.length === 0)
    throw new Error("Minimal satu item dengan qty masuk lebih dari 0");
  for (const it of items) {
    if (it.harga_per_unit < 0) throw new Error("Harga tidak boleh negatif");
  }

  // ---- Ambil PO + baris item untuk validasi sisa ----
  const { data: po, error: poError } = await supabase
    .from("purchase_orders")
    .select(
      "id, no_po, status, supplier_id, suppliers(nama), po_items(id, qty_pesan, qty_diterima)"
    )
    .eq("id", data.po_id)
    .eq("organization_id", organizationId)
    .single();

  if (poError || !po) throw new Error("PO tidak ditemukan");
  if (po.status === "Selesai")
    throw new Error("PO ini sudah Selesai — semua barang sudah diterima.");

  const poItems = (po.po_items || []) as {
    id: string;
    qty_pesan: number;
    qty_diterima: number;
  }[];
  const supplierNama =
    (po.suppliers as unknown as { nama: string } | null)?.nama || null;

  for (const it of items) {
    const poItem = poItems.find((p) => p.id === it.po_item_id);
    if (!poItem) throw new Error("Ada baris yang tidak ditemukan di PO");
    const sisa = Number(poItem.qty_pesan) - Number(poItem.qty_diterima);
    if (it.qty_masuk > sisa) {
      throw new Error(
        `Qty masuk melebihi sisa PO (sisa ${sisa.toLocaleString("id-ID")}). Kurangi qty-nya.`
      );
    }
  }

  // ---- Hitung total invoice ----
  const subtotal = items.reduce(
    (s, it) => s + it.qty_masuk * it.harga_per_unit,
    0
  );
  const totalPpn = (subtotal * data.ppn_percent) / 100;

  // ---- 1. Insert header receiving (faktur) + jatuh tempo dari TOP ----
  const jatuhTempo =
    data.top_days == null ? null : addDays(data.tanggal_terima, data.top_days);

  const { data: receiving, error: rcvError } = await supabase
    .from("receivings")
    .insert({
      po_id: data.po_id,
      tanggal_terima: data.tanggal_terima,
      supplier_id: po.supplier_id,
      supplier_nama: supplierNama,
      no_invoice: data.no_invoice?.trim() || null,
      ppn_percent: data.ppn_percent,
      subtotal,
      total_ppn: totalPpn,
      total_invoice: subtotal + totalPpn,
      top_days: data.top_days,
      jatuh_tempo: jatuhTempo,
      dibuat_oleh: profile?.id || null,
      organization_id: organizationId,
    })
    .select()
    .single();

  if (rcvError) throw new Error(rcvError.message);

  // ---- 2. Insert batch stok (qty_sisa = qty_masuk) ----
  const { error: batchError } = await supabase.from("purchase_batches").insert(
    items.map((it) => ({
      item_id: it.item_id,
      tanggal_terima: data.tanggal_terima,
      supplier_id: po.supplier_id,
      supplier_nama: supplierNama,
      no_lot_supplier: it.no_lot_supplier?.trim() || null,
      exp_date: it.exp_date || null,
      qty_masuk: it.qty_masuk,
      harga_per_unit: it.harga_per_unit,
      qty_sisa: it.qty_masuk,
      po_id: data.po_id,
      receiving_id: receiving.id,
      dibuat_oleh: profile?.id || null,
      organization_id: organizationId,
    }))
  );

  if (batchError) {
    // Batalkan header yang telanjur dibuat supaya tidak ada receiving kosong
    await supabase.from("receivings").delete().eq("id", receiving.id);
    throw new Error(batchError.message);
  }

  // ---- 3. Update qty_diterima tiap baris PO ----
  for (const it of items) {
    const poItem = poItems.find((p) => p.id === it.po_item_id)!;
    const { error: updError } = await supabase
      .from("po_items")
      .update({ qty_diterima: Number(poItem.qty_diterima) + it.qty_masuk })
      .eq("id", it.po_item_id);
    if (updError) throw new Error(updError.message);
  }

  // ---- 4. Update status PO ----
  const allDone = poItems.every((p) => {
    const received = items.find((it) => it.po_item_id === p.id);
    const newQty = Number(p.qty_diterima) + (received ? received.qty_masuk : 0);
    return newQty >= Number(p.qty_pesan);
  });

  const { error: statusError } = await supabase
    .from("purchase_orders")
    .update({ status: allDone ? "Selesai" : "Diterima Sebagian" })
    .eq("id", data.po_id);
  if (statusError) throw new Error(statusError.message);

  revalidatePath("/receivings");
  revalidatePath("/purchase-orders");
  revalidatePath("/items");
  revalidatePath("/payments");
  return { success: true };
}
