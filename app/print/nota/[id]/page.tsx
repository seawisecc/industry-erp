/* ============================================================
   Nota / struk kasir untuk printer thermal 58 mm.

   Bukan invoice A4 yang diperkecil: lebarnya dikunci 48 mm (lebar
   cetak nyata printer 58 mm), tinggi halamannya `auto` supaya kertas
   dipotong tepat di akhir struk, dan seluruh warna dipaksa hitam-putih
   karena printer thermal cuma punya satu warna.
   Versi A4-nya tetap ada di /print/invoice/[id].
   ============================================================ */

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import { APP_TIMEZONE } from "@/lib/dates";
import NotaToolbar from "./NotaToolbar";
import { hitungTotalDokumen, parseTaxMode } from "@/lib/invoiceMath";

type NotaData = {
  id: string;
  no_invoice: string | null;
  tipe: string;
  tanggal: string;
  created_at: string | null;
  diskon_percent: number;
  pakai_tax: boolean;
  tax_percent: number;
  /** Model pajak yang dibekukan saat dokumen terbit. */
  tax_mode: string | null;
  /** Aturan DPP yang dibekukan saat dokumen terbit. */
  tax_dpp_nilai_lain: boolean | null;
  subtotal: number;
  total: number;
  catatan: string | null;
  nama_pembeli: string | null;
  status_bayar: string | null;
  dibuat_oleh: string | null;
  clients: { company_brand: string } | null;
  sales_invoice_items: {
    qty: number;
    harga: number;
    subtotal: number;
    varian_ukuran: string | null;
    products: { nama_produk: string } | null;
    services: { nama_jasa: string } | null;
  }[];
};

/** Angka rupiah tanpa prefix, desimal cuma muncul kalau memang ada. */
function rp(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

/** Qty boleh pecahan (mis. jasa 0,5 jam), jangan dipaksa bulat. */
function qtyStr(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
}

const waktuFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const tanggalFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function PrintNotaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: org }, { data: settings }] = await Promise.all([
    supabase
      .from("sales_invoices")
      .select(
        `id, no_invoice, tipe, tanggal, created_at, diskon_percent, pakai_tax, tax_percent, tax_mode, tax_dpp_nilai_lain,
         subtotal, total, catatan, nama_pembeli, status_bayar, dibuat_oleh,
         clients(company_brand),
         sales_invoice_items(qty, harga, subtotal, varian_ukuran, products(nama_produk), services(nama_jasa))`
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    supabase.from("organizations").select("nama").eq("id", organizationId).single(),
    supabase
      .from("organization_settings")
      // Logo sengaja tidak ikut diambil: nota thermal 58 mm tidak
      // memuatnya (lihat bab Logo perusahaan di CLAUDE.md), dan data URI
      // ratusan KB tidak perlu melintas untuk tiap struk kasir.
      .select("alamat, no_telp, email")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (!data) notFound();
  const inv = data as unknown as NotaData;

  // Nama kasir diambil terpisah, bukan lewat embed: relasi
  // sales_invoices.dibuat_oleh → profiles tidak dipakai di mana pun
  // dan nota tidak boleh gagal tampil hanya karena nama kasir kosong.
  const { data: kasir } = inv.dibuat_oleh
    ? await supabase
        .from("profiles")
        .select("nama")
        .eq("id", inv.dibuat_oleh)
        .maybeSingle()
    : { data: null };

  const { data: pays } = await supabase
    .from("sales_payments")
    .select("jumlah")
    .eq("invoice_id", id)
    .eq("organization_id", organizationId);
  const dibayar = (pays || []).reduce((s, p) => s + Number(p.jumlah), 0);
  const sisa = Number(inv.total) - dibayar;

  // Model pajaknya diambil dari dokumen, bukan dari pengaturan yang
  // berlaku sekarang: nota yang dicetak ulang tahun depan harus
  // menunjukkan angka yang sama dengan yang dibayar hari ini.
  const taxMode = parseTaxMode(inv.tax_mode);
  const rincian = hitungTotalDokumen(
    Number(inv.subtotal),
    Number(inv.diskon_percent),
    inv.pakai_tax,
    Number(inv.tax_percent),
    taxMode,
    inv.tax_dpp_nilai_lain !== false
  );

  const pembeli = inv.clients?.company_brand || inv.nama_pembeli || "Walk-in";
  const waktu = inv.created_at
    ? waktuFmt.format(new Date(inv.created_at))
    : tanggalFmt.format(new Date(inv.tanggal + "T00:00:00Z"));

  const garis = "border-t border-dashed border-black my-1";
  // Baris "label kiri, angka kanan". Angkanya tidak boleh dipotong atau
  // dipatahkan, jadi labelnya yang mengalah dan membungkus.
  const baris = "flex justify-between gap-1 items-baseline";
  const kiri = "min-w-0 break-words";
  const kanan = "shrink-0 whitespace-nowrap text-right";

  return (
    <div className="min-h-screen py-4 print:py-0 print:min-h-0">
      <style>{`
        @page { size: 58mm auto; margin: 0; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
        }
      `}</style>

      <NotaToolbar invoiceId={inv.id} />

      <div className="flex justify-center print:block">
        <div className="struk-58 bg-white text-black font-mono text-[9.5px] leading-[1.35] px-[2mm] py-[3mm] shadow-xl print:shadow-none">
          {/* ===== Kop toko ===== */}
          <div className="text-center">
            <div className="text-[12px] font-bold uppercase leading-tight break-words">
              {org?.nama}
            </div>
            {settings?.alamat && (
              <div className="mt-0.5 break-words">{settings.alamat}</div>
            )}
            {settings?.no_telp && <div>Telp {settings.no_telp}</div>}
          </div>

          <div className={garis} />

          {/* ===== Identitas transaksi ===== */}
          <div className={baris}>
            <span className="shrink-0">No</span>
            <span className="min-w-0 break-all text-right font-semibold">
              {inv.no_invoice || "-"}
            </span>
          </div>
          <div className={baris}>
            <span className="shrink-0">Waktu</span>
            <span className={kanan}>{waktu}</span>
          </div>
          <div className={baris}>
            <span className="shrink-0">Kasir</span>
            <span className="min-w-0 break-words text-right">
              {kasir?.nama || "-"}
            </span>
          </div>
          <div className={baris}>
            <span className="shrink-0">Pembeli</span>
            <span className="min-w-0 break-words text-right">{pembeli}</span>
          </div>

          <div className={garis} />

          {/* ===== Item =====
              Nama produk di baris sendiri supaya boleh sepanjang apa pun,
              angka di baris bawahnya. Dua kolom sejajar tidak muat di 48 mm. */}
          {inv.sales_invoice_items.map((it, i) => {
            const nama =
              it.products?.nama_produk || it.services?.nama_jasa || "-";
            return (
              <div key={i} className="mb-1 last:mb-0">
                <div className="break-words">
                  {nama}
                  {it.varian_ukuran ? ` (${it.varian_ukuran})` : ""}
                </div>
                <div className={baris}>
                  <span className={kiri}>
                    {qtyStr(Number(it.qty))} x {rp(Number(it.harga))}
                  </span>
                  <span className={kanan}>{rp(Number(it.subtotal))}</span>
                </div>
              </div>
            );
          })}

          <div className={garis} />

          {/* ===== Rekap ===== */}
          <div className={baris}>
            <span className={kiri}>Subtotal</span>
            <span className={kanan}>{rp(Number(inv.subtotal))}</span>
          </div>
          {rincian.diskon > 0 && (
            <>
              <div className={baris}>
                <span className={kiri}>
                  Diskon ({rp(Number(inv.diskon_percent))}%)
                </span>
                <span className={kanan}>-{rp(rincian.diskon)}</span>
              </div>
              <div className={baris}>
                <span className={kiri}>Sub Total</span>
                <span className={kanan}>{rp(rincian.netto)}</span>
              </div>
            </>
          )}
          {inv.pakai_tax && (
            <>
              {/* Pada Exclude angka ini sama dengan Sub Total. Struk 58 mm
                  tidak punya ruang untuk baris yang cuma mengulang. */}
              {taxMode === "Include" && (
                <div className={baris}>
                  <span className={kiri}>Sub Total Exc Tax</span>
                  <span className={kanan}>{rp(rincian.exTax)}</span>
                </div>
              )}
              <div className={baris}>
                <span className={kiri}>DPP</span>
                <span className={kanan}>{rp(rincian.dpp)}</span>
              </div>
              <div className={baris}>
                <span className={kiri}>PPN</span>
                <span className={kanan}>{rp(rincian.tax)}</span>
              </div>
            </>
          )}

          <div className="border-t border-black mt-1 pt-1" />
          <div className={`${baris} text-[12px] font-bold`}>
            <span className={kiri}>TOTAL</span>
            <span className={kanan}>{rp(Number(inv.total))}</span>
          </div>
          <div className="border-t border-black mt-1" />

          {inv.pakai_tax && (
            <div className="text-[9px] mt-0.5">
              {taxMode === "Include"
                ? "Harga sudah termasuk PPN."
                : "PPN ditambahkan."}
            </div>
          )}

          {/* ===== Pembayaran ===== */}
          <div className={`${baris} mt-1`}>
            <span className={kiri}>Tunai</span>
            <span className={kanan}>{rp(dibayar)}</span>
          </div>
          {sisa > 0.5 && (
            <div className={`${baris} font-bold`}>
              <span className={kiri}>Sisa</span>
              <span className={kanan}>{rp(sisa)}</span>
            </div>
          )}
          <div className="mt-0.5 text-center font-bold tracking-[0.2em]">
            {sisa <= 0.5 ? "LUNAS" : "BELUM LUNAS"}
          </div>

          {inv.catatan && (
            <>
              <div className={garis} />
              <div className="break-words">{inv.catatan}</div>
            </>
          )}

          <div className={garis} />

          {/* ===== Kaki ===== */}
          <div className="text-center">
            <div>Terima kasih atas kunjungan Anda</div>
            <div className="mt-1">
              Barang yang sudah dibeli tidak dapat ditukar tanpa nota ini
            </div>
            {settings?.email && <div className="mt-1">{settings.email}</div>}
            <div className="mt-1.5 text-[8.5px]">
              Nota ini bukan faktur pajak
            </div>
          </div>

          {/* Ruang potong kertas: printer thermal memotong beberapa mm
              di atas ujung cetak, tanpa ini baris terakhir ikut terpotong. */}
          <div className="h-[8mm]" />
        </div>
      </div>
    </div>
  );
}
