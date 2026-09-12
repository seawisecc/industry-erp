"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { keNilai, normalisasiTempel } from "@/lib/angka";

export type ImportKind =
  | "suppliers"
  | "inci"
  | "materials"
  | "material_inci"
  | "items"
  | "clients"
  | "products"
  | "services";

const CLIENT_KATEGORI = [
  "Brand Owner",
  "University/Corporation",
  "Research",
  "Reseller",
  "Walk In Customer",
  "Other",
];

type CsvRow = Record<string, string | undefined>;

export type ImportResult =
  | {
      ok: true;
      count: number;
      /** Data tetap tersimpan, tapi ada yang perlu dicek orang. */
      peringatan?: string;
    }
  | { ok: false; error: string };

function clean(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function parseNum(v: string | undefined): number {
  if (!v) return 0;
  return parseFloat(v.replace(",", ".")) || 0;
}

/**
 * Angka dari CSV: null kalau kosong, NaN kalau isinya bukan angka.
 *
 * Aturannya sama dengan teks yang DITEMPEL ke NumberInput
 * (`normalisasiTempel`): titik yang diikuti tepat tiga angka adalah
 * pemisah ribuan, selebihnya desimal. Jadi "1.500.000" dari Excel
 * Indonesia dan "1500.75" dari Excel berbahasa Inggris sama-sama
 * terbaca benar.
 *
 * NaN sengaja dibedakan dari nol, beda dengan `parseNum`: "Rp 5rb"
 * yang terbaca 0 tersimpan tanpa error, dan nol di kolom harga
 * terlihat seperti data yang sah.
 */
function angkaCsv(v: string | undefined): number | null {
  const t = v?.replace(/\s/g, "");
  if (!t) return null;
  if (!/^-?[\d.,]+$/.test(t)) return NaN;
  return parseFloat(keNilai(normalisasiTempel(t), { negatif: true }));
}

/**
 * Persentase dari CSV. Beda dengan `angkaCsv`, titik di sini SELALU
 * desimal: persen tidak pernah butuh pemisah ribuan, dan tanpa aturan
 * ini "1.125" (1,125%) terbaca seribu seratus dua puluh lima.
 */
function persenCsv(v: string | undefined): number | null {
  const t = v?.replace(/\s/g, "").replace(/%$/, "");
  if (!t) return null;
  if (!/^\d+([.,]\d+)?$/.test(t)) return NaN;
  return parseFloat(t.replace(",", "."));
}

/** Daftar untuk pesan error, dipotong supaya file besar tidak jadi paragraf. */
function sebutkan(daftar: Iterable<string | number>, maks = 10): string {
  const semua = Array.from(daftar, String);
  if (semua.length <= maks) return semua.join(", ");
  return `${semua.slice(0, maks).join(", ")}, dan ${semua.length - maks} lainnya`;
}

/**
 * Kolom status di CSV. Kosong dianggap aktif, orang yang mengetik
 * daftar jasa baru jarang mengisi kolom ini, dan default "nonaktif"
 * membuat datanya tidak muncul di Invoice tanpa sebab yang jelas.
 */
function parseAktif(v: string | undefined): boolean {
  const t = v?.trim().toLowerCase();
  if (!t) return true;
  return !["0", "false", "nonaktif", "non aktif", "tidak", "no", "n"].includes(t);
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
      // Angka yang tidak terbaca ditolak, bukan dijadikan nol: harga
      // referensi nol lolos ke perkiraan biaya R&D sebagai harga yang sah.
      const angkaSalah: string[] = [];
      const mapped = valid.map((r) => {
        const supNama = clean(r.nama_supplier);
        let supplier_id: string | null = null;
        if (supNama) {
          supplier_id = supplierMap.get(supNama.toLowerCase()) || null;
          if (!supplier_id) unknown.add(supNama);
        }
        const kategori =
          clean(r.kategori)?.toLowerCase() === "kemasan" ? "Kemasan" : "Bahan Baku";
        const material_code = clean(r.material_code)!;
        const harga_referensi = angkaCsv(r.harga_referensi);
        const moq = angkaCsv(r.moq);
        if (harga_referensi !== null && !(harga_referensi >= 0)) {
          angkaSalah.push(`${material_code} (harga_referensi)`);
        }
        if (moq !== null && !(moq >= 0)) {
          angkaSalah.push(`${material_code} (moq)`);
        }
        return {
          material_code,
          tradename: clean(r.tradename)!,
          supplier_id,
          origin: clean(r.origin),
          noc: clean(r.noc),
          kategori,
          keterangan: clean(r.keterangan),
          harga_referensi,
          moq,
          organization_id: organizationId,
        };
      });

      if (unknown.size > 0) {
        throw new Error(
          `Supplier ini belum terdaftar: ${Array.from(unknown).join(", ")}. Import Supplier dulu, atau samakan penulisan namanya.`
        );
      }
      if (angkaSalah.length > 0) {
        throw new Error(
          `Angka tidak terbaca atau negatif: ${sebutkan(angkaSalah)}. Isi angka saja, tanpa "Rp" atau satuan.`
        );
      }

      const { error } = await supabase.from("materials").insert(mapped);
      if (error) throw new Error(error.message);

      revalidatePath("/materials");
      return { ok: true, count: mapped.length };
    }

    // ================= KOMPOSISI INCI MATERIAL =================
    // Satu baris CSV = satu pasangan material dan INCI. Komposisi tiap
    // material yang disebut di file DIGANTI utuh, sama dengan form
    // Material; yang tidak disebut tidak disentuh. Hapus-lalu-sisipnya di
    // dalam import_material_inci_tx: sisip yang gagal sesudah hapus
    // meninggalkan puluhan material tanpa komposisi.
    if (kind === "material_inci") {
      // Nomor baris mengikuti Excel: baris 1 adalah header
      const isi = rows
        .map((r, i) => ({ r, baris: i + 2 }))
        .filter(
          ({ r }) => clean(r.material_code) || clean(r.inci_name) || clean(r.percentage)
        );
      if (isi.length === 0) throw new Error("Tidak ada baris komposisi yang terisi");

      const tidakLengkap = isi.filter(
        ({ r }) => !clean(r.material_code) || !clean(r.inci_name) || !clean(r.percentage)
      );
      if (tidakLengkap.length > 0) {
        throw new Error(
          `Baris ${sebutkan(tidakLengkap.map((x) => x.baris))} belum lengkap: material_code, inci_name, dan percentage wajib diisi.`
        );
      }

      const persenSalah = isi.filter(({ r }) => {
        const p = persenCsv(r.percentage);
        return p === null || !(p >= 0 && p <= 100);
      });
      if (persenSalah.length > 0) {
        throw new Error(
          `Baris ${sebutkan(persenSalah.map((x) => x.baris))}: percentage harus angka 0 sampai 100.`
        );
      }

      // Dibaca halaman-per-halaman: master yang terpotong di batas baris
      // PostgREST akan melaporkan material yang ada sebagai "belum terdaftar".
      const [materials, incis] = await Promise.all([
        fetchAllRows(supabase, "materials", "id, material_code, kategori", organizationId),
        fetchAllRows(supabase, "inci_master", "id, inci_name", organizationId),
      ]);
      // Tidak peka huruf besar-kecil, sama dengan cek kode dobel di form Material
      const materialMap = new Map(
        materials.map((m) => [String(m.material_code).trim().toLowerCase(), m])
      );
      const inciMap = new Map(
        incis.map((i) => [String(i.inci_name).trim().toLowerCase(), String(i.id)])
      );

      const kodeAsing = new Set<string>();
      const inciAsing = new Set<string>();
      const kemasan = new Set<string>();
      const dobel = new Set<string>();
      const pasangan = new Set<string>();
      const totalPersen = new Map<string, number>();

      const items = isi.map(({ r }) => {
        const kode = clean(r.material_code)!;
        const nama = clean(r.inci_name)!;
        const m = materialMap.get(kode.toLowerCase());
        const inciId = inciMap.get(nama.toLowerCase());
        if (!m) kodeAsing.add(kode);
        else if (m.kategori === "Kemasan") kemasan.add(String(m.material_code));
        if (!inciId) inciAsing.add(nama);

        const kunci = `${kode.toLowerCase()}|${nama.toLowerCase()}`;
        if (pasangan.has(kunci)) dobel.add(`${kode} · ${nama}`);
        pasangan.add(kunci);

        const percentage = persenCsv(r.percentage)!;
        const kodeResmi = m ? String(m.material_code) : kode;
        totalPersen.set(kodeResmi, (totalPersen.get(kodeResmi) ?? 0) + percentage);

        return { material_id: m?.id, inci_master_id: inciId, percentage };
      });

      if (kodeAsing.size > 0) {
        throw new Error(
          `Material ini belum terdaftar: ${sebutkan(kodeAsing)}. Import Material dulu, atau samakan kodenya.`
        );
      }
      if (inciAsing.size > 0) {
        throw new Error(
          `INCI ini belum ada di INCI Master: ${sebutkan(inciAsing)}. Import INCI Master dulu, atau samakan penulisannya.`
        );
      }
      if (kemasan.size > 0) {
        throw new Error(
          `Material kemasan tidak punya komposisi INCI: ${sebutkan(kemasan)}. Hapus barisnya dari file.`
        );
      }
      if (dobel.size > 0) {
        throw new Error(
          `INCI yang sama diisi dua kali untuk satu material: ${sebutkan(dobel)}. Sisakan satu baris.`
        );
      }

      const { error } = await supabase.rpc("import_material_inci_tx", {
        p_organization_id: organizationId,
        p_items: items,
      });
      if (error) throw new Error(error.message);

      // Diperingatkan, tidak ditolak, sama dengan form Material
      const belum100 = Array.from(totalPersen)
        .filter(([, total]) => Math.abs(total - 100) > 0.01)
        .map(
          ([kode, total]) =>
            `${kode} (${total.toLocaleString("id-ID", { maximumFractionDigits: 4 })}%)`
        );

      revalidatePath("/materials");
      return {
        ok: true,
        count: items.length,
        peringatan:
          belum100.length > 0
            ? `Tersimpan, tapi total komposisi belum 100%: ${sebutkan(belum100)}.`
            : undefined,
      };
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

    // ================= LAYANAN JASA =================
    if (kind === "services") {
      const valid = rows.filter((r) => clean(r.nama_jasa));
      if (valid.length === 0)
        throw new Error("Tidak ada baris dengan nama_jasa terisi");

      // Duplikat DI DALAM file (ambil kemunculan pertama), sekaligus
      // kumpulkan namanya untuk dicocokkan dengan yang sudah terdaftar.
      const seen = new Set<string>();
      const dobelDiFile = new Set<string>();
      const unique = valid.filter((r) => {
        const key = clean(r.nama_jasa)!.toLowerCase();
        if (seen.has(key)) {
          dobelDiFile.add(clean(r.nama_jasa)!);
          return false;
        }
        seen.add(key);
        return true;
      });
      if (dobelDiFile.size > 0) {
        throw new Error(
          `Nama jasa dobel di dalam file: ${Array.from(dobelDiFile).join(", ")}. Sisakan satu baris per jasa.`
        );
      }

      // Cegah dobel dengan yang sudah ada, aturan sama dengan form Services
      const { data: existing } = await supabase
        .from("services")
        .select("nama_jasa")
        .eq("organization_id", organizationId);
      const sudahAda = new Set(
        ((existing || []) as { nama_jasa: string }[]).map((s) =>
          s.nama_jasa.trim().toLowerCase()
        )
      );
      const bentrok = unique
        .map((r) => clean(r.nama_jasa)!)
        .filter((n) => sudahAda.has(n.toLowerCase()));
      if (bentrok.length > 0) {
        throw new Error(
          `Jasa ini sudah terdaftar: ${bentrok.join(", ")}. Hapus barisnya dari file, atau ubah lewat menu Services.`
        );
      }

      const negatif = unique.filter((r) => parseNum(r.biaya) < 0);
      if (negatif.length > 0) {
        throw new Error("Kolom biaya tidak boleh negatif");
      }

      // Kode SRV-XXXX berurutan melanjutkan yang sudah ada, pola sama
      // dengan nextServiceKode di app/(app)/services/actions.ts
      const { data: lastRow } = await supabase
        .from("services")
        .select("kode")
        .eq("organization_id", organizationId)
        .like("kode", "SRV-%")
        .order("kode", { ascending: false })
        .limit(1);
      const last = lastRow?.[0]?.kode as string | undefined;
      let seq = last ? parseInt(last.slice(4)) || 0 : 0;

      const { error } = await supabase.from("services").insert(
        unique.map((r) => ({
          kode: "SRV-" + String(++seq).padStart(4, "0"),
          nama_jasa: clean(r.nama_jasa)!,
          keterangan: clean(r.keterangan),
          biaya: parseNum(r.biaya),
          aktif: parseAktif(r.aktif),
          organization_id: organizationId,
        }))
      );
      if (error) throw new Error(error.message);

      revalidatePath("/services");
      return { ok: true, count: unique.length };
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

/**
 * Angka untuk kolom yang dibaca balik lewat `angkaCsv`. `String(12.345)`
 * menghasilkan "12.345", yang di sisi import terbaca dua belas ribu
 * tiga ratus empat puluh lima karena titiknya diikuti tepat tiga angka.
 * Nol di ekor mematahkan pola itu tanpa mengubah nilainya.
 */
function angkaEkspor(v: unknown): string {
  const s = cell(v);
  return /\.\d{3}$/.test(s) ? s + "0" : s;
}

type ExportSpec = {
  table: string;
  select: string;
  orderBy: string;
  /** Kunci hasilnya HARUS sama dengan kolom template import. */
  map: (r: Record<string, unknown>) => Record<string, string>;
  /** Urutan akhir, untuk yang tidak bisa diurutkan lewat kolom tabelnya sendiri. */
  urut?: (a: Record<string, string>, b: Record<string, string>) => number;
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
      "id, material_code, tradename, origin, noc, kategori, keterangan, harga_referensi, moq, suppliers(nama)",
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
      harga_referensi: angkaEkspor(r.harga_referensi),
      moq: angkaEkspor(r.moq),
    }),
  },
  material_inci: {
    table: "material_inci",
    select: "id, material_id, inci_name, percentage, materials(material_code)",
    orderBy: "material_id",
    // Kode material, bukan id, alasan yang sama dengan nama_supplier
    map: (r) => ({
      material_code: cell(
        (r.materials as { material_code?: string } | null)?.material_code ?? ""
      ),
      inci_name: cell(r.inci_name),
      percentage: cell(r.percentage),
    }),
    // Dikelompokkan per kode material, persen terbesar dulu. Urutan dari
    // database cuma per material_id, yang tidak berarti apa-apa di Excel.
    urut: (a, b) =>
      a.material_code.localeCompare(b.material_code, undefined, { numeric: true }) ||
      Number(b.percentage) - Number(a.percentage) ||
      a.inci_name.localeCompare(b.inci_name),
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
  services: {
    table: "services",
    select: "id, nama_jasa, keterangan, biaya, aktif",
    orderBy: "kode",
    // Kode SRV-XXXX tidak ikut, sama seperti clients & products: kodenya
    // dibuat ulang saat import supaya file hasil export bisa dipakai di
    // organisasi lain tanpa bentrok penomoran.
    map: (r) => ({
      nama_jasa: cell(r.nama_jasa),
      keterangan: cell(r.keterangan),
      biaya: cell(r.biaya),
      aktif: r.aktif ? "Aktif" : "Nonaktif",
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

    const rows = raw.map(spec.map);
    if (spec.urut) rows.sort(spec.urut);
    return { ok: true, rows };
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
  "purchase_returns",
  "purchase_return_items",
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
  "stock_opnames",
  "stock_opname_items",
  "material_issues",
  "material_issue_items",
  "clients",
  "client_prices",
  "services",
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
