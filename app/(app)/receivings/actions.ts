"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { getFeatures } from "@/lib/featuresServer";
import { toResult, type ActionResult } from "@/lib/actionResult";
import { addDaysStr } from "@/lib/dates";

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

export async function createReceiving(
  data: ReceivingInput
): Promise<ActionResult> {
  return toResult(
    () => createReceivingImpl(data),
    "Gagal menyimpan penerimaan"
  );
}

async function createReceivingImpl(data: ReceivingInput) {
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

  // Header faktur, batch stok, qty_diterima PO, dan status PO ditulis
  // dalam SATU transaksi. Versi lama menulisnya berurutan dari sini:
  // kalau langkah ke-3 atau ke-4 gagal, stok sudah bertambah tapi PO
  // tidak pernah ikut terupdate.
  const { qc: qcOn } = await getFeatures(organizationId);

  const { error } = await supabase.rpc("create_receiving_tx", {
    p_organization_id: organizationId,
    p_header: {
      po_id: data.po_id,
      tanggal_terima: data.tanggal_terima,
      no_invoice: data.no_invoice?.trim() || null,
      ppn_percent: data.ppn_percent,
      top_days: data.top_days,
      jatuh_tempo:
        data.top_days == null
          ? null
          : addDaysStr(data.tanggal_terima, data.top_days),
      dibuat_oleh: profile?.id || null,
    },
    p_items: items.map((it) => ({
      po_item_id: it.po_item_id,
      item_id: it.item_id,
      qty_masuk: it.qty_masuk,
      harga_per_unit: it.harga_per_unit,
      no_lot_supplier: it.no_lot_supplier?.trim() || null,
      exp_date: it.exp_date || null,
    })),
    p_qc_on: qcOn,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/receivings");
  revalidatePath("/purchase-orders");
  revalidatePath("/items");
  revalidatePath("/payments");
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

    // Retur pembelian menunjuk ke faktur ini lewat foreign key, dan
    // barangnya sudah dikembalikan ke supplier. Tanpa guard ini yang muncul
    // cuma error FK mentah dari database, atau pesan "sudah terpakai/keluar"
    // yang menyesatkan — padahal yang terjadi barangnya diretur.
    const { count: returCount } = await supabase
      .from("purchase_returns")
      .select("id", { count: "exact", head: true })
      .eq("receiving_id", id)
      .eq("organization_id", organizationId);
    if ((returCount ?? 0) > 0)
      throw new Error(
        "Faktur ini sudah punya retur pembelian. Batalkan dulu dokumen returnya, baru penerimaan ini bisa dibatalkan."
      );

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
        "Sebagian barang sudah terpakai/keluar, penerimaan tidak bisa dibatalkan."
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
