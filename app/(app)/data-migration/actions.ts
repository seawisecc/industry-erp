"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type ImportKind =
  | "suppliers"
  | "inci"
  | "materials"
  | "items"
  | "clients"
  | "products";

const CLIENT_KATEGORI = [
  "Brand Owner",
  "University/Corporation",
  "Research",
  "Reseller",
  "Walk In Customer",
  "Other",
];

type CsvRow = Record<string, string | undefined>;

export type ImportResult = { ok: true; count: number } | { ok: false; error: string };

function clean(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function parseNum(v: string | undefined): number {
  if (!v) return 0;
  return parseFloat(v.replace(",", ".")) || 0;
}

export async function runImport(
  kind: ImportKind,
  rows: CsvRow[]
): Promise<ImportResult> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();

    if (!organizationId) {
      throw new Error("Organisasi tidak terdeteksi. Refresh halaman dan login ulang.");
    }
    if (!rows || rows.length === 0) {
      throw new Error("Tidak ada baris untuk diimport");
    }

    // ================= SUPPLIER =================
    if (kind === "suppliers") {
      const valid = rows.filter((r) => clean(r.nama));
      if (valid.length === 0) throw new Error("Tidak ada baris dengan kolom nama terisi");

      const { error } = await supabase.from("suppliers").insert(
        valid.map((r) => ({
          nama: clean(r.nama)!,
          alamat: clean(r.alamat),
          nama_kontak: clean(r.nama_kontak),
          no_telp: clean(r.no_telp),
          email: clean(r.email),
          npwp: clean(r.npwp),
          organization_id: organizationId,
        }))
      );
      if (error) throw new Error(error.message);

      revalidatePath("/suppliers");
      return { ok: true, count: valid.length };
    }

    // ================= INCI MASTER =================
    if (kind === "inci") {
      const valid = rows.filter((r) => clean(r.inci_name));
      if (valid.length === 0)
        throw new Error("Tidak ada baris dengan kolom inci_name terisi");

      // Buang duplikat di dalam file (ambil kemunculan pertama)
      const seen = new Set<string>();
      const unique = valid.filter((r) => {
        const key = r.inci_name!.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const { error } = await supabase.from("inci_master").upsert(
        unique.map((r) => ({
          inci_name: clean(r.inci_name)!,
          cas_number: clean(r.cas_number),
          noael: clean(r.noael),
          function: clean(r.function),
          reference: clean(r.reference),
          organization_id: organizationId,
        })),
        { onConflict: "organization_id,inci_name", ignoreDuplicates: true }
      );
      if (error) throw new Error(error.message);

      revalidatePath("/inci");
      return { ok: true, count: unique.length };
    }

    // ================= MATERIAL =================
    if (kind === "materials") {
      const valid = rows.filter((r) => clean(r.material_code) && clean(r.tradename));
      if (valid.length === 0)
        throw new Error("Tidak ada baris dengan material_code & tradename terisi");

      // Cocokkan nama supplier → id (harus sudah terdaftar)
      const { data: suppliers } = await supabase
        .from("suppliers")
        .select("id, nama")
        .eq("organization_id", organizationId);
      const supplierMap = new Map(
        (suppliers || []).map((s) => [s.nama.trim().toLowerCase(), s.id])
      );

      const unknown = new Set<string>();
      const mapped = valid.map((r) => {
        const supNama = clean(r.nama_supplier);
        let supplier_id: string | null = null;
        if (supNama) {
          supplier_id = supplierMap.get(supNama.toLowerCase()) || null;
          if (!supplier_id) unknown.add(supNama);
        }
        const kategori =
          clean(r.kategori)?.toLowerCase() === "kemasan" ? "Kemasan" : "Bahan Baku";
        return {
          material_code: clean(r.material_code)!,
          tradename: clean(r.tradename)!,
          supplier_id,
          origin: clean(r.origin),
          noc: clean(r.noc),
          kategori,
          keterangan: clean(r.keterangan),
          organization_id: organizationId,
        };
      });

      if (unknown.size > 0) {
        throw new Error(
          `Supplier ini belum terdaftar: ${Array.from(unknown).join(", ")}. Import Supplier dulu, atau samakan penulisan namanya.`
        );
      }

      const { error } = await supabase.from("materials").insert(mapped);
      if (error) throw new Error(error.message);

      revalidatePath("/materials");
      return { ok: true, count: mapped.length };
    }

    // ================= ITEM (STOK BAHAN) =================
    if (kind === "items") {
      const valid = rows.filter((r) => clean(r.nama) && clean(r.satuan));
      if (valid.length === 0)
        throw new Error("Tidak ada baris dengan nama & satuan terisi");

      // Kode ITM-XXXX berurutan dihitung aplikasi (trigger DB sudah dilepas)
      const { data: lastItem } = await supabase
        .from("items")
        .select("kode")
        .eq("organization_id", organizationId)
        .like("kode", "ITM-%")
        .order("kode", { ascending: false })
        .limit(1);
      let seq = lastItem?.[0]?.kode
        ? parseInt((lastItem[0].kode as string).slice(4)) || 0
        : 0;

      const { error } = await supabase.from("items").insert(
        valid.map((r) => ({
          kode: "ITM-" + String(++seq).padStart(4, "0"),
          nama: clean(r.nama)!,
          kategori:
            clean(r.kategori)?.toLowerCase() === "kemasan" ? "Kemasan" : "Bahan Baku",
          satuan: clean(r.satuan)!,
          stok_minimum: parseNum(r.stok_minimum),
          organization_id: organizationId,
        }))
      );
      if (error) throw new Error(error.message);

      revalidatePath("/items");
      return { ok: true, count: valid.length };
    }

    // ================= CLIENTS =================
    if (kind === "clients") {
      const valid = rows.filter((r) => clean(r.company_brand));
      if (valid.length === 0)
        throw new Error("Tidak ada baris dengan company_brand terisi");

      // Kode berurutan CL-XXXX melanjutkan yang sudah ada
      const { data: lastRow } = await supabase
        .from("clients")
        .select("kode")
        .eq("organization_id", organizationId)
        .not("kode", "is", null)
        .order("kode", { ascending: false })
        .limit(1);
      const last = lastRow?.[0]?.kode as string | undefined;
      let seq = last?.startsWith("CL-") ? parseInt(last.slice(3)) || 0 : 0;

      const { error } = await supabase.from("clients").insert(
        valid.map((r) => {
          seq += 1;
          const kat = clean(r.kategori);
          return {
            kode: "CL-" + String(seq).padStart(4, "0"),
            company_brand: clean(r.company_brand)!,
            cp: clean(r.cp),
            npwp: clean(r.npwp),
            phone: clean(r.phone),
            kategori:
              CLIENT_KATEGORI.find(
                (k) => k.toLowerCase() === (kat || "").toLowerCase()
              ) || "Other",
            alamat: clean(r.alamat),
            aktif: true,
            organization_id: organizationId,
          };
        })
      );
      if (error) throw new Error(error.message);

      revalidatePath("/clients");
      return { ok: true, count: valid.length };
    }

    // ================= PRODUCTS =================
    if (kind === "products") {
      const valid = rows.filter((r) => clean(r.nama_produk));
      if (valid.length === 0)
        throw new Error("Tidak ada baris dengan nama_produk terisi");

      const { error } = await supabase.from("products").insert(
        valid.map((r) => ({
          nama_produk: clean(r.nama_produk)!,
          brand: clean(r.brand),
          kategori: clean(r.kategori),
          batch_size_kg: r.batch_size_kg ? parseNum(r.batch_size_kg) : null,
          aktif: true,
          organization_id: organizationId,
        }))
      );
      if (error) throw new Error(error.message);

      revalidatePath("/products");
      return { ok: true, count: valid.length };
    }

    throw new Error("Jenis import tidak dikenal");
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal mengimport data",
    };
  }
}

// ================= EXPORT CSV PER JENIS DATA =================

/**
 * Ambil SELURUH baris sebuah tabel dengan cara halaman-per-halaman.
 *
 * PostgREST memotong hasil di batas baris maksimum. Untuk daftar di
 * layar itu cuma bikin data lama tidak kelihatan, tapi untuk export
 * jauh lebih berbahaya: file-nya kelihatan normal padahal isinya
 * kurang, dan tidak ada satu pun tanda bahwa ada yang hilang.
 */
const EXPORT_PAGE = 1000;

async function fetchAllRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  select: string,
  organizationId: string,
  orderBy = "id"
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += EXPORT_PAGE) {
    let q = supabase
      .from(table)
      .select(select)
      .eq("organization_id", organizationId)
      .order(orderBy);
    // Tiebreaker, supaya urutan stabil dan paging tidak melompati baris
    if (orderBy !== "id") q = q.order("id");

    const { data, error } = await q.range(from, from + EXPORT_PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data || []) as unknown as Record<string, unknown>[];
    out.push(...batch);
    if (batch.length < EXPORT_PAGE) break;
  }
  return out;
}

/** null/undefined jadi string kosong, sisanya apa adanya. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

type ExportSpec = {
  table: string;
  select: string;
  orderBy: string;
  /** Kunci hasilnya HARUS sama dengan kolom template import. */
  map: (r: Record<string, unknown>) => Record<string, string>;
};

const EXPORT_SPEC: Record<ImportKind, ExportSpec> = {
  suppliers: {
    table: "suppliers",
    select: "id, nama, alamat, nama_kontak, no_telp, email, npwp",
    orderBy: "nama",
    map: (r) => ({
      nama: cell(r.nama),
      alamat: cell(r.alamat),
      nama_kontak: cell(r.nama_kontak),
      no_telp: cell(r.no_telp),
      email: cell(r.email),
      npwp: cell(r.npwp),
    }),
  },
  inci: {
    table: "inci_master",
    select: "id, inci_name, cas_number, noael, function, reference",
    orderBy: "inci_name",
    map: (r) => ({
      inci_name: cell(r.inci_name),
      cas_number: cell(r.cas_number),
      noael: cell(r.noael),
      function: cell(r.function),
      reference: cell(r.reference),
    }),
  },
  materials: {
    table: "materials",
    select:
      "id, material_code, tradename, origin, noc, kategori, keterangan, suppliers(nama)",
    orderBy: "material_code",
    // nama_supplier sengaja diekspor sebagai NAMA (bukan id) supaya
    // file hasil export bisa langsung di-import balik.
    map: (r) => ({
      material_code: cell(r.material_code),
      tradename: cell(r.tradename),
      nama_supplier: cell(
        (r.suppliers as { nama?: string } | null)?.nama ?? ""
      ),
      origin: cell(r.origin),
      noc: cell(r.noc),
      kategori: cell(r.kategori),
      keterangan: cell(r.keterangan),
    }),
  },
  items: {
    table: "items",
    select: "id, nama, satuan, kategori, stok_minimum",
    orderBy: "kode",
    map: (r) => ({
      nama: cell(r.nama),
      satuan: cell(r.satuan),
      kategori: cell(r.kategori),
      stok_minimum: cell(r.stok_minimum),
    }),
  },
  clients: {
    table: "clients",
    select: "id, company_brand, cp, phone, npwp, kategori, alamat",
    orderBy: "kode",
    map: (r) => ({
      company_brand: cell(r.company_brand),
      cp: cell(r.cp),
      phone: cell(r.phone),
      npwp: cell(r.npwp),
      kategori: cell(r.kategori),
      alamat: cell(r.alamat),
    }),
  },
  products: {
    table: "products",
    select: "id, nama_produk, brand, kategori, batch_size_kg",
    orderBy: "kode",
    map: (r) => ({
      nama_produk: cell(r.nama_produk),
      brand: cell(r.brand),
      kategori: cell(r.kategori),
      batch_size_kg: cell(r.batch_size_kg),
    }),
  },
};

/**
 * Ekspor satu jenis data ke bentuk baris siap-CSV.
 *
 * Kolomnya sengaja identik dengan template import jenis yang sama,
 * jadi hasil export bisa dibuka di Excel, disunting, lalu di-upload
 * balik lewat kartu yang sama tanpa perlu menata ulang kolom.
 */
export async function exportCsvData(
  kind: ImportKind
): Promise<
  { ok: true; rows: Record<string, string>[] } | { ok: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) {
      throw new Error("Organisasi tidak terdeteksi. Refresh halaman dan login ulang.");
    }

    const spec = EXPORT_SPEC[kind];
    if (!spec) throw new Error("Jenis data tidak dikenal");

    const raw = await fetchAllRows(
      supabase,
      spec.table,
      spec.select,
      organizationId,
      spec.orderBy
    );

    return { ok: true, rows: raw.map(spec.map) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal menyiapkan export",
    };
  }
}

// ================= EXPORT / BACKUP =================

const BACKUP_TABLES = [
  "suppliers",
  "inci_master",
  "materials",
  "material_inci",
  "items",
  "purchase_orders",
  "po_items",
  "receivings",
  "purchase_batches",
  "products",
  "product_formulas",
  "product_variants",
  "variant_packaging",
  "production_plans",
  "production_batches",
  "production_outputs",
  "production_components",
  "stock_adjustments",
  "stock_adjustment_items",
  "clients",
  "organization_settings",
];

export async function exportBackup(): Promise<
  { ok: true; json: string } | { ok: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) {
      throw new Error("Organisasi tidak terdeteksi. Refresh halaman dan login ulang.");
    }

    const backup: Record<string, unknown> = {
      _meta: {
        app: "Industry Management by Seawise Studio",
        exported_at: new Date().toISOString(),
        organization_id: organizationId,
      },
    };

    for (const table of BACKUP_TABLES) {
      try {
        // Dibaca halaman-per-halaman: `select("*")` polos akan terpotong
        // di batas baris PostgREST, dan backup yang diam-diam kurang isi
        // jauh lebih berbahaya daripada backup yang gagal terang-terangan.
        backup[table] = await fetchAllRows(supabase, table, "*", organizationId);
      } catch (err) {
        // Tabel yang belum ada / kolom beda dilewati, jangan gagalkan backup
        backup[table] = {
          _error: err instanceof Error ? err.message : "Gagal dibaca",
        };
      }
    }

    return { ok: true, json: JSON.stringify(backup, null, 2) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal membuat backup",
    };
  }
}
