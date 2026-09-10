import { createClient } from "@/lib/supabase/server";
import { kunciBahan, type BahanRnd } from "@/lib/rndCost";
import type { ClientOption } from "@/components/ClientPicker";

type MaterialRaw = {
  id: string;
  material_code: string;
  tradename: string;
  kategori: "Bahan Baku" | "Kemasan";
  item_id: string | null;
  suppliers: { nama: string } | null;
  material_inci: { inci_name: string; percentage: number | null }[];
};

type ItemRaw = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  kategori: "Bahan Baku" | "Kemasan";
};

type BatchRaw = { item_id: string; qty_sisa: number; harga_per_unit: number };

/** Berapa nama INCI yang ditulis sebelum dipotong. */
const INCI_TAMPIL = 4;

/**
 * Ringkasan INCI satu bahan, mis. "Aqua 70%, Glycerin 5%, +3 lagi".
 *
 * Dipotong karena barisnya muncul di daftar saran pemilih, dan satu
 * bahan bisa punya belasan INCI. Yang penting di situ mengenali
 * bahannya, bukan membaca komposisi lengkapnya.
 */
function ringkasInci(rows: MaterialRaw["material_inci"]): string | null {
  if (!rows || rows.length === 0) return null;
  const urut = [...rows].sort(
    (a, b) => Number(b.percentage ?? 0) - Number(a.percentage ?? 0)
  );
  const tampil = urut.slice(0, INCI_TAMPIL).map((r) => {
    const p = r.percentage == null ? null : Number(r.percentage);
    return p ? `${r.inci_name} ${p.toLocaleString("id-ID")}%` : r.inci_name;
  });
  const sisa = urut.length - tampil.length;
  return tampil.join(", ") + (sisa > 0 ? `, +${sisa} lagi` : "");
}

/**
 * Daftar bahan untuk modul R&D, plus daftar client.
 *
 * Sumbernya `materials`, MASTER bahan, bukan `items` yang isinya
 * barang bergudang. Material yang belum punya `item_id` ikut tampil:
 * itu justru bahan yang sedang dijajaki, dan alasan modul ini ada.
 *
 * Item stok yang TIDAK punya baris material ikut ditambahkan supaya
 * bahan yang selama ini bisa dipilih tidak hilang cuma karena dulu
 * dibuat langsung lewat menu Stock Items.
 *
 * Item TIDAK disaring `aktif = true`, dan itu disengaja dua kali:
 * alasan yang sama dengan layar produksi (bahan yang dinonaktifkan
 * setelah formulanya dibuat akan terbaca stok nol), ditambah alasan
 * khas R&D, yaitu bahan yang sudah lama tidak dibeli justru sering
 * yang dijajaki.
 *
 * Harganya `harga_per_unit`, bukan `harga_faktur`: yang dihitung di
 * sini biaya, dan biaya selalu tanpa pajak (lihat bab Dua harga per
 * batch).
 */
export async function getRndOptions(organizationId: string): Promise<{
  bahan: BahanRnd[];
  clients: ClientOption[];
}> {
  const supabase = await createClient();

  const [
    { data: materials },
    { data: items },
    { data: batches },
    { data: clients },
  ] = await Promise.all([
    supabase
      .from("materials")
      .select(
        "id, material_code, tradename, kategori, item_id, suppliers(nama), material_inci(inci_name, percentage)"
      )
      .eq("organization_id", organizationId)
      .order("material_code"),
    supabase
      .from("items")
      .select("id, kode, nama, satuan, kategori")
      .eq("organization_id", organizationId)
      .order("kode"),
    supabase
      .from("purchase_batches")
      .select("item_id, qty_sisa, harga_per_unit, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("clients")
      .select("id, kode, company_brand")
      .eq("organization_id", organizationId)
      .order("company_brand"),
  ]);

  const stok = new Map<string, number>();
  const harga = new Map<string, number>();
  for (const b of (batches || []) as unknown as BatchRaw[]) {
    stok.set(b.item_id, (stok.get(b.item_id) || 0) + Number(b.qty_sisa));
    // Baris sudah urut created_at menurun, jadi yang pertama masuk adalah
    // pembelian terakhir.
    if (!harga.has(b.item_id)) harga.set(b.item_id, Number(b.harga_per_unit));
  }

  const itemRows = (items || []) as ItemRaw[];
  const itemById = new Map(itemRows.map((i) => [i.id, i]));

  const daftar: BahanRnd[] = [];
  const itemTerpakai = new Set<string>();

  for (const m of (materials || []) as unknown as MaterialRaw[]) {
    const it = m.item_id ? itemById.get(m.item_id) : undefined;
    if (m.item_id) itemTerpakai.add(m.item_id);
    daftar.push({
      key: kunciBahan(m.id, null),
      material_id: m.id,
      item_id: m.item_id,
      kode: m.material_code,
      nama: m.tradename,
      // Bahan yang belum jadi item stok belum punya satuan tersimpan.
      // Bawaannya disamakan dengan yang dipakai "Tambah Item dari
      // Material", supaya angka di lembar kerja tidak berubah satuan
      // begitu materialnya benar-benar diadakan.
      satuan: it?.satuan ?? (m.kategori === "Kemasan" ? "pcs" : "kg"),
      kategori: m.kategori,
      stok: m.item_id ? stok.get(m.item_id) || 0 : 0,
      harga: m.item_id ? harga.get(m.item_id) ?? null : null,
      supplier: m.suppliers?.nama || null,
      inci: ringkasInci(m.material_inci),
    });
  }

  for (const it of itemRows) {
    if (itemTerpakai.has(it.id)) continue;
    daftar.push({
      key: kunciBahan(null, it.id),
      material_id: null,
      item_id: it.id,
      kode: it.kode,
      nama: it.nama,
      satuan: it.satuan,
      kategori: it.kategori,
      stok: stok.get(it.id) || 0,
      harga: harga.get(it.id) ?? null,
      supplier: null,
      inci: null,
    });
  }

  daftar.sort((a, b) => a.kode.localeCompare(b.kode) || a.nama.localeCompare(b.nama));

  return { bahan: daftar, clients: (clients || []) as ClientOption[] };
}
