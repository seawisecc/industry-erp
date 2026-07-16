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

      const { error } = await supabase.from("items").insert(
        valid.map((r) => ({
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
        app: "Seawise Enterprise Apps — Industry Edition",
        exported_at: new Date().toISOString(),
        organization_id: organizationId,
      },
    };

    for (const table of BACKUP_TABLES) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("organization_id", organizationId);
      // Tabel yang belum ada / kolom beda dilewati, jangan gagalkan backup
      backup[table] = error ? { _error: error.message } : data || [];
    }

    return { ok: true, json: JSON.stringify(backup, null, 2) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal membuat backup",
    };
  }
}
