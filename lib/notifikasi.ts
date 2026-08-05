/* ============================================================
   Kumpulan hal yang butuh TINDAKAN, dikumpulkan jadi satu.

   Sebelum ini setiap sinyal cuma kelihatan kalau orangnya kebetulan
   membuka halaman yang tepat: stok menipis di Stock Items, batch
   karantina di QC Incoming, invoice lewat tempo di Sales Payments.
   Yang tidak dibuka, tidak ketahuan — dan yang paling mahal justru
   yang jarang dibuka.

   Aturan isi halaman ini: hanya yang bisa DITINDAK. Angka yang cuma
   enak dilihat tempatnya di Dashboard, bukan di sini. Setiap baris
   punya tujuan klik yang jelas.

   Penyaringan hak akses dilakukan DI SINI, bukan di halaman: user
   tanpa akses modul QC tidak boleh tahu ada berapa batch karantina.
   ============================================================ */

import { createClient } from "@/lib/supabase/server";
import { canAccessModule, type AccessProfile } from "@/lib/modules";
import { addDaysStr, localDateStr } from "@/lib/dates";
import type { FeatureFlags } from "@/lib/features";
import { sisaHutang } from "@/lib/purchaseReturn";

/**
 * Batas baris yang ditarik untuk sinyal yang penyaringan akhirnya
 * dihitung di TypeScript (stok minimum, sisa piutang). Di atas angka
 * ini jumlahnya ditandai "≥" supaya tidak memberi kesan pasti.
 */
const AMBIL_MAKS = 500;

/** Batas hari sebuah batch dianggap "mendekati expiry". */
const HARI_EXPIRY = 60;

export type Urgensi = "kritis" | "peringatan";

/** Nama ikon; komponennya dipilih di halaman, bukan dioper dari sini. */
export type NotifIkon =
  | "stok"
  | "expiry"
  | "po"
  | "qc"
  | "qa"
  | "piutang"
  | "hutang";

export type NotifItem = {
  id: string;
  label: string;
  detail: string;
  href: string;
  urgensi: Urgensi;
  /** angka/nilai yang ditampilkan rata kanan */
  nilai: string;
};

export type NotifGrup = {
  key: string;
  judul: string;
  deskripsi: string;
  ikon: NotifIkon;
  href: string;
  hrefLabel: string;
  /** contoh baris teratas, bukan seluruhnya */
  items: NotifItem[];
  total: number;
  /** true bila `total` menabrak AMBIL_MAKS, jadi angkanya minimal segitu */
  terpotong: boolean;
};

function rupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
function angka(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}
function tanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
/** Selisih hari kalender, positif berarti `iso` sudah lewat. */
function hariLewat(iso: string, todayStr: string) {
  return Math.round(
    (new Date(todayStr + "T00:00:00").getTime() -
      new Date(iso + "T00:00:00").getTime()) /
      86400000
  );
}

/**
 * Maksimal baris per kelompok di layar. Kartunya bertinggi tetap dan
 * daftarnya bergulung sendiri, jadi angka ini tidak lagi dibatasi oleh
 * ruang layar — cukup dibatasi supaya payload-nya tetap wajar.
 */
const CONTOH = 25;

export async function getNotifikasi(
  organizationId: string,
  akses: AccessProfile,
  features: FeatureFlags
): Promise<NotifGrup[]> {
  const supabase = await createClient();
  const todayStr = localDateStr();
  const batasExpiry = addDaysStr(todayStr, HARI_EXPIRY);

  const bolehStok = canAccessModule(akses, "items");
  const bolehPo = canAccessModule(akses, "purchase-orders");
  const bolehQc = features.qc && canAccessModule(akses, "qc-incoming");
  const bolehQcProduk =
    features.qc && features.qa && canAccessModule(akses, "qc-finished");
  const bolehQa = features.qa && canAccessModule(akses, "qa-release");
  const bolehPiutang = canAccessModule(akses, "sales-payments");
  const bolehHutang = canAccessModule(akses, "payments");
  const perluHold = bolehQa || bolehQcProduk;

  // Query yang tidak diizinkan tidak dijalankan sama sekali — bukan
  // dijalankan lalu hasilnya dibuang.
  const [stokRes, expiryRes, poRes, qcRes, holdRes, arRes, arPayRes, apRes] =
    await Promise.all([
      bolehStok
        ? supabase
            .from("items")
            .select("id, kode, nama, satuan, stok_minimum, purchase_batches(qty_sisa)")
            .eq("organization_id", organizationId)
            .eq("aktif", true)
            .gt("stok_minimum", 0)
            .limit(AMBIL_MAKS)
        : null,
      bolehStok
        ? supabase
            .from("purchase_batches")
            .select("id, no_lot_supplier, exp_date, qty_sisa, items(kode, nama, satuan)", {
              count: "exact",
            })
            .eq("organization_id", organizationId)
            .gt("qty_sisa", 0)
            .not("exp_date", "is", null)
            .lte("exp_date", batasExpiry)
            .order("exp_date")
            .limit(CONTOH)
        : null,
      bolehPo
        ? supabase
            .from("purchase_orders")
            .select("id, no_po, tanggal_po, suppliers(nama)", { count: "exact" })
            .eq("organization_id", organizationId)
            .eq("status", "Dibuat")
            .order("tanggal_po")
            .limit(CONTOH)
        : null,
      bolehQc
        ? supabase
            .from("purchase_batches")
            .select(
              "id, no_lot_supplier, tanggal_terima, qty_karantina, supplier_nama, items(kode, nama, satuan)",
              { count: "exact" }
            )
            .eq("organization_id", organizationId)
            .eq("qc_status", "Karantina")
            .order("tanggal_terima")
            .limit(CONTOH)
        : null,
      // Batch Hold ditarik sekali, lalu dibelah jadi antrean QC produk
      // dan antrean keputusan QA. Kalau dua-duanya di-query terpisah,
      // satu batch yang sama muncul di dua kelompok.
      perluHold
        ? supabase
            .from("production_batches")
            .select(
              "id, no_batch_produksi, tanggal_produksi, qc_produk_selesai, production_outputs(products(nama_produk))"
            )
            .eq("organization_id", organizationId)
            .eq("qa_status", "Hold")
            .order("tanggal_produksi")
            .limit(AMBIL_MAKS)
        : null,
      bolehPiutang
        ? supabase
            .from("sales_invoices")
            .select("id, no_invoice, total, jatuh_tempo, nama_pembeli, clients(company_brand)")
            .eq("organization_id", organizationId)
            .eq("status_bayar", "Belum Lunas")
            .not("jatuh_tempo", "is", null)
            .lt("jatuh_tempo", todayStr)
            .order("jatuh_tempo")
            .limit(AMBIL_MAKS)
        : null,
      // Cicilan diambil lewat inner join ke invoice-nya, BUKAN dengan
      // .in(daftar id): 500 uuid di query string menghasilkan URL ~18KB
      // dan kena batas panjang di proxy sebelum sampai ke PostgREST.
      bolehPiutang
        ? supabase
            .from("sales_payments")
            .select("invoice_id, jumlah, sales_invoices!inner(status_bayar, jatuh_tempo)")
            .eq("organization_id", organizationId)
            .eq("sales_invoices.status_bayar", "Belum Lunas")
            .lt("sales_invoices.jatuh_tempo", todayStr)
        : null,
      // total_retur ikut ditarik: faktur yang barangnya sudah diretur
      // penuh bukan hutang lagi, dan penyaringannya tidak bisa dilakukan
      // di server karena membandingkan dua kolom.
      bolehHutang
        ? supabase
            .from("receivings")
            .select(
              "id, no_invoice, supplier_nama, total_invoice, total_retur, jatuh_tempo"
            )
            .eq("organization_id", organizationId)
            .eq("status_bayar", "Belum Lunas")
            .not("jatuh_tempo", "is", null)
            .lt("jatuh_tempo", todayStr)
            .order("jatuh_tempo")
            .limit(AMBIL_MAKS)
        : null,
    ]);

  const grup: NotifGrup[] = [];

  // ===== Stok di bawah minimum =====
  // Hanya item yang PUNYA stok minimum. Item bermin. 0 akan selalu
  // "terpenuhi" atau selalu kosong, dua-duanya bukan peringatan.
  if (stokRes?.data) {
    const rows = (stokRes.data as unknown as {
      id: string;
      kode: string;
      nama: string;
      satuan: string;
      stok_minimum: number;
      purchase_batches: { qty_sisa: number }[];
    }[])
      .map((it) => ({
        ...it,
        sisa: it.purchase_batches.reduce((s, b) => s + Number(b.qty_sisa), 0),
      }))
      .filter((it) => it.sisa <= Number(it.stok_minimum))
      .sort((a, b) => a.sisa - b.sisa);

    if (rows.length > 0) {
      grup.push({
        key: "stok",
        judul: "Stok di Bawah Minimum",
        deskripsi: "Ajukan pembelian sebelum produksi berhenti menunggu bahan.",
        ikon: "stok",
        href: "/items",
        hrefLabel: "Buka Stock Items",
        total: rows.length,
        terpotong: stokRes.data.length >= AMBIL_MAKS,
        items: rows.slice(0, CONTOH).map((it) => ({
          id: it.id,
          label: it.nama,
          detail: `${it.kode} · minimum ${angka(Number(it.stok_minimum))} ${it.satuan}`,
          href: "/items",
          urgensi: it.sisa <= 0 ? "kritis" : "peringatan",
          nilai: `sisa ${angka(it.sisa)} ${it.satuan}`,
        })),
      });
    }
  }

  // ===== Bahan mendekati / lewat expiry =====
  if (expiryRes?.data && (expiryRes.count ?? 0) > 0) {
    grup.push({
      key: "expiry",
      judul: "Bahan Mendekati Expiry",
      deskripsi: `Batch yang kedaluwarsa dalam ${HARI_EXPIRY} hari ke depan atau sudah lewat. Tindak lanjut: re-test atau musnahkan.`,
      ikon: "expiry",
      href: "/items/expiry",
      hrefLabel: "Buka Expiry Control",
      total: expiryRes.count ?? 0,
      terpotong: false,
      items: (expiryRes.data as unknown as {
        id: string;
        no_lot_supplier: string | null;
        exp_date: string;
        qty_sisa: number;
        items: { kode: string; nama: string; satuan: string } | null;
      }[]).map((b) => {
        const lewat = b.exp_date < todayStr;
        return {
          id: b.id,
          label: b.items?.nama || "(item terhapus)",
          detail: `${b.items?.kode ?? "-"} · lot ${b.no_lot_supplier || "-"} · sisa ${angka(Number(b.qty_sisa))} ${b.items?.satuan ?? ""}`,
          href: "/items/expiry",
          urgensi: lewat ? "kritis" : "peringatan",
          nilai: lewat
            ? `expired ${hariLewat(b.exp_date, todayStr)} hari`
            : `exp ${tanggal(b.exp_date)}`,
        };
      }),
    });
  }

  // ===== PO menunggu persetujuan =====
  if (poRes?.data && (poRes.count ?? 0) > 0) {
    grup.push({
      key: "po",
      judul: "PO Menunggu Persetujuan",
      deskripsi: "Purchase order berstatus Dibuat, belum disetujui siapa pun.",
      ikon: "po",
      href: "/purchase-orders?status=Dibuat",
      hrefLabel: "Buka Purchase Order",
      total: poRes.count ?? 0,
      terpotong: false,
      items: (poRes.data as unknown as {
        id: string;
        no_po: string | null;
        tanggal_po: string;
        suppliers: { nama: string } | null;
      }[]).map((po) => {
        const umur = hariLewat(po.tanggal_po, todayStr);
        return {
          id: po.id,
          label: po.no_po || "(tanpa nomor)",
          detail: `${po.suppliers?.nama || "-"} · dibuat ${tanggal(po.tanggal_po)}`,
          href: "/purchase-orders?status=Dibuat",
          // PO yang menggantung lebih dari seminggu menahan pembelian
          urgensi: umur >= 7 ? "kritis" : "peringatan",
          nilai: umur <= 0 ? "hari ini" : `${umur} hari`,
        };
      }),
    });
  }

  // ===== Batch karantina menunggu QC =====
  if (qcRes?.data && (qcRes.count ?? 0) > 0) {
    grup.push({
      key: "qc",
      judul: "Barang Masuk Menunggu QC",
      deskripsi:
        "Masih di karantina, belum bisa dipakai produksi sampai di-release QC.",
      ikon: "qc",
      href: "/qc-incoming",
      hrefLabel: "Buka QC Incoming",
      total: qcRes.count ?? 0,
      terpotong: false,
      items: (qcRes.data as unknown as {
        id: string;
        no_lot_supplier: string | null;
        tanggal_terima: string;
        qty_karantina: number;
        supplier_nama: string | null;
        items: { kode: string; nama: string; satuan: string } | null;
      }[]).map((b) => {
        const umur = hariLewat(b.tanggal_terima, todayStr);
        return {
          id: b.id,
          label: b.items?.nama || "(item terhapus)",
          detail: `${b.supplier_nama || "-"} · lot ${b.no_lot_supplier || "-"} · ${angka(Number(b.qty_karantina))} ${b.items?.satuan ?? ""}`,
          href: `/qc-incoming/${b.id}`,
          urgensi: umur >= 7 ? "kritis" : "peringatan",
          nilai: umur <= 0 ? "hari ini" : `${umur} hari`,
        };
      }),
    });
  }

  // ===== Batch Hold: antrean uji QC produk vs antrean keputusan QA =====
  if (holdRes?.data) {
    const hold = holdRes.data as unknown as {
      id: string;
      no_batch_produksi: string;
      tanggal_produksi: string;
      qc_produk_selesai: boolean | null;
      production_outputs: { products: { nama_produk: string } | null }[];
    }[];

    const namaProduk = (b: (typeof hold)[number]) =>
      b.production_outputs?.[0]?.products?.nama_produk || "(produk terhapus)";

    const baris = (b: (typeof hold)[number], href: string): NotifItem => {
      const umur = hariLewat(b.tanggal_produksi, todayStr);
      return {
        id: b.id,
        label: b.no_batch_produksi,
        detail: `${namaProduk(b)} · produksi ${tanggal(b.tanggal_produksi)}`,
        href,
        urgensi: umur >= 7 ? "kritis" : "peringatan",
        nilai: umur <= 0 ? "hari ini" : `${umur} hari`,
      };
    };

    // Dengan modul QC produk aktif, batch harus diuji dulu baru bisa
    // diputuskan QA. Yang belum diuji bukan urusan QA, jadi tidak
    // dihitung dua kali di dua kelompok.
    const belumUji = bolehQcProduk
      ? hold.filter((b) => b.qc_produk_selesai !== true)
      : [];
    const siapQa = bolehQcProduk
      ? hold.filter((b) => b.qc_produk_selesai === true)
      : hold;

    if (bolehQcProduk && belumUji.length > 0) {
      grup.push({
        key: "qc-produk",
        judul: "Produk Jadi Menunggu Uji QC",
        deskripsi: "Batch Hold yang parameter ujinya belum diisi.",
        ikon: "qc",
        href: "/qc-finished",
        hrefLabel: "Buka QC Finished Goods",
        total: belumUji.length,
        terpotong: hold.length >= AMBIL_MAKS,
        items: belumUji.slice(0, CONTOH).map((b) => baris(b, `/qc-finished/${b.id}`)),
      });
    }

    if (bolehQa && siapQa.length > 0) {
      grup.push({
        key: "qa",
        judul: "Batch Menunggu Pelulusan QA",
        deskripsi:
          "Produk jadi belum masuk stok jual sampai batch-nya diluluskan QA.",
        ikon: "qa",
        href: "/qa-release",
        hrefLabel: "Buka QA Release",
        total: siapQa.length,
        terpotong: hold.length >= AMBIL_MAKS,
        items: siapQa.slice(0, CONTOH).map((b) => baris(b, `/qa-release/${b.id}`)),
      });
    }
  }

  // ===== Piutang lewat jatuh tempo =====
  //
  // status_bayar sudah menyaring yang lunas, tapi invoice bisa terbayar
  // SEBAGIAN. Sisanya dihitung dari ledger cicilan, bukan dari total.
  if (arRes?.data && arRes.data.length > 0) {
    const inv = arRes.data as unknown as {
      id: string;
      no_invoice: string | null;
      total: number;
      jatuh_tempo: string;
      nama_pembeli: string | null;
      clients: { company_brand: string } | null;
    }[];

    const dibayar = new Map<string, number>();
    for (const p of ((arPayRes?.data || []) as unknown as {
      invoice_id: string;
      jumlah: number;
    }[])) {
      dibayar.set(p.invoice_id, (dibayar.get(p.invoice_id) || 0) + Number(p.jumlah));
    }

    const telat = inv
      .map((i) => ({
        ...i,
        sisa: Number(i.total) - (dibayar.get(i.id) || 0),
        hari: hariLewat(i.jatuh_tempo, todayStr),
      }))
      // Pembulatan rupiah: sisa di bawah 50 sen bukan tagihan
      .filter((i) => i.sisa > 0.5)
      .sort((a, b) => b.hari - a.hari);

    if (telat.length > 0) {
      grup.push({
        key: "piutang",
        judul: "Piutang Lewat Jatuh Tempo",
        deskripsi: `Total ${rupiah(telat.reduce((s, i) => s + i.sisa, 0))} belum tertagih.`,
        ikon: "piutang",
        href: "/sales-payments",
        hrefLabel: "Buka Sales Payments",
        total: telat.length,
        terpotong: inv.length >= AMBIL_MAKS,
        items: telat.slice(0, CONTOH).map((i) => ({
          id: i.id,
          label: i.clients?.company_brand || i.nama_pembeli || "-",
          detail: `${i.no_invoice || "(tanpa nomor)"} · jatuh tempo ${tanggal(i.jatuh_tempo)}`,
          href: "/sales-payments",
          urgensi: i.hari >= 30 ? "kritis" : "peringatan",
          nilai: `${rupiah(i.sisa)} · ${i.hari} hari`,
        })),
      });
    }
  }

  // ===== Hutang lewat jatuh tempo =====
  //
  // Sisanya dihitung setelah dipotong retur ke supplier. Faktur yang
  // barangnya sudah dikembalikan seluruhnya bukan hutang lagi, walau
  // status_bayar-nya masih "Belum Lunas".
  if (apRes?.data && apRes.data.length > 0) {
    const telat = (apRes.data as unknown as {
      id: string;
      no_invoice: string | null;
      supplier_nama: string | null;
      total_invoice: number;
      total_retur: number | null;
      jatuh_tempo: string;
    }[])
      .map((r) => ({
        ...r,
        sisa: sisaHutang(Number(r.total_invoice), Number(r.total_retur || 0)),
        hari: hariLewat(r.jatuh_tempo, todayStr),
      }))
      .filter((r) => r.sisa > 0.5)
      .sort((a, b) => b.hari - a.hari);

    if (telat.length > 0) {
      grup.push({
        key: "hutang",
        judul: "Hutang Lewat Jatuh Tempo",
        deskripsi: `Total ${rupiah(telat.reduce((s, r) => s + r.sisa, 0))} lewat tempo, sesudah dipotong retur ke supplier.`,
        ikon: "hutang",
        href: "/payments",
        hrefLabel: "Buka Payments",
        total: telat.length,
        terpotong: apRes.data.length >= AMBIL_MAKS,
        items: telat.slice(0, CONTOH).map((r) => ({
          id: r.id,
          label: r.supplier_nama || "-",
          detail: `${r.no_invoice || "(tanpa nomor)"} · jatuh tempo ${tanggal(r.jatuh_tempo)}`,
          href: "/payments",
          urgensi: r.hari >= 30 ? "kritis" : "peringatan",
          nilai: `${rupiah(r.sisa)} · ${r.hari} hari`,
        })),
      });
    }
  }

  return grup;
}
