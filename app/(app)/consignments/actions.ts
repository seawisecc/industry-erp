"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { computeTotals } from "@/lib/invoiceMath";
import { revalidatePath } from "next/cache";

export type ConsignItemInput = {
  product_id: string;
  varian_ukuran: string | null;
  qty_kirim: number;
  harga_jual: number;
};

export async function createConsignment(data: {
  client_id: string;
  tanggal_kirim: string;
  catatan: string | null;
  items: ConsignItemInput[];
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    if (!data.client_id) throw new Error("Client wajib dipilih");
    if (!data.tanggal_kirim) throw new Error("Tanggal kirim wajib diisi");
    const items = data.items.filter((it) => it.product_id && it.qty_kirim > 0);
    if (items.length === 0) throw new Error("Minimal satu produk dikirim");

    // Cek stok + penomoran + insert atomik di database (advisory lock)
    const { error } = await supabase.rpc("create_consignment_tx", {
      p_organization_id: organizationId,
      p_header: {
        client_id: data.client_id,
        tanggal_kirim: data.tanggal_kirim,
        catatan: data.catatan?.trim() || null,
        dibuat_oleh: profile?.id || null,
      },
      p_items: items.map((it) => ({
        product_id: it.product_id,
        varian_ukuran: it.varian_ukuran,
        qty_kirim: it.qty_kirim,
        harga_jual: it.harga_jual,
      })),
    });
    if (error) throw new Error(error.message);

    revalidatePath("/consignments");
    revalidatePath("/finished-goods");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

export async function reportConsignmentSale(
  consignmentId: string,
  data: {
    items: { consignment_item_id: string; qty_laku: number }[];
    diskon_percent: number;
    pakai_tax: boolean;
    tax_percent: number;
    top_days: number | null;
  }
): Promise<{ ok: boolean; error?: string; invoiceId?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const { data: cons } = await supabase
      .from("consignments")
      .select("id, client_id, status, consignment_items(id, product_id, varian_ukuran, qty_kirim, qty_terjual, qty_retur, harga_jual)")
      .eq("id", consignmentId)
      .eq("organization_id", organizationId)
      .single();
    if (!cons) throw new Error("Konsinyasi tidak ditemukan");
    if (cons.status !== "Aktif") throw new Error("Konsinyasi sudah selesai");

    const consItems = cons.consignment_items as {
      id: string;
      product_id: string;
      varian_ukuran: string | null;
      qty_kirim: number;
      qty_terjual: number;
      qty_retur: number;
      harga_jual: number;
    }[];

    const laku = data.items.filter((it) => it.qty_laku > 0);
    if (laku.length === 0) throw new Error("Minimal satu item laku");

    const invItems: {
      product_id: string;
      varian_ukuran: string | null;
      qty: number;
      harga: number;
    }[] = [];

    for (const it of laku) {
      const ci = consItems.find((c) => c.id === it.consignment_item_id);
      if (!ci) throw new Error("Item konsinyasi tidak ditemukan");
      const sisa = Number(ci.qty_kirim) - Number(ci.qty_terjual) - Number(ci.qty_retur);
      if (it.qty_laku > sisa) {
        throw new Error(
          `Qty laku melebihi sisa di lokasi konsinyasi (sisa ${sisa.toLocaleString("id-ID")} pcs)`
        );
      }
      invItems.push({
        product_id: ci.product_id,
        varian_ukuran: ci.varian_ukuran,
        qty: it.qty_laku,
        harga: Number(ci.harga_jual),
      });
    }

    const { subtotal, total } = computeTotals(
      invItems,
      data.diskon_percent,
      data.pakai_tax,
      data.tax_percent
    );

    const today = new Date().toLocaleDateString("sv-SE");
    const jatuhTempoDate =
      data.top_days == null ? null : new Date(today + "T00:00:00");
    if (jatuhTempoDate) jatuhTempoDate.setDate(jatuhTempoDate.getDate() + data.top_days!);
    const jatuhTempo = jatuhTempoDate
      ? jatuhTempoDate.toLocaleDateString("sv-SE")
      : null;

    // Sumber Konsinyasi tidak memotong stok jual — RPC hanya mengamankan
    // penomoran invoice dari duplikat.
    const { data: invoiceId, error } = await supabase.rpc(
      "create_sales_invoice_tx",
      {
        p_organization_id: organizationId,
        p_header: {
          tipe: "Proforma",
          sumber: "Konsinyasi",
          client_id: cons.client_id,
          consignment_id: consignmentId,
          tanggal: today,
          diskon_percent: data.diskon_percent,
          pakai_tax: data.pakai_tax,
          tax_percent: data.tax_percent,
          subtotal,
          total,
          top_days: data.top_days,
          jatuh_tempo: jatuhTempo,
          dibuat_oleh: profile?.id || null,
        },
        p_items: invItems.map((it) => ({
          product_id: it.product_id,
          varian_ukuran: it.varian_ukuran,
          qty: it.qty,
          harga: it.harga,
        })),
      }
    );
    if (error) throw new Error(error.message);

    // Update qty_terjual
    for (const it of laku) {
      const ci = consItems.find((c) => c.id === it.consignment_item_id)!;
      const { error: uErr } = await supabase
        .from("consignment_items")
        .update({ qty_terjual: Number(ci.qty_terjual) + it.qty_laku })
        .eq("id", it.consignment_item_id);
      if (uErr) throw new Error(uErr.message);
    }

    revalidatePath("/consignments");
    revalidatePath("/sales-invoices");
    revalidatePath("/sales-payments");
    return { ok: true, invoiceId: invoiceId as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

export async function closeConsignment(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const { data: cons } = await supabase
      .from("consignments")
      .select("id, status, consignment_items(id, qty_kirim, qty_terjual, qty_retur)")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single();
    if (!cons) throw new Error("Konsinyasi tidak ditemukan");
    if (cons.status !== "Aktif") throw new Error("Sudah selesai");

    // Sisa yang tidak laku dianggap retur (kembali ke stok)
    for (const ci of cons.consignment_items as {
      id: string;
      qty_kirim: number;
      qty_terjual: number;
      qty_retur: number;
    }[]) {
      const sisa =
        Number(ci.qty_kirim) - Number(ci.qty_terjual) - Number(ci.qty_retur);
      if (sisa > 0) {
        const { error } = await supabase
          .from("consignment_items")
          .update({ qty_retur: Number(ci.qty_retur) + sisa })
          .eq("id", ci.id);
        if (error) throw new Error(error.message);
      }
    }

    const { error } = await supabase
      .from("consignments")
      .update({ status: "Selesai" })
      .eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/consignments");
    revalidatePath("/finished-goods");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

/* ============================================================
   Laku / Retur di level OUTLET (client) — distribusi lintas
   pengiriman, pengiriman tertua dulu (FIFO). Memudahkan pencatatan
   dari rekap stok per outlet tanpa buka satu-satu pengiriman.
   ============================================================ */

export type OutletLine = {
  product_id: string;
  varian_ukuran: string | null;
  qty: number;
  harga?: number;
};

type CiRow = {
  id: string;
  product_id: string;
  varian_ukuran: string | null;
  qty_kirim: number;
  qty_terjual: number;
  qty_retur: number;
  harga_jual: number;
  consignments: { client_id: string; tanggal_kirim: string; status: string } | null;
};

const vkey = (v: string | null) => v || "-";

async function ambilItemAktif(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  clientId: string
): Promise<CiRow[]> {
  const { data } = await supabase
    .from("consignment_items")
    .select(
      "id, product_id, varian_ukuran, qty_kirim, qty_terjual, qty_retur, harga_jual, consignments!inner(client_id, tanggal_kirim, status)"
    )
    .eq("organization_id", organizationId)
    .eq("consignments.client_id", clientId)
    .eq("consignments.status", "Aktif");
  const rows = (data || []) as unknown as CiRow[];
  // tertua dulu
  rows.sort((a, b) =>
    (a.consignments?.tanggal_kirim || "").localeCompare(
      b.consignments?.tanggal_kirim || ""
    )
  );
  return rows;
}

// Bagikan qty ke beberapa baris pengiriman; menambah kolom `field`.
async function distribusi(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: CiRow[],
  line: OutletLine,
  field: "qty_terjual" | "qty_retur"
) {
  const cocok = rows.filter(
    (r) =>
      r.product_id === line.product_id &&
      vkey(r.varian_ukuran) === vkey(line.varian_ukuran)
  );
  const totalSisa = cocok.reduce(
    (s, r) => s + (Number(r.qty_kirim) - Number(r.qty_terjual) - Number(r.qty_retur)),
    0
  );
  if (line.qty > totalSisa + 0.001)
    throw new Error(
      `Qty melebihi sisa di outlet (sisa ${totalSisa}) untuk salah satu produk`
    );

  let perlu = line.qty;
  for (const r of cocok) {
    if (perlu <= 0) break;
    const sisa = Number(r.qty_kirim) - Number(r.qty_terjual) - Number(r.qty_retur);
    if (sisa <= 0) continue;
    const ambil = Math.min(sisa, perlu);
    const nilaiBaru = Number(r[field]) + ambil;
    const { error } = await supabase
      .from("consignment_items")
      .update({ [field]: nilaiBaru })
      .eq("id", r.id);
    if (error) throw new Error(error.message);
    perlu -= ambil;
  }
}

/** Catat penjualan laku di sebuah outlet → potong stok + buat Proforma Invoice. */
export async function reportOutletSale(
  clientId: string,
  lines: OutletLine[],
  opts: { diskon_percent: number; pakai_tax: boolean; tax_percent: number; top_days: number | null }
): Promise<{ ok: boolean; error?: string; invoiceId?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const items = lines.filter((l) => l.product_id && l.qty > 0);
    if (items.length === 0) throw new Error("Isi minimal satu produk yang laku");

    const rows = await ambilItemAktif(supabase, organizationId, clientId);

    // harga default dari harga_jual pengiriman bila tidak dikirim
    const hargaOf = (l: OutletLine) => {
      if (l.harga && l.harga > 0) return l.harga;
      const r = rows.find(
        (x) =>
          x.product_id === l.product_id &&
          vkey(x.varian_ukuran) === vkey(l.varian_ukuran)
      );
      return Number(r?.harga_jual || 0);
    };

    // 1) potong stok (qty_terjual) lintas pengiriman
    for (const l of items) await distribusi(supabase, rows, l, "qty_terjual");

    // 2) buat proforma invoice
    const invItems = items.map((l) => ({
      product_id: l.product_id,
      varian_ukuran: l.varian_ukuran,
      qty: l.qty,
      harga: hargaOf(l),
    }));
    const { subtotal, total } = computeTotals(
      invItems,
      opts.diskon_percent,
      opts.pakai_tax,
      opts.tax_percent
    );
    const today = new Date().toLocaleDateString("sv-SE");
    const jatuhTempo =
      opts.top_days == null
        ? null
        : (() => {
            const d = new Date(today + "T00:00:00");
            d.setDate(d.getDate() + opts.top_days!);
            return d.toLocaleDateString("sv-SE");
          })();

    const { data: invoiceId, error } = await supabase.rpc(
      "create_sales_invoice_tx",
      {
        p_organization_id: organizationId,
        p_header: {
          tipe: "Proforma",
          sumber: "Konsinyasi",
          client_id: clientId,
          tanggal: today,
          diskon_percent: opts.diskon_percent,
          pakai_tax: opts.pakai_tax,
          tax_percent: opts.tax_percent,
          subtotal,
          total,
          top_days: opts.top_days,
          jatuh_tempo: jatuhTempo,
          dibuat_oleh: profile?.id || null,
        },
        p_items: invItems,
      }
    );
    if (error) throw new Error(error.message);

    revalidatePath("/consignments");
    revalidatePath("/sales-invoices");
    revalidatePath("/sales-payments");
    revalidatePath("/finished-goods");
    return { ok: true, invoiceId: invoiceId as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

/** Catat retur di sebuah outlet → barang kembali ke stok produk jadi. */
export async function returOutlet(
  clientId: string,
  lines: OutletLine[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const items = lines.filter((l) => l.product_id && l.qty > 0);
    if (items.length === 0) throw new Error("Isi minimal satu produk yang diretur");

    const rows = await ambilItemAktif(supabase, organizationId, clientId);
    for (const l of items) await distribusi(supabase, rows, l, "qty_retur");

    revalidatePath("/consignments");
    revalidatePath("/finished-goods");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}
