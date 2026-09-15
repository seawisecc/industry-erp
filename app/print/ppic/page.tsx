import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { canAccessModule } from "@/lib/modules";
import { getDocSignConfig } from "@/lib/docSignServer";
import { localDateTimeStr } from "@/lib/dates";
import {
  hitungPpic,
  rencanaDariQuery,
  rincianProses,
  URUTAN_STATUS,
  type PpicBahan,
  type PpicProduct,
} from "@/lib/ppic";
import { getPpicData } from "@/app/(app)/ppic/data";
import PrintButton from "../po/[id]/PrintButton";
import PrintKop from "@/components/PrintKop";

/* ============================================================
   Dokumen PPIC: rencana produksi, daftar belanja, dan untuk produk
   mana tiap bahan dibutuhkan.

   Planner tidak menyimpan apa pun, jadi rencananya datang dari URL
   (?r=) dan dihitung ulang di sini dengan lib/ppic.ts, rumus yang sama
   persis dengan layar. Stok, karantina, PO, dan harga dibaca SAAT
   dicetak, jadi kertas ini potret, bukan dokumen bernomor, dan jam
   cetaknya ikut tertulis.

   Urutan isinya mengikuti pertanyaan orang yang memegangnya:
   1. Mau produksi apa            -> Rencana Produksi
   2. Harus beli apa, ke siapa    -> Daftar Belanja, dikelompokkan per
                                     supplier karena PO dibuat per supplier
   3. Apa yang sudah di jalan     -> Sudah Dalam Proses: lot karantina
                                     dan PO terbuka yang harus dikejar,
                                     bukan dibeli lagi
   4. Bahan ini untuk produk apa  -> ditulis di tiap baris belanja, dan
                                     dirinci lagi per produk di bagian akhir

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
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
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

function JudulBagian({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-7 text-[11px] uppercase tracking-wide text-neutral-500">
      {children}
    </div>
  );
}

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

  const hasil = hitungPpic(data.products, data.items, rencanaDariQuery(r));
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
  // Nomor baris berlanjut antar kelompok supplier. Dihitung di sini,
  // bukan dengan counter yang dinaikkan di dalam render.
  const nomorAwal: number[] = [];
  kelompok.reduce((dari, k) => {
    nomorAwal.push(dari);
    return dari + k.bahan.length;
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

  const adaDalamProses = hasil.dalamProses.length > 0;
  const nomorRincian = adaDalamProses ? 4 : 3;

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
              {hasil.rencana.length} produk · {hasil.perluBeli.length} bahan
              perlu dibeli
            </div>
          </>
        }
      />

      {data.gagal && (
        <p className="mt-4 border border-[#1a1a1a] px-3 py-2 text-[11.5px] font-medium">
          Sebagian data stok, karantina, atau PO gagal dimuat saat lembar ini
          dibuat, jadi angkanya bisa keliru. Muat ulang halaman lalu cetak
          ulang sebelum dipakai.
        </p>
      )}

      {hasil.rencana.length === 0 ? (
        <p className="mt-6">
          Belum ada rencana produksi di tautan ini. Susun dulu di menu PPIC
          Planner, lalu tekan Cetak Dokumen.
        </p>
      ) : (
        <>
          {/* ===== 1. RENCANA PRODUKSI ===== */}
          <div className="mt-5 text-[11px] uppercase tracking-wide text-neutral-500">
            1. Rencana produksi
          </div>
          <table className="w-full mt-1 border-collapse">
            <thead>
              <tr className="border-y border-[#1a1a1a] text-[10.5px] uppercase tracking-wide">
                <th className="py-2 pr-2 text-left w-8">No</th>
                <th className="py-2 pr-2 text-left">Produk</th>
                <th className="py-2 pr-2 text-right w-[16mm]">Batch</th>
                <th className="py-2 pr-2 text-right w-[24mm]">Ukuran Batch</th>
                <th className="py-2 pr-2 text-right w-[26mm]">Total Ruahan</th>
                <th className="py-2 text-right w-[16mm]">Bahan</th>
              </tr>
            </thead>
            <tbody>
              {hasil.rencana.map((b, i) => (
                <tr key={i} className="border-b border-neutral-300">
                  <td className="py-1.5 pr-2 align-top">{i + 1}</td>
                  <td className="py-1.5 pr-2 align-top">
                    <div className="font-medium">{namaProduk(b.product)}</div>
                    <div className="text-[10.5px] text-neutral-500">
                      {[b.product.brand || "Tanpa brand", b.product.kategori]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 align-top text-right">
                    {formatNum(b.batches)}
                  </td>
                  <td className="py-1.5 pr-2 align-top text-right whitespace-nowrap">
                    {b.product.batchKg > 0
                      ? `${formatNum(b.product.batchKg)} kg`
                      : "belum diisi"}
                  </td>
                  <td className="py-1.5 pr-2 align-top text-right whitespace-nowrap font-medium">
                    {b.bulkKg > 0 ? `${formatNum(b.bulkKg)} kg` : "-"}
                  </td>
                  <td className="py-1.5 align-top text-right">
                    {b.product.formulas.length}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#1a1a1a] font-bold">
                <td className="py-2 pr-2" colSpan={4}>
                  TOTAL RUAHAN ({hasil.rencana.length} baris rencana)
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">
                  {formatNum(totalBulk)} kg
                </td>
                <td className="py-2" />
              </tr>
            </tfoot>
          </table>

          {(hasil.tanpaUkuranBatch.length > 0 || hasil.tidakDitemukan > 0) && (
            <div className="mt-2 text-[11px] flex flex-col gap-0.5">
              {hasil.tanpaUkuranBatch.length > 0 && (
                <div>
                  <b>Belum bisa dihitung:</b>{" "}
                  {hasil.tanpaUkuranBatch.map(namaProduk).join(", ")} belum
                  punya ukuran batch (kg) di master produk, jadi kebutuhan
                  bahannya tidak ikut di lembar ini.
                </div>
              )}
              {hasil.tidakDitemukan > 0 && (
                <div>
                  <b>{hasil.tidakDitemukan} baris rencana dilewati:</b>{" "}
                  produknya sudah dinonaktifkan atau formulanya dihapus.
                </div>
              )}
            </div>
          )}

          <div className="mt-2 text-[11px] text-neutral-600">
            {hasil.bahan.length} bahan terlibat
            {ringkasStatus ? ` · ${ringkasStatus}` : ""} · estimasi dana{" "}
            {formatRupiah(hasil.totalDana)}
          </div>

          {/* ===== 2. DAFTAR BELANJA ===== */}
          <JudulBagian>2. Daftar belanja</JudulBagian>
          {hasil.perluBeli.length === 0 ? (
            <p className="mt-1">
              {adaDalamProses
                ? "Tidak ada yang perlu dipesan lagi. Kekurangan yang ada sudah tertutup lot karantina atau PO terbuka, lihat bagian 3."
                : "Stok bahan cukup untuk seluruh rencana produksi, tidak ada yang perlu dibeli."}
            </p>
          ) : (
            <>
              <table className="w-full mt-1 border-collapse">
                <thead>
                  <tr className="border-y border-[#1a1a1a] text-[10.5px] uppercase tracking-wide">
                    <th className="py-2 pr-2 text-left w-8">No</th>
                    <th className="py-2 pr-2 text-left">Bahan &amp; Dipakai Untuk</th>
                    <th className="py-2 pr-2 text-right w-[22mm]">Kebutuhan</th>
                    <th className="py-2 pr-2 text-right w-[20mm]">Stok Siap</th>
                    <th className="py-2 pr-2 text-right w-[28mm]">Qty Beli</th>
                    <th className="py-2 text-right w-[28mm]">Est. Dana</th>
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
                      <td className="py-1.5 text-right font-bold whitespace-nowrap">
                        {formatRupiah(k.dana)}
                      </td>
                    </tr>
                    {k.bahan.map((c, j) => {
                      const s = c.item.satuan;
                      const proses = rincianProses(c.item);
                      return (
                        <tr key={c.item.id} className="border-b border-neutral-300">
                          <td className="py-1.5 pr-2 align-top">
                            {nomorAwal[ki] + j + 1}
                          </td>
                          <td className="py-1.5 pr-2 align-top">
                            <span className="font-medium">{c.item.nama}</span>
                            <span className="text-[10.5px] text-neutral-500 font-mono">
                              {" · "}
                              {c.item.kode}
                            </span>
                            <div className="text-[10.5px] text-neutral-600 leading-snug mt-0.5">
                              Untuk:{" "}
                              {c.untuk
                                .map(
                                  (u) =>
                                    `${namaProduk(u.product)}${
                                      u.product.brand ? ` (${u.product.brand})` : ""
                                    } ${formatNum(u.qty)} ${s}`
                                )
                                .join("; ")}
                            </div>
                            {proses.length > 0 && (
                              <div className="text-[10.5px] text-neutral-600 leading-snug">
                                Sudah dalam proses: {proses.join("; ")}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 pr-2 align-top text-right whitespace-nowrap">
                            {formatNum(c.butuh)} {s}
                          </td>
                          <td className="py-1.5 pr-2 align-top text-right whitespace-nowrap">
                            {formatNum(c.item.stok)} {s}
                          </td>
                          <td className="py-1.5 pr-2 align-top text-right whitespace-nowrap">
                            <div className="font-bold">
                              {formatNum(c.qtyBeli)} {s}
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              belum dipesan {formatNum(c.belumDipesan)}
                            </div>
                            <div
                              className={`text-[10px] ${
                                c.tanpaMoq ? "font-bold text-[#1a1a1a]" : "text-neutral-500"
                              }`}
                            >
                              {c.tanpaMoq
                                ? "MOQ belum diisi"
                                : `MOQ ${formatNum(c.item.moq || 0)}`}
                            </div>
                          </td>
                          <td className="py-1.5 align-top text-right whitespace-nowrap">
                            <div>{c.dana != null ? formatRupiah(c.dana) : "-"}</div>
                            <div className="text-[10px] text-neutral-500">
                              {c.item.harga != null
                                ? `@ ${formatRupiah(c.item.harga)}`
                                : "belum ada harga"}
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
                    <td className="py-2 text-right whitespace-nowrap">
                      {formatRupiah(hasil.totalDana)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <div className="mt-2 text-[11px] text-neutral-600 leading-snug">
                Qty beli adalah kekurangan terhadap stok siap pakai, dikurangi
                lot yang masih karantina QC dan PO yang masih terbuka (termasuk
                yang belum disetujui), lalu dibulatkan ke atas mengikuti MOQ.
                Harga adalah pembelian terakhir tanpa PPN, jadi dananya
                perkiraan, bukan nilai PO.
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

          {/* ===== 3. SUDAH DALAM PROSES ===== */}
          {adaDalamProses && (
            <>
              <JudulBagian>3. Sudah dalam proses, dikejar bukan dibeli lagi</JudulBagian>
              <table className="w-full mt-1 border-collapse">
                <thead>
                  <tr className="border-y border-[#1a1a1a] text-[10.5px] uppercase tracking-wide">
                    <th className="py-2 pr-2 text-left w-8">No</th>
                    <th className="py-2 pr-2 text-left">Bahan</th>
                    <th className="py-2 pr-2 text-right w-[22mm]">Kekurangan</th>
                    <th className="py-2 pr-2 text-left">Karantina QC / PO Terbuka</th>
                    <th className="py-2 text-left w-[30mm]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {hasil.dalamProses.map((c, i) => (
                    <tr key={c.item.id} className="border-b border-neutral-300 break-inside-avoid">
                      <td className="py-1.5 pr-2 align-top">{i + 1}</td>
                      <td className="py-1.5 pr-2 align-top">
                        <span className="font-medium">{c.item.nama}</span>
                        <div className="text-[10.5px] text-neutral-500 font-mono">
                          {c.item.kode}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 align-top text-right whitespace-nowrap">
                        {formatNum(c.kurang)} {c.item.satuan}
                      </td>
                      <td className="py-1.5 pr-2 align-top text-[11px] leading-snug">
                        {rincianProses(c.item).map((b, j) => (
                          <div key={j}>{b}</div>
                        ))}
                      </td>
                      <td className="py-1.5 align-top whitespace-nowrap font-medium">
                        {c.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 text-[11px] text-neutral-600 leading-snug">
                Menunggu QC: tertutup kalau lot karantina lolos uji. Menunggu
                Kedatangan: tertutup oleh PO yang sudah dikirim ke supplier. PO
                Belum Dikirim: tertutup oleh PO yang masih dibuat atau disetujui.
                Status Perlu Beli di sini berarti prosesnya baru menutup
                sebagian, sisanya ada di Daftar Belanja.
              </div>
            </>
          )}

          {/* ===== RINCIAN PER PRODUK ===== */}
          <JudulBagian>
            {nomorRincian}. Rincian kebutuhan bahan per produk
          </JudulBagian>
          <div className="text-[10.5px] text-neutral-600">
            Status dibaca dari total kebutuhan seluruh rencana terhadap stok.
            Bahan yang dipakai beberapa produk bisa cukup untuk satu produk
            tapi tidak untuk semuanya.
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
                  Belum punya ukuran batch (kg), kebutuhannya tidak bisa
                  dihitung.
                </p>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide border-b border-neutral-400">
                      <th className="py-1 pr-2 text-left w-[10mm]">No</th>
                      <th className="py-1 pr-2 text-left">Bahan</th>
                      <th className="py-1 pr-2 text-right w-[30mm]">Kebutuhan</th>
                      <th className="py-1 text-left w-[32mm]">Status</th>
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
                        <td className="py-1 pr-2 text-right whitespace-nowrap">
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
      {hasil.rencana.length > 0 && signCfg.slots.some((s) => s.aktif) && (
        <div
          className="mt-10 grid gap-6 text-center break-inside-avoid"
          style={{
            gridTemplateColumns: `repeat(${
              signCfg.slots.filter((s) => s.aktif).length
            }, 1fr)`,
          }}
        >
          {signCfg.slots
            .filter((s) => s.aktif)
            .map((s, i) => (
              <div key={i}>
                <div className="text-[12px]">{s.label}</div>
                <div className="h-[22mm]" />
                <div className="font-semibold border-b border-[#1a1a1a] inline-block min-w-[40mm] pb-0.5">
                  {s.nama || "(............................)"}
                </div>
                <div className="text-[11px] text-neutral-600 mt-1">
                  {s.jabatan || ""}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ===== FOOTER ===== */}
      <div className="mt-10 pt-3 border-t border-neutral-300 text-[10px] text-neutral-400 flex justify-between gap-4">
        <span>
          Potret stok, karantina, PO, dan harga pada saat dicetak, bukan
          dokumen bernomor. Angkanya dihitung dengan rumus yang sama dengan
          layar PPIC Planner.
        </span>
        <span className="whitespace-nowrap">{dicetak}</span>
      </div>
    </Lembar>
  );
}
