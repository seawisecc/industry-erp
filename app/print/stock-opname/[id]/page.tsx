import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import PrintButton from "../../po/[id]/PrintButton";
import { varianKey } from "@/lib/clientPrice";
import {
  URUT_GOLONGAN,
  type Golongan,
} from "@/app/(app)/stock-opname/golongan";

type OpnamePrint = {
  id: string;
  no_opname: string;
  tanggal: string;
  kategori: string | null;
  status: string;
  catatan: string | null;
};

type ItemRaw = {
  item_id: string | null;
  varian: string | null;
  items: { kode: string; nama: string; satuan: string; kategori: string } | null;
  products: { kode: string | null; nama_produk: string; brand: string | null } | null;
};

type SheetRow = {
  golongan: Golongan;
  kode: string;
  nama: string;
  /** brand pemilik produk jadi; null untuk baris bahan */
  brand: string | null;
  varian: string;
  satuan: string;
};

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function PrintOpnameSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: org }, { data: settings }] = await Promise.all([
    supabase
      .from("stock_opnames")
      .select("id, no_opname, tanggal, kategori, status, catatan")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    supabase.from("organizations").select("nama").eq("id", organizationId).single(),
    supabase
      .from("organization_settings")
      .select("alamat, no_telp, email")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (!data) notFound();
  const op = data as unknown as OpnamePrint;

  // Sengaja TIDAK mengambil qty_sistem.
  //
  // Ini inti dari lembar hitung: begitu angka sistem tercetak di sebelah
  // kolom isian, penghitungnya akan menyalin angka itu, bukan menghitung.
  // Selisih yang tidak pernah ketemu adalah selisih yang tidak pernah
  // diperbaiki. Perbandingannya dilakukan nanti di layar.
  const { data: rawItems } = await supabase
    .from("stock_opname_items")
    .select(
      "item_id, varian, items(kode, nama, satuan, kategori), products(kode, nama_produk, brand)"
    )
    .eq("opname_id", id)
    .eq("organization_id", organizationId);

  const rows: SheetRow[] = ((rawItems || []) as unknown as ItemRaw[])
    .map((r): SheetRow =>
      r.item_id
        ? {
            golongan: r.items?.kategori === "Kemasan" ? "Kemasan" : "Bahan Baku",
            kode: r.items?.kode || "-",
            nama: r.items?.nama || "(item terhapus)",
            brand: null,
            varian: "-",
            satuan: r.items?.satuan || "",
          }
        : {
            golongan: "Produk Jadi",
            kode: r.products?.kode || "-",
            nama: r.products?.nama_produk || "(produk terhapus)",
            brand: r.products?.brand || null,
            varian: varianKey(r.varian),
            satuan: "pcs",
          }
    )
    .sort(
      (a, b) =>
        URUT_GOLONGAN[a.golongan] - URUT_GOLONGAN[b.golongan] ||
        a.kode.localeCompare(b.kode) ||
        a.nama.localeCompare(b.nama) ||
        a.varian.localeCompare(b.varian)
    );

  // Lembar hitung dipisah per golongan: penghitungnya berpindah gudang,
  // dan satu daftar campur membuat orang bolak-balik antar rak.
  const kelompok = (["Bahan Baku", "Kemasan", "Produk Jadi"] as Golongan[])
    .map((g) => ({ golongan: g, rows: rows.filter((r) => r.golongan === g) }))
    .filter((k) => k.rows.length > 0);

  const kontakLine = [
    settings?.no_telp ? `Telp: ${settings.no_telp}` : null,
    settings?.email ? `Email: ${settings.email}` : null,
  ]
    .filter(Boolean)
    .join("  •  ");

  return (
    <div className="min-h-screen py-4 sm:py-8 print:py-0">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { body { background: white !important; } }
      `}</style>

      <PrintButton />

      <div className="bg-white text-[#1a1a1a] a4-sheet max-w-[210mm] mx-auto shadow-xl print:shadow-none rounded-sm print:rounded-none p-[15mm] print:p-0 text-[12.5px] leading-relaxed">
        {/* ===== KOP ===== */}
        <div className="flex justify-between items-start border-b-2 border-[#1a1a1a] pb-4">
          <div>
            <div className="font-display text-[22px] font-bold leading-tight">
              {org?.nama}
            </div>
            {settings?.alamat && (
              <div className="text-[11.5px] text-neutral-600 mt-1 max-w-[90mm] whitespace-pre-line">
                {settings.alamat}
              </div>
            )}
            {kontakLine && (
              <div className="text-[11px] text-neutral-600 mt-0.5">{kontakLine}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[19px] font-bold tracking-wide">
              LEMBAR HITUNG STOK
            </div>
            <div className="font-mono text-[13px] mt-1">{op.no_opname}</div>
            <div className="text-[11.5px] text-neutral-600 mt-0.5">
              Tanggal: {formatTanggal(op.tanggal)}
            </div>
            <div className="text-[11.5px] text-neutral-600">
              Cakupan: {op.kategori || "Semua golongan"}
            </div>
          </div>
        </div>

        {/* ===== PETUGAS ===== */}
        <div className="mt-4 grid grid-cols-3 gap-6 text-[11.5px]">
          <div>
            <span className="text-neutral-500">Penghitung: </span>
            <span className="inline-block border-b border-neutral-400 min-w-[35mm]">
              &nbsp;
            </span>
          </div>
          <div>
            <span className="text-neutral-500">Saksi: </span>
            <span className="inline-block border-b border-neutral-400 min-w-[35mm]">
              &nbsp;
            </span>
          </div>
          <div>
            <span className="text-neutral-500">Jam mulai: </span>
            <span className="inline-block border-b border-neutral-400 min-w-[25mm]">
              &nbsp;
            </span>
          </div>
        </div>

        {op.catatan && (
          <div className="mt-3 text-[11.5px]">
            <span className="text-neutral-500">Catatan: </span>
            {op.catatan}
          </div>
        )}

        {/* ===== TABEL HITUNG, satu bagian per golongan ===== */}
        <div className="text-[11px] uppercase tracking-wide text-neutral-500 mt-5 mb-1">
          {rows.length} baris · isi kolom Hasil Hitung dengan angka fisik di
          gudang
        </div>
        {kelompok.map((k) => (
          <div key={k.golongan} className="mt-4 first:mt-0">
            <div className="flex items-baseline justify-between border-b border-[#1a1a1a] pb-1 mb-0">
              <div className="font-bold text-[13px] tracking-wide uppercase">
                {k.golongan}
              </div>
              <div className="text-[10.5px] text-neutral-600">
                {k.rows.length} baris
              </div>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wide border-b-2 border-[#1a1a1a]">
                  <th className="py-2 pr-2 text-left w-[10mm]">No</th>
                  <th className="py-2 pr-2 text-left">Kode</th>
                  <th className="py-2 pr-2 text-left">
                    {k.golongan === "Produk Jadi" ? "Nama Produk" : "Nama Item"}
                  </th>
                  <th className="py-2 pr-2 text-left w-[24mm]">
                    {k.golongan === "Produk Jadi" ? "Varian" : "Golongan"}
                  </th>
                  <th className="py-2 pr-2 text-left w-[14mm]">Satuan</th>
                  <th className="py-2 pr-2 text-center w-[28mm]">Hasil Hitung</th>
                  <th className="py-2 text-left w-[32mm]">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {k.rows.map((r, i) => (
                  <tr key={i} className="border-b border-neutral-300">
                    <td className="py-2.5 pr-2 text-neutral-500">{i + 1}</td>
                    <td className="py-2.5 pr-2 font-mono text-[11px] whitespace-nowrap">
                      {r.kode}
                    </td>
                    <td className="py-2.5 pr-2">
                      {r.nama}
                      {r.brand ? (
                        <span className="text-neutral-500"> · {r.brand}</span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-2 text-[11px] text-neutral-600">
                      {k.golongan === "Produk Jadi" ? r.varian : k.golongan}
                    </td>
                    <td className="py-2.5 pr-2 text-[11px]">{r.satuan}</td>
                    {/* Kolom isian: sengaja kosong, tanpa angka sistem */}
                    <td className="py-2.5 pr-2 border-l border-neutral-300">
                      &nbsp;
                    </td>
                    <td className="py-2.5 border-l border-neutral-300">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* ===== TANDA TANGAN ===== */}
        <div className="mt-10 grid grid-cols-3 gap-6 text-center break-inside-avoid">
          {["Dihitung oleh,", "Diperiksa oleh,", "Disetujui oleh,"].map((l) => (
            <div key={l}>
              <div className="text-[12px]">{l}</div>
              <div className="h-[22mm]" />
              <div className="border-b border-[#1a1a1a] inline-block min-w-[40mm] pb-0.5">
                &nbsp;
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 pt-3 border-t border-neutral-300 text-[10px] text-neutral-400 flex justify-between">
          <span>
            Lembar hitung {op.no_opname} · angka sistem sengaja tidak dicetak
          </span>
          <span>{org?.nama}</span>
        </div>
      </div>
    </div>
  );
}
