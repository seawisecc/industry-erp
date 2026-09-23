/* ============================================================
   PPIC R&D: "kalau formula-formula ini di-launching sekian pcs,
   berapa dana yang harus disiapkan untuk bahannya?"

   Bedanya dengan PPIC Planner di Purchasing ada di titik awalnya.
   PPIC Planner merencanakan PRODUK yang sudah ada di master Products
   (formula per item stok, ukuran batch kg). Di sini yang dipilih
   FORMULA R&D, yang bahannya boleh belum pernah diadakan, dan
   jumlahnya dalam PCS karena yang diputuskan saat launching adalah
   berapa pcs yang mau dilempar ke pasar.

   Yang TIDAK berbeda, dan sengaja: tangga persediaan per bahan.
   Bahan yang sudah jadi item stok dinilai lewat `neracaBahan` di
   lib/ppic.ts, fungsi yang sama dengan PPIC Planner, termasuk Plan
   Produksi berjalan yang ikut menahan stok, karantina QC, PO terbuka,
   dan pembulatan MOQ. Dua jawaban "perlu beli berapa" untuk bahan
   yang sama adalah cara tercepat membuat orang berhenti percaya pada
   dua-duanya.

   TIGA KELOMPOK BAHAN, TIGA DASAR ANGKA

   - Punya item stok      neraca lengkap, Qty Beli dari `neracaBahan`
   - Belum dimiliki       tidak ada stok untuk dibandingkan, jadi
                          seluruh kebutuhannya harus dibeli, dibulatkan
                          MOQ material, dinilai harga referensi
   - Kemasan ketikan      tidak punya identitas apa pun, jadi cuma
                          qty x harga estimasi yang diketik di formula

   DUA ANGKA RUPIAH YANG TIDAK BOLEH DICAMPUR

   - Dana Pembelian   uang yang harus keluar SEKARANG: Qty Beli x
                      harga. Bahan yang stoknya cukup tidak menambah
                      apa-apa, dan MOQ bisa membuatnya lebih besar dari
                      kebutuhan.
   - Biaya Bahan      nilai bahan yang TERPAKAI oleh produksinya, stok
                      sendiri ikut dihitung. Dasar hitung harga per pcs.

   Keduanya tanpa PPN (harga_per_unit & harga_referensi disimpan tanpa
   pajak), dan layar wajib mengatakannya.

   Berkas ini BERSIH dari import server.
   ============================================================ */

import {
  neracaBahan,
  type PpicAlokasi,
  type PpicItem,
  type PpicNeraca,
  type PpicPlanTerbuka,
} from "@/lib/ppic";
import { adaMoq, bulatkanMoq } from "@/lib/moq";
import {
  hitungBiayaFormula,
  kebutuhanProduksi,
  type BahanRnd,
  type BarisFormula,
  type BarisKemasan,
} from "@/lib/rndCost";

export type RndPpicFormula = {
  id: string;
  noFormula: string;
  nama: string;
  brand: string | null;
  status: string;
  /** gramasi per pcs; null = belum diisi, kebutuhan bahannya belum bisa dihitung */
  nettoGram: number | null;
  formula: BarisFormula[];
  kemasan: BarisKemasan[];
};

export type RndRencana = { formulaId: string; pcs: number };

export type RndBarisRencana = {
  formula: RndPpicFormula;
  pcs: number;
  ruahanKg: number;
  /** biaya bahan + kemasan per pcs; null bila gramasi belum diisi */
  biayaPerPcs: number | null;
  biayaTotal: number | null;
};

/** Berapa banyak satu bahan dipakai oleh satu formula dalam rencana. */
export type RndPemakaian = { formula: RndPpicFormula; qty: number };

/** Bahan yang sudah punya item stok. */
export type RndBahanStok = PpicNeraca & {
  item: PpicItem;
  butuh: number;
  alokasi: number;
  alokasiPlan: PpicAlokasi[];
  harga: number | null;
  /** true = harganya cuma angka referensi master material */
  hargaReferensi: boolean;
  dana: number | null;
  supplier: string | null;
  untuk: RndPemakaian[];
};

/** Bahan formula yang belum terdaftar sebagai item stok. */
export type RndBahanBaru = {
  bahan: BahanRnd;
  butuh: number;
  qtyBeli: number;
  tanpaMoq: boolean;
  dana: number | null;
  untuk: RndPemakaian[];
};

/** Kemasan yang cuma diketik namanya di formula. */
export type RndKemasanManual = {
  nama: string;
  qty: number;
  harga: number | null;
  dana: number | null;
  untuk: RndPemakaian[];
};

export type RndPpicHasil = {
  rencana: RndBarisRencana[];
  /** Perlu Beli dulu, lalu yang kekurangannya terbesar. */
  bahan: RndBahanStok[];
  baru: RndBahanBaru[];
  manual: RndKemasanManual[];
  danaStok: number;
  danaBaru: number;
  danaManual: number;
  totalDana: number;
  /** jumlah biayaTotal rencana yang gramasinya terisi */
  biayaBahan: number;
  /** Formula di rencana yang gramasinya belum diisi. */
  tanpaGramasi: RndPpicFormula[];
  /** Nama bahan yang harus dibeli tapi tidak punya acuan harga sama sekali. */
  tanpaHarga: string[];
  /** Bahan yang harus dibeli tanpa MOQ, Qty Beli-nya apa adanya. */
  tanpaMoq: string[];
  planTerlibat: PpicPlanTerbuka[];
  tidakDitemukan: number;
};

const URUTAN: Record<string, number> = {
  "Perlu Beli": 0,
  "PO Belum Dikirim": 1,
  "Menunggu Kedatangan": 2,
  "Menunggu QC": 3,
  Cukup: 4,
};

function tambahPakai(
  peta: Map<string, Map<string, number>>,
  kunci: string,
  formulaId: string,
  qty: number
) {
  const per = peta.get(kunci) || new Map<string, number>();
  per.set(formulaId, (per.get(formulaId) || 0) + qty);
  peta.set(kunci, per);
}

export function hitungRndPpic(arg: {
  formulas: RndPpicFormula[];
  bahan: BahanRnd[];
  items: PpicItem[];
  planTerbuka: PpicPlanTerbuka[];
  rencana: RndRencana[];
}): RndPpicHasil {
  const formulaMap = new Map(arg.formulas.map((f) => [f.id, f]));
  const bahanMap = new Map(arg.bahan.map((b) => [b.key, b]));
  const bahanOf = (key: string) => bahanMap.get(key);
  // Dua material bisa menunjuk item yang sama; yang pertama dipakai
  // untuk harga referensi & suppliernya.
  const bahanByItem = new Map<string, BahanRnd>();
  for (const b of arg.bahan) {
    if (b.item_id && !bahanByItem.has(b.item_id)) bahanByItem.set(b.item_id, b);
  }
  const itemMap = new Map(arg.items.map((it) => [it.id, it]));

  const rencana: RndBarisRencana[] = [];
  const tanpaGramasi = new Map<string, RndPpicFormula>();
  let tidakDitemukan = 0;

  // kunci -> formula_id -> qty
  const pakaiItem = new Map<string, Map<string, number>>();
  const pakaiBaru = new Map<string, Map<string, number>>();
  const pakaiManual = new Map<string, Map<string, number>>();
  const hargaManual = new Map<string, number>();

  for (const r of arg.rencana) {
    if (!r.formulaId) continue;
    const f = formulaMap.get(r.formulaId);
    if (!f) {
      tidakDitemukan++;
      continue;
    }
    if (!(f.nettoGram && f.nettoGram > 0)) tanpaGramasi.set(f.id, f);
    if (!(r.pcs > 0)) continue;

    const biaya = hitungBiayaFormula(f.formula, f.kemasan, f.nettoGram, bahanOf);
    const keb = kebutuhanProduksi(f.formula, f.kemasan, r.pcs, f.nettoGram, bahanOf);
    rencana.push({
      formula: f,
      pcs: r.pcs,
      ruahanKg: keb.ruahanKg,
      biayaPerPcs: biaya.totalPerPcs,
      biayaTotal: biaya.totalPerPcs == null ? null : biaya.totalPerPcs * r.pcs,
    });

    for (const [itemId, qty] of keb.perItem) tambahPakai(pakaiItem, itemId, f.id, qty);
    for (const [key, qty] of keb.belumAdaStok) tambahPakai(pakaiBaru, key, f.id, qty);

    // kebutuhanProduksi tidak menghitung kemasan ketikan, dia tidak
    // punya identitas stok. Tapi dia tetap harus dibeli, jadi dananya
    // dihitung di sini dari harga estimasi yang diketik di formula.
    for (const k of f.kemasan) {
      if (k.key || !k.nama) continue;
      const qty = (Number(k.qty_per_pcs) || 0) * r.pcs;
      if (!(qty > 0)) continue;
      const nama = k.nama.trim();
      tambahPakai(pakaiManual, nama, f.id, qty);
      if (k.harga_estimasi != null && !hargaManual.has(nama)) {
        hargaManual.set(nama, k.harga_estimasi);
      }
    }
  }

  const keUntuk = (per: Map<string, number> | undefined): RndPemakaian[] =>
    [...(per || new Map<string, number>())]
      .map(([fid, qty]) => ({ formula: formulaMap.get(fid)!, qty }))
      .sort((a, b) => b.qty - a.qty);

  // Plan berjalan per item, sama dengan hitungPpic.
  const alokasiOf = new Map<string, PpicAlokasi[]>();
  for (const plan of arg.planTerbuka) {
    for (const j of plan.jatah) {
      const daftar = alokasiOf.get(j.item_id) || [];
      daftar.push({ plan, qty: j.qty });
      alokasiOf.set(j.item_id, daftar);
    }
  }

  const bahan: RndBahanStok[] = [];
  const planDipakai = new Set<string>();
  const tanpaHarga: string[] = [];
  const tanpaMoq: string[] = [];

  for (const [itemId, per] of pakaiItem) {
    const info = bahanByItem.get(itemId);
    // Item yang tidak terbaca di data PPIC (mis. query gagal) tetap
    // ditampilkan sebagai stok nol, bukan dilewati diam-diam.
    const item: PpicItem = itemMap.get(itemId) ?? {
      id: itemId,
      kode: info?.kode ?? "-",
      nama: info?.nama ?? "Bahan tidak dikenal",
      satuan: info?.satuan ?? "",
      moq: info?.moq ?? null,
      stok: 0,
      harga: null,
      supplier: null,
      karantina: [],
      poTerbuka: [],
    };
    const untuk = keUntuk(per);
    const butuh = untuk.reduce((s, u) => s + u.qty, 0);
    const alokasiPlan = [...(alokasiOf.get(itemId) || [])].sort((a, b) => b.qty - a.qty);
    const alokasi = alokasiPlan.reduce((s, a) => s + a.qty, 0);
    for (const a of alokasiPlan) planDipakai.add(a.plan.id);

    const n = neracaBahan(item, butuh, alokasi);
    // Harga pembelian terakhir menang; referensi material cuma menambal
    // item yang belum pernah dibeli. Aturan yang sama dengan biaya R&D.
    const harga = item.harga ?? info?.harga ?? null;
    const hargaReferensi = item.harga == null && harga != null;
    if (n.qtyBeli > 0 && harga == null) tanpaHarga.push(item.nama);
    if (n.tanpaMoq) tanpaMoq.push(item.nama);

    bahan.push({
      ...n,
      item,
      butuh,
      alokasi,
      alokasiPlan,
      harga,
      hargaReferensi,
      dana: harga == null ? null : n.qtyBeli * harga,
      supplier: item.supplier ?? info?.supplier ?? null,
      untuk,
    });
  }
  bahan.sort(
    (a, b) =>
      URUTAN[a.status] - URUTAN[b.status] ||
      b.kurang - a.kurang ||
      a.item.kode.localeCompare(b.item.kode)
  );

  const baru: RndBahanBaru[] = [];
  for (const [key, per] of pakaiBaru) {
    const b = bahanOf(key);
    if (!b) continue;
    const untuk = keUntuk(per);
    const butuh = untuk.reduce((s, u) => s + u.qty, 0);
    const qtyBeli = bulatkanMoq(butuh, b.moq);
    const tanpa = !adaMoq(b.moq);
    if (b.harga == null) tanpaHarga.push(b.nama);
    if (tanpa) tanpaMoq.push(b.nama);
    baru.push({
      bahan: b,
      butuh,
      qtyBeli,
      tanpaMoq: tanpa,
      dana: b.harga == null ? null : qtyBeli * b.harga,
      untuk,
    });
  }
  baru.sort((a, b) => a.bahan.kode.localeCompare(b.bahan.kode));

  const manual: RndKemasanManual[] = [];
  for (const [nama, per] of pakaiManual) {
    const untuk = keUntuk(per);
    const qty = untuk.reduce((s, u) => s + u.qty, 0);
    const harga = hargaManual.get(nama) ?? null;
    if (harga == null) tanpaHarga.push(nama);
    manual.push({ nama, qty, harga, dana: harga == null ? null : qty * harga, untuk });
  }
  manual.sort((a, b) => a.nama.localeCompare(b.nama, "id"));

  const jumlah = (xs: { dana: number | null }[]) =>
    xs.reduce((s, x) => s + (x.dana || 0), 0);
  const danaStok = jumlah(bahan);
  const danaBaru = jumlah(baru);
  const danaManual = jumlah(manual);

  return {
    rencana,
    bahan,
    baru,
    manual,
    danaStok,
    danaBaru,
    danaManual,
    totalDana: danaStok + danaBaru + danaManual,
    biayaBahan: rencana.reduce((s, r) => s + (r.biayaTotal || 0), 0),
    tanpaGramasi: [...tanpaGramasi.values()],
    tanpaHarga: [...new Set(tanpaHarga)],
    tanpaMoq: [...new Set(tanpaMoq)],
    planTerlibat: arg.planTerbuka.filter((p) => planDipakai.has(p.id)),
    tidakDitemukan,
  };
}

/* ===== Rencana di URL: `?r=<formula_id>:<pcs>,...` =====
   Bentuknya sama dengan PPIC Planner, jadi pembacanya dipinjam dari
   sana (`rencanaDariQuery` membaca id + angka positif). */
export function rndRencanaKeQuery(rencana: RndRencana[]): string {
  return rencana
    .filter((r) => r.formulaId && r.pcs > 0)
    .map((r) => `${r.formulaId}:${r.pcs}`)
    .join(",");
}
