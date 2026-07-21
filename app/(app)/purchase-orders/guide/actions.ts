"use server";

import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { createPO } from "../actions";

export type GuideLine = {
  supplier_id: string;
  supplier_nama: string;
  item_id: string;
  qty: number;
  harga: number;
};

/**
 * Buat PO massal dari Guide Order — baris dikelompokkan per supplier,
 * satu PO per supplier. Kalau ada yang gagal, PO lain tetap jalan dan
 * kegagalannya dilaporkan per supplier.
 */
export async function createPOsFromGuide(
  lines: GuideLine[],
  tanggal: string,
  ppnPercent: number
): Promise<{
  ok: boolean;
  error?: string;
  created?: number;
  failed?: { supplier: string; error: string }[];
}> {
  try {
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const valid = lines.filter((l) => l.supplier_id && l.item_id && l.qty > 0);
    if (valid.length === 0)
      throw new Error("Tidak ada baris dengan qty lebih dari 0");

    // Kelompokkan per supplier
    const bySupplier = new Map<string, GuideLine[]>();
    for (const l of valid) {
      const arr = bySupplier.get(l.supplier_id) || [];
      arr.push(l);
      bySupplier.set(l.supplier_id, arr);
    }

    let created = 0;
    const failed: { supplier: string; error: string }[] = [];

    for (const [supplierId, group] of bySupplier) {
      try {
        await createPO({
          supplier_id: supplierId,
          tanggal_po: tanggal,
          ppn_percent: ppnPercent,
          catatan: "Dibuat dari Guide Order",
          items: group.map((g) => ({
            item_id: g.item_id,
            qty_pesan: g.qty,
            harga_per_unit: g.harga,
          })),
        });
        created++;
      } catch (err) {
        failed.push({
          supplier: group[0].supplier_nama,
          error: err instanceof Error ? err.message : "Gagal",
        });
      }
    }

    revalidatePath("/purchase-orders");
    return { ok: created > 0, created, failed, error: created === 0 ? failed[0]?.error : undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}
