import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { canAccessModule } from "@/lib/modules";
import { getDocSignConfig } from "@/lib/docSignServer";
import { localDateTimeStr } from "@/lib/dates";
import {
  dokumenProses,
  hitungPpic,
  rencanaDariQuery,
  URUTAN_STATUS,
  type PpicBahan,
  type PpicProduct,
} from "@/lib/ppic";
import { getPpicData } from "@/app/(app)/ppic/data";
import PrintButton from "../po/[id]/PrintButton";
import PrintKop from "@/components/PrintKop";

/* ============================================================
   Dokumen PPIC: rencana produksi, neraca bahan, dan daftar belanja.

   Planner tidak menyimpan apa pun, jadi rencananya datang dari URL
   (?r=) dan dihitung ulang di sini dengan lib/ppic.ts, rumus yang sama
   persis dengan layar. Stok, Plan berjalan, karantina, PO, dan harga
   dibaca SAAT dicetak, jadi kertas ini potret, bukan dokumen bernomor,
   dan jam cetaknya ikut tertulis.

   Urutan isinya mengikuti pertanyaan orang yang memegangnya:
   - Mau produksi apa                -> Rencana Produksi
   - Apa yang sudah menahan bahan    -> Plan Produksi Berjalan
   - Berapa kurangnya, seluruhnya    -> Neraca Bahan
   - Harus beli apa, ke siapa        -> Daftar Belanja per supplier
   - Apa yang sudah di jalan         -> Karantina QC & PO Terbuka
   - Bahan ini untuk produk apa      -> Rincian per Produk
   Nomor bagiannya dihitung, karena dua bagian cuma muncul kalau ada isinya.

   TIDAK terdaftar di DOC_TYPES / JUDUL_DOKUMEN / SUMBER_DOKUMEN, sama
   seperti Pengajuan PO: lembar internal tanpa nomor tetap, jadi tidak
   ada yang bisa diverifikasi lewat QR. Kolom tanda tangannya memakai
   pengaturan dokumen Produksi, karena yang disahkan di sini adalah
   rencana produksinya.

   Halaman /print tidak lewat AccessGuard layout (app), jadi izin modul
   PPIC diperiksa sendiri di sini.
   ============================================================ */

function formatNum(n: number, maxDec = 3) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: maxDec });
}
function angkaAtauStrip(n: number) {
  return Math.abs(n) > 1e-9 ? formatNum(n) : "-";
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
function formatTanggal(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function namaProduk(p: PpicProduct) {
  return `${p.kode ? `${p.kode}, ` : ""}${p.nama}`;
}

type KelompokSupplier = {
  supplier: string | null;
  bahan: PpicBahan[];
  dana: number;
};

function Lembar({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen py-4 sm:py-8 print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print { body { background: white !important; } }
      `}</style>
      <PrintButton />
      <div className="bg-white text-[#1a1a1a] a4-sheet max-w-[210mm] mx-auto shadow-xl print:shadow-none rounded-sm print:rounded-none p-[15mm] print:p-0 text-[12.5px] leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function JudulBagian({ nomor, children }: { nomor: number; children: React.ReactNode }) {
  return (
    <div className="mt-7 mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
      {nomor}. {children}
    </div>
  );
}

/** Kepala tabel dokumen: garis atas-bawah hitam, huruf kapital kecil. */
const TH = "py-2 pr-2 text-[10px] uppercase tracking-wide font-semibold";
const TD = "py-1.5 pr-2 align-top";
const NUM = "text-right whitespace-nowrap tabular-nums";

export default async function PrintPpicPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string | string[] }>;
}) {
  const { r } = await searchParams;
  const { organizationId, profile, isSuperAdmin } = await getEffectiveOrg();

  const boleh = canAccessModule(
    {
      isSuperAdmin,
      role: profile?.role || "",
      allowedModules: profile?.allowed_modules ?? null,
    },
    "ppic"
  );
  if (!boleh) {
    return (
      <Lembar>
        <p>Akunmu belum diberi akses ke PPIC Planner.</p>
      </Lembar>
    );
  }

  const supabase = await createClient();
  const [{ data: org }, { data: settings }, signCfg, data] = await Promise.all([
    supabase.from("organizations").select("nama").eq("id", organizationId).single(),
    supabase
      .from("organization_settings")
      .select("alamat, no_telp, email, npwp, logo")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    getDocSignConfig(organizationId!, "production"),
    getPpicData(organizationId!),
  ]);

  const hasil = hitungPpic(
    data.products,
    data.items,
    rencanaDariQuery(r),
    data.planTerbuka
  );
  const dicetak = localDateTimeStr(new Date());

  const kontakLine = [
    settings?.no_telp ? `Telp: ${settings.no_telp}` : null,
    settings?.email ? `Email: ${settings.email}` : null,
    settings?.npwp ? `NPWP: ${settings.npwp}` : null,
  ]
    .filter(Boolean)
    .join("  •  ");

  const totalBulk = hasil.rencana.reduce((s, b) => s + b.bulkKg, 0);
  const ringkasStatus = URUTAN_STATUS.filter((s) => hasil.jumlahStatus[s] > 0)
    .map((s) => `${hasil.jumlahStatus[s]} ${s.toLowerCase()}`)
    .join(" · ");

  // ===== Neraca, dikelompokkan per status =====
  const neraca = URUTAN_STATUS.map((status) => ({
    status,
    bahan: hasil.bahan.filter((c) => c.status === status),
  })).filter((g) => g.bahan.length > 0);

  // ===== Daftar belanja per supplier =====
  // PO diterbitkan per supplier, jadi kelompok ini yang langsung bisa
  // disalin jadi PO. Supplier yang tidak diketahui di paling bawah.
  const kelompokMap = new Map<string, KelompokSupplier>();
  for (const c of hasil.perluBeli) {
    const kunci = c.item.supplier ?? "";
    const k = kelompokMap.get(kunci) || {
      supplier: c.item.supplier,
      bahan: [],
      dana: 0,
    };
    k.bahan.push(c);
    k.dana += c.dana || 0;
    kelompokMap.set(kunci, k);
  }
  const kelompok = [...kelompokMap.values()].sort((a, b) =>
    (a.supplier ?? "￿").localeCompare(b.supplier ?? "￿", "id")
  );
  for (const k of kelompok) {
    k.bahan.sort((a, b) => a.item.nama.localeCompare(b.item.nama, "id"));
  }
  // Nomor baris berlanjut antar kelompok. Dihitung di sini, bukan dengan
  // counter yang dinaikkan di dalam render.
  const nomorAwalBelanja: number[] = [];
  kelompok.reduce((dari, k) => {
    nomorAwalBelanja.push(dari);
    return dari + k.bahan.length;
  }, 0);
  const nomorAwalNeraca: number[] = [];
  neraca.reduce((dari, g) => {
    nomorAwalNeraca.push(dari);
    return dari + g.bahan.length;
  }, 0);
  const tanpaHarga = hasil.perluBeli.filter((c) => c.dana == null);

  // ===== Rincian per produk =====
  // Produk yang sama bisa muncul di dua baris rencana; di sini digabung.
  const perProduk = new Map<
    string,
    { product: PpicProduct; batches: number; bulkKg: number }
  >();
  for (const b of hasil.rencana) {
    const x = perProduk.get(b.product.id) || {
      product: b.product,
      batches: 0,
      bulkKg: 0,
    };
    x.batches += b.batches;
    x.bulkKg += b.bulkKg;
    perProduk.set(b.product.id, x);
  }
  const rincianProduk = [...perProduk.values()].map((x) => ({
    ...x,
    bahan: hasil.bahan
      .map((c) => ({
        c,
        qty: c.untuk.find((u) => u.product.id === x.product.id)?.qty ?? 0,
      }))
      .filter((b) => b.qty > 0)
      .sort((a, b) => b.qty - a.qty),
  }));

  // ===== Nomor bagian =====
  const adaPlan = hasil.planTerlibat.length > 0;
  const adaProses = hasil.dalamProses.length > 0;
  const bagian = [
    "rencana",
    ...(adaPlan ? ["plan"] : []),
    "neraca",
    "belanja",
    ...(adaProses ? ["proses"] : []),
    "produk",
  ];
  const no = Object.fromEntries(bagian.map((k, i) => [k, i + 1])) as Record<string, number>;

  const signers = signCfg.slots.filter((s) => s.aktif);

  return (
    <Lembar>
      {/* ===== KOP ===== */}
      <PrintKop
        nama={org?.nama || ""}
        alamat={settings?.alamat}
        kontak={kontakLine}
        logo={settings?.logo}
        kanan={
          <>
            <div className="text-[17px] font-bold tracking-wide leading-tight">
              RENCANA PRODUKSI
              <br />& KEBUTUHAN BELANJA
            </div>
            <div className="text-[11.5px] text-neutral-600 mt-1">
              Dicetak: {dicetak}
            </div>
            <div className="text-[11.5px] text-neutral-600">
              {hasil.rencana.length} produk · {hasil.perluBeli.length} bahan perlu
              dibeli
            </div>
          </>
        }
      />

      {data.gagal && (
        <p className="mt-4 border border-[#1a1a1a] px-3 py-2 text-[11.5px] font-medium">
          Sebagian data stok, plan produksi, karantina, atau PO gagal dimuat saat
          lembar ini dibuat, jadi angkanya bisa keliru. Muat ulang halaman lalu
          cetak ulang sebelum dipakai.
        </p>
      )}

      {hasil.rencana.length === 0 ? (
        <p className="mt-6">
          Belum ada rencana produksi di tautan ini. Susun dulu di menu PPIC
          Planner, lalu tekan Cetak Dokumen.
        </p>
      ) : (
        <>
          {/* ===== RINGKASAN ===== */}
          <div className="mt-5 grid grid-cols-4 border border-[#1a1a1a] text-center">
            {[
              { label: "Bahan di neraca", nilai: hasil.bahan.length.toLocaleString("id-ID") },
              { label: "Perlu dibeli", nilai: hasil.perluBeli.length.toLocaleString("id-ID") },
              { label: "Dalam proses", nilai: hasil.dalamProses.length.toLocaleString("id-ID") },
              { label: "Estimasi dana", nilai: formatRupiah(hasil.totalDana) },
            ].map((x, i) => (
              <div
                key={x.label}
                className={`px-2 py-2 ${i > 0 ? "border-l border-[#1a1a1a]" : ""}`}
              >
                <div className="text-[9.5px] uppercase tracking-wide text-neutral-500">
                  {x.label}
                </div>
                <div className="text-[14px] font-bold tabular-nums">{x.nilai}</div>
              </div>
            ))}
          </div>

          {/* ===== RENCANA PRODUKSI ===== */}
          <JudulBagian nomor={no.rencana}>Rencana produksi (PPIC)</JudulBagian>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-y border-[#1a1a1a]">
                <th className={`${TH} text-left w-8`}>No</th>
                <th className={`${TH} text-left`}>Produk</th>
                <th className={`${TH} text-right w-[16mm]`}>Batch</th>
                <th className={`${TH} text-right w-[24mm]`}>Ukuran Batch</th>
                <th className={`${TH} text-right w-[26mm]`}>Total Ruahan</th>
                <th className={`${TH} text-right w-[16mm] pr-0`}>Bahan</th>
              </tr>
            </thead>
            <tbody>
              {hasil.rencana.map((b, i) => (
                <tr key={i} className="border-b border-neutral-300">
                  <td className={TD}>{i + 1}</td>
                  <td className={TD}>
                    <div className="font-medium">{namaProduk(b.product)}</div>
                    <div className="text-[10.5px] text-neutral-500">
                      {[b.product.brand || "Tanpa brand", b.product.kategori]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </td>
                  <td className={`${TD} ${NUM}`}>{formatNum(b.batches)}</td>
                  <td className={`${TD} ${NUM}`}>
                    {b.product.batchKg > 0 ? `${formatNum(b.product.batchKg)} kg` : "belum diisi"}
                  </td>
                  <td className={`${TD} ${NUM} font-medium`}>
                    {b.bulkKg > 0 ? `${formatNum(b.bulkKg)} kg` : "-"}
                  </td>
                  <td className={`${TD} ${NUM} pr-0`}>{b.product.formulas.length}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#1a1a1a] font-bold">
                <td className="py-2 pr-2" colSpan={4}>
                  TOTAL RUAHAN ({hasil.rencana.length} baris rencana)
                </td>
                <td className={`py-2 pr-2 ${NUM}`}>{formatNum(totalBulk)} kg</td>
                <td className="py-2" />
              </tr>
            </tfoot>
          </table>

          {(hasil.tanpaUkuranBatch.length > 0 || hasil.tidakDitemukan > 0) && (
            <div className="mt-2 text-[11px] flex flex-col gap-0.5">
              {hasil.tanpaUkuranBatch.length > 0 && (
                <div>
                  <b>Belum bisa dihitung:</b>{" "}
                  {hasil.tanpaUkuranBatch.map(namaProduk).join(", ")} belum punya
                  ukuran batch (kg) di master produk, jadi kebutuhan bahannya tidak
                  ikut di lembar ini.
                </div>
              )}
              {hasil.tidakDitemukan > 0 && (
                <div>
                  <b>{hasil.tidakDitemukan} baris rencana dilewati:</b> produknya
                  sudah dinonaktifkan atau formulanya dihapus.
                </div>
              )}
            </div>
          )}

          {/* ===== PLAN PRODUKSI BERJALAN ===== */}
          {adaPlan && (
            <>
              <JudulBagian nomor={no.plan}>Plan produksi berjalan</JudulBagian>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-y border-[#1a1a1a]">
                    <th className={`${TH} text-left w-8`}>No</th>
                    <th className={`${TH} text-left w-[30mm]`}>No. Batch</th>
                    <th className={`${TH} text-left`}>Produk</th>
                    <th className={`${TH} text-left w-[28mm]`}>Status</th>
                    <th className={`${TH} text-left w-[24mm]`}>Rencana</th>
                    <th className={`${TH} text-left w-[26mm] pr-0`}>Dasar Jatah</th>
                  </tr>
                </thead>
                <tbody>
                  {hasil.planTerlibat.map((p, i) => (
                    <tr key={p.id} className="border-b border-neutral-300">
                      <td className={TD}>{i + 1}</td>
                      <td className={`${TD} font-mono text-[11.5px]`}>{p.noBatch}</td>
                      <td className={TD}>
                        <span className="font-medium">{p.produk}</span>
                        {p.brand && (
                          <span className="text-[10.5px] text-neutral-500"> · {p.brand}</span>
                        )}
                        <span className="text-[10.5px] text-neutral-500">
                          {" · "}
                          {formatNum(p.jumlahBatch)} batch
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>{p.status}</td>
                      <td className={`${TD} whitespace-nowrap`}>{formatTanggal(p.tanggal)}</td>
                      <td className={`${TD} whitespace-nowrap pr-0`}>
                        {p.dariTimbangan ? "Hasil timbangan" : "Formula"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 text-[11px] text-neutral-600 leading-snug">
                Plan yang belum Input Hasil. Bahannya belum terpotong dari stok, tapi
                sudah dijatah di neraca: dari hasil timbangan kalau sudah ditimbang,
                dari formula kalau belum.
              </div>
            </>
          )}

          {/* ===== NERACA BAHAN ===== */}
          <JudulBagian nomor={no.neraca}>Neraca bahan</JudulBagian>
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="border-y border-[#1a1a1a]">
                <th className={`${TH} text-left w-7`}>No</th>
                <th className={`${TH} text-left`}>Bahan</th>
                <th className={`${TH} text-right w-[18mm]`}>Stok Sisa</th>
                <th className={`${TH} text-right w-[18mm]`}>Plan Berjalan</th>
                <th className={`${TH} text-right w-[18mm]`}>Keb. PPIC</th>
                <th className={`${TH} text-right w-[18mm]`}>Kekurangan</th>
                <th className={`${TH} text-right w-[18mm]`}>Karantina / PO</th>
                <th className={`${TH} text-right w-[18mm] pr-0`}>Qty Beli</th>
              </tr>
            </thead>
            {neraca.map((g, gi) => (
              <tbody key={g.status}>
                <tr className="bg-neutral-100">
                  <td className="py-1 px-2 font-bold" colSpan={8}>
                    {g.status}
                    <span className="font-normal text-neutral-600">
                      {" · "}
                      {g.bahan.length} bahan
                    </span>
                  </td>
                </tr>
                {g.bahan.map((c, j) => (
                  <tr key={c.item.id} className="border-b border-neutral-200">
                    <td className="py-1 pr-2 align-top">{nomorAwalNeraca[gi] + j + 1}</td>
                    <td className="py-1 pr-2 align-top">
                      {c.item.nama}
                      <span className="text-[10px] text-neutral-500">
                        {" · "}
                        <span className="font-mono">{c.item.kode}</span> · {c.item.satuan}
                      </span>
                    </td>
                    <td className={`py-1 pr-2 ${NUM}`}>{angkaAtauStrip(c.item.stok)}</td>
                    <td className={`py-1 pr-2 ${NUM}`}>{angkaAtauStrip(c.alokasi)}</td>
                    <td className={`py-1 pr-2 ${NUM}`}>{angkaAtauStrip(c.butuh)}</td>
                    <td className={`py-1 pr-2 ${NUM} font-bold`}>{angkaAtauStrip(c.kurang)}</td>
                    <td className={`py-1 pr-2 ${NUM}`}>
                      {c.kurang > 0
                        ? angkaAtauStrip(c.qtyKarantina + c.qtyPoDikirim + c.qtyPoBelumDikirim)
                        : "-"}
                    </td>
                    <td className={`py-1 ${NUM} font-bold`}>{angkaAtauStrip(c.qtyBeli)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          <div className="mt-2 text-[11px] text-neutral-600 leading-snug">
            {hasil.bahan.length} bahan{ringkasStatus ? `: ${ringkasStatus}` : ""}.
            Kekurangan = Plan Berjalan + Kebutuhan PPIC, dikurangi Stok Sisa. Qty Beli =
            Kekurangan dikurangi Karantina / PO, dibulatkan ke atas mengikuti MOQ.
            Angka dalam satuan masing-masing bahan.
          </div>

          {/* ===== DAFTAR BELANJA ===== */}
          <JudulBagian nomor={no.belanja}>Daftar belanja</JudulBagian>
          {hasil.perluBeli.length === 0 ? (
            <p>
              {adaProses
                ? `Tidak ada yang perlu dipesan lagi. Kekurangan yang ada sudah tertutup lot karantina atau PO terbuka, lihat bagian ${no.proses}.`
                : "Stok bahan cukup untuk Plan berjalan dan seluruh rencana produksi, tidak ada yang perlu dibeli."}
            </p>
          ) : (
            <>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-y border-[#1a1a1a]">
                    <th className={`${TH} text-left w-8`}>No</th>
                    <th className={`${TH} text-left`}>Bahan &amp; Dipakai Untuk</th>
                    <th className={`${TH} text-right w-[21mm]`}>Kekurangan</th>
                    <th className={`${TH} text-right w-[21mm]`}>Karantina / PO</th>
                    <th className={`${TH} text-right w-[26mm]`}>Qty Beli</th>
                    <th className={`${TH} text-right w-[27mm] pr-0`}>Est. Dana</th>
                  </tr>
                </thead>
                {kelompok.map((k, ki) => (
                  <tbody key={k.supplier ?? ""} className="break-inside-avoid">
                    <tr className="bg-neutral-100">
                      <td className="py-1.5 px-2 font-bold" colSpan={5}>
                        {k.supplier || "Supplier belum diketahui"}
                        <span className="font-normal text-[10.5px] text-neutral-600">
                          {" · "}
                          {k.bahan.length} bahan
                        </span>
                      </td>
                      <td className={`py-1.5 ${NUM} font-bold`}>{formatRupiah(k.dana)}</td>
                    </tr>
                    {k.bahan.map((c, j) => {
                      const s = c.item.satuan;
                      return (
                        <tr key={c.item.id} className="border-b border-neutral-300">
                          <td className={TD}>{nomorAwalBelanja[ki] + j + 1}</td>
                          <td className={TD}>
                            <span className="font-medium">{c.item.nama}</span>
                            <span className="text-[10.5px] text-neutral-500">
                              {" · "}
                              <span className="font-mono">{c.item.kode}</span> · {s}
                            </span>
                            {c.untuk.length > 0 && (
                              <div className="text-[10.5px] text-neutral-600 leading-snug mt-0.5">
                                Rencana PPIC:{" "}
                                {c.untuk
                                  .map(
                                    (u) =>
                                      `${namaProduk(u.product)}${
                                        u.product.brand ? ` (${u.product.brand})` : ""
                                      } ${formatNum(u.qty)}`
                                  )
                                  .join("; ")}
                              </div>
                            )}
                            {c.alokasiPlan.length > 0 && (
                              <div className="text-[10.5px] text-neutral-600 leading-snug">
                                Plan berjalan:{" "}
                                {c.alokasiPlan
                                  .map((a) => `${a.plan.noBatch} ${a.plan.produk} ${formatNum(a.qty)}`)
                                  .join("; ")}
                              </div>
                            )}
                          </td>
                          <td className={`${TD} ${NUM}`}>{formatNum(c.kurang)}</td>
                          <td className={`${TD} ${NUM}`}>
                            {angkaAtauStrip(c.qtyKarantina + c.qtyPoDikirim + c.qtyPoBelumDikirim)}
                          </td>
                          <td className={`${TD} ${NUM}`}>
                            <div className="font-bold">
                              {formatNum(c.qtyBeli)} {s}
                            </div>
                            <div
                              className={`text-[10px] ${
                                c.tanpaMoq ? "font-bold text-[#1a1a1a]" : "text-neutral-500"
                              }`}
                            >
                              {c.tanpaMoq ? "MOQ belum diisi" : `MOQ ${formatNum(c.item.moq || 0)}`}
                            </div>
                          </td>
                          <td className={`py-1.5 align-top ${NUM}`}>
                            <div>{c.dana != null ? formatRupiah(c.dana) : "-"}</div>
                            <div className="text-[10px] text-neutral-500">
                              {c.item.harga != null ? `@ ${formatRupiah(c.item.harga)}` : "belum ada harga"}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
                <tfoot>
                  <tr className="border-t-2 border-[#1a1a1a] font-bold">
                    <td className="py-2 pr-2" colSpan={5}>
                      TOTAL ESTIMASI DANA ({hasil.perluBeli.length} bahan)
                    </td>
                    <td className={`py-2 ${NUM}`}>{formatRupiah(hasil.totalDana)}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="mt-2 text-[11px] text-neutral-600 leading-snug">
                Harga adalah pembelian terakhir tanpa PPN, jadi dananya perkiraan,
                bukan nilai PO. PO terbuka yang ikut mengurangi termasuk yang belum
                disetujui.
                {hasil.tanpaMoq.length > 0 && (
                  <>
                    {" "}
                    <b className="text-[#1a1a1a]">
                      Belum punya MOQ, jadi tidak dibulatkan:{" "}
                      {hasil.tanpaMoq.map((c) => c.item.nama).join(", ")}.
                    </b>
                  </>
                )}
                {tanpaHarga.length > 0 && (
                  <>
                    {" "}
                    <b className="text-[#1a1a1a]">
                      Belum ikut dijumlah karena belum pernah dibeli:{" "}
                      {tanpaHarga.map((c) => c.item.nama).join(", ")}.
                    </b>
                  </>
                )}
              </div>
            </>
          )}

          {/* ===== KARANTINA & PO TERBUKA ===== */}
          {adaProses && (
            <>
              <JudulBagian nomor={no.proses}>
                Karantina QC &amp; PO terbuka, dikejar bukan dibeli lagi
              </JudulBagian>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-y border-[#1a1a1a]">
                    <th className={`${TH} text-left w-[32mm]`}>Dokumen</th>
                    <th className={`${TH} text-left w-[30mm]`}>Tahap</th>
                    <th className={`${TH} text-left`}>Supplier</th>
                    <th className={`${TH} text-left w-[22mm]`}>Tanggal</th>
                    <th className={`${TH} text-right w-[24mm] pr-0`}>Sisa Qty</th>
                  </tr>
                </thead>
                {hasil.dalamProses.map((c) => (
                  <tbody key={c.item.id} className="break-inside-avoid">
                    <tr className="bg-neutral-100">
                      <td className="py-1.5 px-2" colSpan={5}>
                        <span className="font-bold">{c.item.nama}</span>
                        <span className="text-[10.5px] text-neutral-600">
                          {" · kekurangan "}
                          {formatNum(c.kurang)} {c.item.satuan} · {c.status}
                        </span>
                      </td>
                    </tr>
                    {dokumenProses(c.item).map((d, j) => (
                      <tr key={j} className="border-b border-neutral-200">
                        <td className={`${TD} font-mono text-[11px]`}>{d.nomor}</td>
                        <td className={`${TD} whitespace-nowrap`}>{d.tahap}</td>
                        <td className={TD}>{d.supplier || "-"}</td>
                        <td className={`${TD} whitespace-nowrap`}>{formatTanggal(d.tanggal)}</td>
                        <td className={`py-1.5 align-top ${NUM}`}>
                          {formatNum(d.qty)} {c.item.satuan}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
              <div className="mt-2 text-[11px] text-neutral-600 leading-snug">
                Menunggu QC: tertutup kalau lot karantina lolos uji. Menunggu
                Kedatangan: tertutup oleh PO yang sudah dikirim ke supplier. PO Belum
                Dikirim: tertutup oleh PO yang masih dibuat atau disetujui. Perlu Beli
                di sini berarti prosesnya baru menutup sebagian, sisanya ada di Daftar
                Belanja.
              </div>
            </>
          )}

          {/* ===== RINCIAN PER PRODUK ===== */}
          <JudulBagian nomor={no.produk}>Rincian kebutuhan bahan per produk</JudulBagian>
          <div className="text-[10.5px] text-neutral-600">
            Status dibaca dari neraca seluruhnya (Plan berjalan + seluruh rencana PPIC).
            Bahan yang dipakai beberapa produk bisa cukup untuk satu produk tapi tidak
            untuk semuanya.
          </div>
          {rincianProduk.map((x) => (
            <div key={x.product.id} className="mt-4 break-inside-avoid">
              <div className="flex items-baseline justify-between gap-3 border-b border-[#1a1a1a] pb-1">
                <div className="font-bold text-[13px]">
                  {namaProduk(x.product)}
                  {x.product.brand && (
                    <span className="font-normal text-[11.5px] text-neutral-600">
                      {" · "}
                      {x.product.brand}
                    </span>
                  )}
                </div>
                <div className="text-[10.5px] text-neutral-600 whitespace-nowrap">
                  {formatNum(x.batches)} batch
                  {x.bulkKg > 0 ? ` · ${formatNum(x.bulkKg)} kg ruahan` : ""}
                </div>
              </div>
              {x.bulkKg <= 0 ? (
                <p className="mt-1 text-[11.5px]">
                  Belum punya ukuran batch (kg), kebutuhannya tidak bisa dihitung.
                </p>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-400">
                      <th className={`${TH} py-1 text-left w-[10mm]`}>No</th>
                      <th className={`${TH} py-1 text-left`}>Bahan</th>
                      <th className={`${TH} py-1 text-right w-[30mm]`}>Kebutuhan</th>
                      <th className={`${TH} py-1 text-left w-[34mm] pr-0`}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {x.bahan.map(({ c, qty }, j) => (
                      <tr key={c.item.id} className="border-b border-neutral-200">
                        <td className="py-1 pr-2">{j + 1}</td>
                        <td className="py-1 pr-2">
                          {c.item.nama}
                          <span className="text-[10px] text-neutral-500 font-mono">
                            {" · "}
                            {c.item.kode}
                          </span>
                        </td>
                        <td className={`py-1 pr-2 ${NUM}`}>
                          {formatNum(qty)} {c.item.satuan}
                        </td>
                        <td
                          className={`py-1 whitespace-nowrap ${
                            c.status === "Cukup" ? "text-neutral-600" : "font-bold"
                          }`}
                        >
                          {c.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </>
      )}

      {/* ===== TANDA TANGAN ===== */}
      {hasil.rencana.length > 0 && signers.length > 0 && (
        <div
          className="mt-10 grid gap-6 text-center break-inside-avoid"
          style={{ gridTemplateColumns: `repeat(${signers.length}, 1fr)` }}
        >
          {signers.map((s, i) => (
            <div key={i}>
              <div className="text-[12px]">{s.label}</div>
              <div className="h-[22mm]" />
              <div className="font-semibold border-b border-[#1a1a1a] inline-block min-w-[40mm] pb-0.5">
                {s.nama || "(............................)"}
              </div>
              <div className="text-[11px] text-neutral-600 mt-1">{s.jabatan || ""}</div>
            </div>
          ))}
        </div>
      )}

      {/* ===== FOOTER ===== */}
      <div className="mt-10 pt-3 border-t border-neutral-300 text-[10px] text-neutral-400 flex justify-between gap-4">
        <span>
          Potret stok, plan produksi, karantina, PO, dan harga pada saat dicetak,
          bukan dokumen bernomor. Angkanya dihitung dengan rumus yang sama dengan
          layar PPIC Planner.
        </span>
        <span className="whitespace-nowrap">{dicetak}</span>
      </div>
    </Lembar>
  );
}
