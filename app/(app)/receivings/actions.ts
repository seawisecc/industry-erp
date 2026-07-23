"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { getFeatures } from "@/lib/featuresServer";

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
  return d.toLocaleDateString("sv-SE");
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

  // ---- 2. Insert batch stok ----
  // QC Module aktif: barang masuk KARANTINA dulu (qty_sisa 0, stok belum bisa
  // dipakai) sampai di-release QC. Tanpa QC: langsung Released seperti biasa.
  const { qc: qcOn } = await getFeatures(organizationId);
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
      qc_status: qcOn ? "Karantina" : "Released",
      qty_karantina: qcOn ? it.qty_masuk : 0,
      qty_sisa: qcOn ? 0 : it.qty_masuk,
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

/**
 * Batalkan penerimaan (koreksi operasional): hapus batch stok yang belum
 * terpakai, kembalikan qty_diterima PO, dan sesuaikan status PO. Hanya bila
 * seluruh batch masih utuh (belum dipakai produksi / belum keluar).
 */
export async function cancelReceiving(
  id: string,
  _alasan: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!(isSuperAdmin || profile?.role === "Admin" || profile?.can_cancel))
      throw new Error("Tidak punya izin membatalkan transaksi");

    const { data: rcv } = await supabase
      .from("receivings")
      .select("id, po_id")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single();
    if (!rcv) throw new Error("Penerimaan tidak ditemukan");

    const { data: batches } = await supabase
      .from("purchase_batches")
      .select("id, item_id, qty_masuk, qty_sisa, qty_karantina")
      .eq("receiving_id", id)
      .eq("organization_id", organizationId);
    const rows = (batches || []) as {
      id: string;
      item_id: string;
      qty_masuk: number;
      qty_sisa: number;
      qty_karantina: number;
    }[];

    // Guard: semua batch harus masih utuh (belum ada yang dipakai / keluar)
    const terpakai = rows.find(
      (b) =>
        Number(b.qty_sisa) + Number(b.qty_karantina) < Number(b.qty_masuk) - 0.001
    );
    if (terpakai)
      throw new Error(
        "Sebagian barang sudah terpakai/keluar — penerimaan tidak bisa dibatalkan."
      );

    // Hapus batch stok
    const { error: delErr } = await supabase
      .from("purchase_batches")
      .delete()
      .eq("receiving_id", id)
      .eq("organization_id", organizationId);
    if (delErr) throw new Error(delErr.message);

    // Hapus header penerimaan
    await supabase
      .from("receivings")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    // Hitung ulang qty_diterima PO dari batch tersisa, lalu status
    if (rcv.po_id) {
      const { data: poItems } = await supabase
        .from("po_items")
        .select("id, item_id, qty_pesan")
        .eq("po_id", rcv.po_id);
      const { data: sisaBatches } = await supabase
        .from("purchase_batches")
        .select("item_id, qty_masuk")
        .eq("po_id", rcv.po_id)
        .eq("organization_id", organizationId);

      const diterimaPerItem = new Map<string, number>();
      for (const b of (sisaBatches || []) as { item_id: string; qty_masuk: number }[]) {
        diterimaPerItem.set(
          b.item_id,
          (diterimaPerItem.get(b.item_id) || 0) + Number(b.qty_masuk)
        );
      }

      let totalDiterima = 0;
      let semuaLengkap = true;
      for (const p of (poItems || []) as {
        id: string;
        item_id: string;
        qty_pesan: number;
      }[]) {
        const d = diterimaPerItem.get(p.item_id) || 0;
        totalDiterima += d;
        if (d < Number(p.qty_pesan)) semuaLengkap = false;
        await supabase.from("po_items").update({ qty_diterima: d }).eq("id", p.id);
      }

      const statusBaru =
        totalDiterima <= 0 ? "Dikirim" : semuaLengkap ? "Selesai" : "Diterima Sebagian";
      await supabase
        .from("purchase_orders")
        .update({ status: statusBaru })
        .eq("id", rcv.po_id)
        .eq("organization_id", organizationId);
    }

    revalidatePath("/receivings");
    revalidatePath("/purchase-orders");
    revalidatePath("/items");
    revalidatePath("/payments");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}
