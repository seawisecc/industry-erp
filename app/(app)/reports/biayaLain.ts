import { createClient } from "@/lib/supabase/server";
import { addDaysStr, localDateStr } from "@/lib/dates";
import { varianKey } from "@/lib/clientPrice";
import { getHppPerPcs } from "@/lib/margin";

/* ============================================================
   Data laporan Other Expenses: uang yang keluar tapi tidak pernah
   menjadi persediaan maupun HPP, dan barang yang hilang dari
   pembukuan stok.

   DUA KELOMPOK, SENGAJA TIDAK DIJUMLAHKAN JADI SATU

   Biaya di luar HPP   pengeluaran operasional yang disengaja:
                       Material Issue dan ongkos kirim pembelian.
   Kerugian persediaan barang yang hilang: pemusnahan, selisih
                       opname bahan yang turun, selisih opname
                       produk jadi yang turun.

   Yang pertama keputusan, yang kedua kebocoran. Menjumlahkannya jadi
   satu total membuat angka "biaya" naik tiap kali gudang kehilangan
   barang, dan orang berhenti bisa membedakan dua pertanyaan yang
   jawabannya berbeda.

   Yang TIDAK masuk, dan alasannya:
   - Ongkir yang dicentang kirim_ke_hpp: sudah jadi HPP bahan.
   - Barang ditolak QC: biasanya diretur ke supplier dan memotong
     hutang, jadi bukan beban. Sistem tidak bisa tahu mana yang
     akhirnya tidak diretur.
   - Selisih LEBIH opname: tidak dipakai mengurangi kerugian.
   ============================================================ */

const HALAMAN = 1000;

type Halaman = PromiseLike<{ data: unknown[] | null; error: unknown }>;

export type PemakaianBahan = {
  id: string;
  no: string;
  tanggal: string;
  tujuan: string;
  catatan: string | null;
  /** biaya lot yang terpotong, tercatat saat dokumen dibuat */
  nilai: number;
  bahan: { nama: string; qty: number; satuan: string }[];
};

export type OngkirFaktur = {
  id: string;
  tanggal: string;
  noFaktur: string | null;
  supplier: string | null;
  noPo: string | null;
  nilai: number;
};

export type JenisKerugian =
  | "Pemusnahan"
  | "Selisih Opname Bahan"
  | "Selisih Opname Produk Jadi";

export type KerugianBaris = {
  id: string;
  tanggal: string;
  jenis: JenisKerugian;
  barang: string;
  kode: string | null;
  /** lot, varian, atau brand: yang membedakan barang ini */
  keterangan: string | null;
  qty: number;
  satuan: string;
  /** null = tidak bisa dinilai, JANGAN dianggap nol */
  nilai: number | null;
  /** dasar penilaiannya, ditulis di layar */
  dasarNilai: string;
  sumber: string;
};

export type BiayaLain = {
  pemakaian: PemakaianBahan[];
  ongkir: OngkirFaktur[];
  /** ongkir yang sudah dibebankan ke HPP, disebut di layar tapi tidak dihitung */
  ongkirMasukHpp: { jumlah: number; nilai: number };
  kerugian: KerugianBaris[];
  /** ada query yang gagal: layar wajib mengatakannya */
  gagal: boolean;
};

type IssueRaw = {
  id: string;
  no_pemakaian: string;
  tanggal: string;
  tujuan: string;
  catatan: string | null;
  total_biaya: number;
  material_issue_items: {
    qty: number;
    items: { nama: string; satuan: string } | null;
  }[];
};

type ReceivingRaw = {
  id: string;
  tanggal_terima: string;
  no_invoice: string | null;
  supplier_nama: string | null;
  biaya_kirim: number;
  kirim_ke_hpp: boolean | null;
  purchase_orders: { no_po: string | null } | null;
};

type MusnahRaw = {
  id: string;
  created_at: string;
  qty: number | null;
  catatan: string | null;
  items: { kode: string; nama: string; satuan: string } | null;
  purchase_batches: { harga_per_unit: number | null; no_lot_supplier: string | null } | null;
};

type AdjRaw = {
  id: string;
  qty_sebelum: number;
  qty_sesudah: number;
  harga_per_unit: number | null;
  items: { kode: string; nama: string; satuan: string } | null;
  stock_adjustments: {
    tanggal: string;
    catatan: string | null;
    stock_opnames: { no_opname: string }[] | null;
  } | null;
};

type FgRaw = {
  id: string;
  tanggal: string;
  product_id: string;
  varian: string | null;
  qty_delta: number;
  alasan: string | null;
  opname_id: string | null;
  products: { kode: string | null; nama_produk: string; brand: string | null } | null;
  stock_opnames: { no_opname: string } | null;
};

export async function getBiayaLain(
  organizationId: string,
  from: string,
  to: string
): Promise<BiayaLain> {
  const supabase = await createClient();
  let gagal = false;

  async function semua<T>(ambil: (dari: number, sampai: number) => Halaman) {
    const hasil: T[] = [];
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error } = await ambil(dari, dari + HALAMAN - 1);
      if (error) {
        gagal = true;
        break;
      }
      const batch = (data || []) as T[];
      hasil.push(...batch);
      if (batch.length < HALAMAN) break;
    }
    return hasil;
  }

  const [issues, receivings, musnah, adjustments, fg] = await Promise.all([
    semua<IssueRaw>((a, b) =>
      supabase
        .from("material_issues")
        .select(
          "id, no_pemakaian, tanggal, tujuan, catatan, total_biaya, material_issue_items(qty, items(nama, satuan))"
        )
        .eq("organization_id", organizationId)
        .gte("tanggal", from)
        .lte("tanggal", to)
        .order("tanggal")
        .order("id")
        .range(a, b)
    ),
    semua<ReceivingRaw>((a, b) =>
      supabase
        .from("receivings")
        .select(
          "id, tanggal_terima, no_invoice, supplier_nama, biaya_kirim, kirim_ke_hpp, purchase_orders(no_po)"
        )
        .eq("organization_id", organizationId)
        .gt("biaya_kirim", 0)
        .gte("tanggal_terima", from)
        .lte("tanggal_terima", to)
        .order("tanggal_terima")
        .order("id")
        .range(a, b)
    ),
    // created_at bertipe timestamptz, jadi rentangnya dilebarkan sehari
    // di tiap sisi lalu disaring ulang dengan tanggal di zona operasional.
    // Membandingkannya langsung dengan tanggal membuat pemusnahan jam
    // 00.00 s/d 08.00 WITA jatuh ke hari sebelumnya.
    semua<MusnahRaw>((a, b) =>
      supabase
        .from("batch_dispositions")
        .select(
          "id, created_at, qty, catatan, items(kode, nama, satuan), purchase_batches(harga_per_unit, no_lot_supplier)"
        )
        .eq("organization_id", organizationId)
        .eq("tipe", "Musnah")
        .gte("created_at", addDaysStr(from, -1))
        .lt("created_at", addDaysStr(to, 2))
        .order("created_at")
        .order("id")
        .range(a, b)
    ),
    semua<AdjRaw>((a, b) =>
      supabase
        .from("stock_adjustment_items")
        .select(
          "id, qty_sebelum, qty_sesudah, harga_per_unit, items(kode, nama, satuan), stock_adjustments!inner(tanggal, catatan, stock_opnames(no_opname))"
        )
        .eq("organization_id", organizationId)
        .gte("stock_adjustments.tanggal", from)
        .lte("stock_adjustments.tanggal", to)
        .order("id")
        .range(a, b)
    ),
    semua<FgRaw>((a, b) =>
      supabase
        .from("finished_goods_adjustments")
        .select(
          "id, tanggal, product_id, varian, qty_delta, alasan, opname_id, products(kode, nama_produk, brand), stock_opnames(no_opname)"
        )
        .eq("organization_id", organizationId)
        .gte("tanggal", from)
        .lte("tanggal", to)
        .order("tanggal")
        .order("id")
        .range(a, b)
    ),
  ]);

  // ===== Biaya di luar HPP =====
  const pemakaian: PemakaianBahan[] = issues.map((m) => ({
    id: m.id,
    no: m.no_pemakaian,
    tanggal: m.tanggal,
    tujuan: m.tujuan,
    catatan: m.catatan,
    nilai: Number(m.total_biaya) || 0,
    bahan: m.material_issue_items.map((it) => ({
      nama: it.items?.nama || "-",
      qty: Number(it.qty),
      satuan: it.items?.satuan || "",
    })),
  }));

  const ongkir: OngkirFaktur[] = [];
  const ongkirMasukHpp = { jumlah: 0, nilai: 0 };
  for (const r of receivings) {
    const nilai = Number(r.biaya_kirim) || 0;
    if (r.kirim_ke_hpp) {
      ongkirMasukHpp.jumlah += 1;
      ongkirMasukHpp.nilai += nilai;
      continue;
    }
    ongkir.push({
      id: r.id,
      tanggal: r.tanggal_terima,
      noFaktur: r.no_invoice,
      supplier: r.supplier_nama,
      noPo: r.purchase_orders?.no_po ?? null,
      nilai,
    });
  }

  // ===== Kerugian persediaan =====
  const kerugian: KerugianBaris[] = [];

  for (const d of musnah) {
    const tanggal = localDateStr(new Date(d.created_at));
    if (tanggal < from || tanggal > to) continue;
    const qty = Number(d.qty) || 0;
    if (qty <= 0) continue;
    const harga = Number(d.purchase_batches?.harga_per_unit) || 0;
    kerugian.push({
      id: `musnah-${d.id}`,
      tanggal,
      jenis: "Pemusnahan",
      barang: d.items?.nama || "-",
      kode: d.items?.kode || null,
      keterangan: d.purchase_batches?.no_lot_supplier
        ? `lot ${d.purchase_batches.no_lot_supplier}`
        : null,
      qty,
      satuan: d.items?.satuan || "",
      nilai: harga > 0 ? qty * harga : null,
      dasarNilai: "harga lot",
      sumber: d.catatan || "Pemusnahan",
    });
  }

  for (const r of adjustments) {
    const turun = Number(r.qty_sebelum) - Number(r.qty_sesudah);
    if (!(turun > 1e-9)) continue;
    const harga = Number(r.harga_per_unit) || 0;
    const opname = r.stock_adjustments?.stock_opnames?.[0]?.no_opname;
    kerugian.push({
      id: `adj-${r.id}`,
      tanggal: r.stock_adjustments?.tanggal || from,
      jenis: "Selisih Opname Bahan",
      barang: r.items?.nama || "-",
      kode: r.items?.kode || null,
      keterangan: null,
      qty: turun,
      satuan: r.items?.satuan || "",
      // Harga yang tercatat di baris penyesuaian: pembelian terakhir untuk
      // opname. Bukan biaya lot yang benar-benar dipotong FEFO, karena
      // angka itu tidak disimpan di mana pun.
      nilai: harga > 0 ? turun * harga : null,
      dasarNilai: "harga pembelian terakhir",
      sumber: opname || r.stock_adjustments?.catatan || "Penyesuaian stok",
    });
  }

  // Produk jadi dihitung BERSIH per produk per opname. Memindahkan stok
  // waktu nama varian diganti menghasilkan sepasang koreksi (-462 di nama
  // lama, +462 di nama baru) dalam opname yang sama. Menjumlahkan baris
  // negatifnya saja akan mengarang kerugian ratusan pcs yang tidak pernah
  // hilang; di data asli tujuh dari sepuluh baris negatif adalah pasangan
  // seperti itu.
  type GrupFg = {
    rows: FgRaw[];
    bersih: number;
  };
  const grupFg = new Map<string, GrupFg>();
  for (const r of fg) {
    const dokumen = r.opname_id || r.alasan || `tanggal-${r.tanggal}`;
    const key = `${dokumen}|${r.product_id}`;
    const g = grupFg.get(key) || { rows: [], bersih: 0 };
    g.rows.push(r);
    g.bersih += Number(r.qty_delta);
    grupFg.set(key, g);
  }
  const hilangFg = [...grupFg.values()].filter((g) => g.bersih < -1e-9);

  // Riwayat produksi cuma dibaca kalau memang ada yang harus dinilai.
  let hppPerPcs = new Map<string, number>();
  if (hilangFg.length > 0) {
    try {
      hppPerPcs = await getHppPerPcs(organizationId);
    } catch {
      gagal = true;
    }
  }

  for (const g of hilangFg) {
    const negatif = g.rows.filter((r) => Number(r.qty_delta) < 0);
    const contoh = g.rows[0];
    const qty = -g.bersih;
    // Nilai per pcs = rata-rata HPP varian yang berkurang, ditimbang qty.
    // Kalau satu saja variannya belum pernah diproduksi, nilainya tidak
    // diketahui: menebaknya dari varian lain membuat angka tampak pasti.
    let nilai: number | null = null;
    const semuaBerHpp = negatif.every((r) =>
      hppPerPcs.has(`${r.product_id}|${varianKey(r.varian)}`)
    );
    if (semuaBerHpp) {
      const qtyNeg = negatif.reduce((s, r) => s - Number(r.qty_delta), 0);
      const biayaNeg = negatif.reduce(
        (s, r) =>
          s -
          Number(r.qty_delta) * hppPerPcs.get(`${r.product_id}|${varianKey(r.varian)}`)!,
        0
      );
      if (qtyNeg > 0) nilai = qty * (biayaNeg / qtyNeg);
    }
    const varian = [...new Set(negatif.map((r) => r.varian).filter(Boolean))].join(", ");
    kerugian.push({
      id: `fg-${contoh.id}`,
      tanggal: negatif[0]?.tanggal || contoh.tanggal,
      jenis: "Selisih Opname Produk Jadi",
      barang: contoh.products?.nama_produk || "(produk terhapus)",
      kode: contoh.products?.kode || null,
      keterangan: [varian, contoh.products?.brand].filter(Boolean).join(" · ") || null,
      qty,
      satuan: "pcs",
      nilai,
      dasarNilai: "HPP produksi per pcs",
      sumber: contoh.stock_opnames?.no_opname || contoh.alasan || "Koreksi produk jadi",
    });
  }

  kerugian.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.barang.localeCompare(b.barang));

  return { pemakaian, ongkir, ongkirMasukHpp, kerugian, gagal };
}
