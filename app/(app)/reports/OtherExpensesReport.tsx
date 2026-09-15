import DataTable from "@/components/DataTable";
import { TUJUAN_PEMAKAIAN, TUJUAN_TONE, type TujuanPemakaian } from "@/lib/materialIssue";
import type { BiayaLain, JenisKerugian } from "./biayaLain";

/* ============================================================
   Tab Other Expenses di Reports.

   Dua bagian yang SENGAJA punya total sendiri-sendiri: Biaya di Luar
   HPP (keputusan yang disengaja) dan Kerugian Persediaan (barang yang
   hilang). Alasannya ada di biayaLain.ts. Kartu ringkasannya pun
   dipisah warna, supaya tidak ada yang menjumlahkannya di kepala.
   ============================================================ */

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
function formatQty(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
}
function formatTanggal(iso: string) {
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function formatBulan(key: string) {
  return new Date(key + "-01T00:00:00").toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
}

const ANGKA = "whitespace-nowrap tabular-nums";
const th = "px-3 py-2.5 font-semibold";
const td = "px-3 py-2";
const thead = "text-left text-muted text-[11px] uppercase tracking-wide border-b border-line";

const WARNA_KERUGIAN: Record<JenisKerugian, string> = {
  Pemusnahan: "bg-clay-100 text-clay-600",
  "Selisih Opname Bahan": "bg-amber-100 text-amber-500",
  "Selisih Opname Produk Jadi": "bg-white/70 text-ink border border-line",
};

function Pil({ teks, warna }: { teks: string; warna: string }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${warna}`}
    >
      {teks}
    </span>
  );
}

function JudulSeksi({ judul, keterangan }: { judul: string; keterangan: string }) {
  return (
    <div className="mb-3">
      <h3 className="font-display text-[16px] font-semibold text-ink">{judul}</h3>
      <p className="text-[12px] text-muted leading-snug">{keterangan}</p>
    </div>
  );
}

function Kartu({
  label,
  nilai,
  keterangan,
  nada = "text-ink",
}: {
  label: string;
  nilai: string;
  keterangan: string;
  nada?: string;
}) {
  return (
    <div className="glass rounded-xl p-3.5 min-w-0">
      <div className="text-[10.5px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`font-display text-[17px] font-semibold mt-1 tabular-nums ${nada}`}>
        {nilai}
      </div>
      <div className="text-[11px] text-muted mt-0.5 leading-snug">{keterangan}</div>
    </div>
  );
}

export default function OtherExpensesReport({ data }: { data: BiayaLain }) {
  const { pemakaian, ongkir, ongkirMasukHpp, kerugian, dikecualikan, gagal } = data;

  const totalPemakaian = pemakaian.reduce((s, m) => s + m.nilai, 0);
  const totalOngkir = ongkir.reduce((s, o) => s + o.nilai, 0);
  const totalBiaya = totalPemakaian + totalOngkir;
  const totalKerugian = kerugian.reduce((s, k) => s + (k.nilai ?? 0), 0);
  const kerugianTanpaNilai = kerugian.filter((k) => k.nilai == null);

  // ===== Rekap per kategori =====
  const perTujuan = TUJUAN_PEMAKAIAN.map((t) => {
    const docs = pemakaian.filter((m) => m.tujuan === t);
    return { kategori: t, dokumen: docs.length, nilai: docs.reduce((s, m) => s + m.nilai, 0) };
  });
  // Tujuan lama yang tidak ada lagi di daftar tetap ikut, jangan hilang diam-diam.
  const tujuanLain = pemakaian.filter(
    (m) => !(TUJUAN_PEMAKAIAN as readonly string[]).includes(m.tujuan)
  );
  const jenisKerugian: JenisKerugian[] = [
    "Pemusnahan",
    "Selisih Opname Bahan",
    "Selisih Opname Produk Jadi",
  ];
  const perJenis = jenisKerugian.map((j) => {
    const rows = kerugian.filter((k) => k.jenis === j);
    return {
      jenis: j,
      baris: rows.length,
      nilai: rows.reduce((s, k) => s + (k.nilai ?? 0), 0),
      tanpaNilai: rows.filter((k) => k.nilai == null).length,
    };
  });

  // ===== Rekap per bulan, cuma kalau periodenya lebih dari sebulan =====
  const bulan = new Map<string, { pemakaian: number; ongkir: number; kerugian: number }>();
  const tambah = (tgl: string, kolom: "pemakaian" | "ongkir" | "kerugian", n: number) => {
    const key = tgl.slice(0, 7);
    const b = bulan.get(key) || { pemakaian: 0, ongkir: 0, kerugian: 0 };
    b[kolom] += n;
    bulan.set(key, b);
  };
  for (const m of pemakaian) tambah(m.tanggal, "pemakaian", m.nilai);
  for (const o of ongkir) tambah(o.tanggal, "ongkir", o.nilai);
  for (const k of kerugian) tambah(k.tanggal, "kerugian", k.nilai ?? 0);
  const rekapBulan = [...bulan].sort(([a], [b]) => a.localeCompare(b));

  const kosongSemua =
    pemakaian.length === 0 &&
    ongkir.length === 0 &&
    kerugian.length === 0 &&
    dikecualikan.length === 0;

  return (
    <>
      {gagal && (
        <p className="mb-4 text-clay-600 text-[12.5px] bg-clay-100 rounded-lg px-3 py-2">
          Sebagian data gagal dimuat, jadi angka di bawah bisa kurang dari
          kenyataan. Muat ulang halaman sebelum dipakai.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Kartu
          label="Biaya di Luar HPP"
          nilai={formatRupiah(totalBiaya)}
          keterangan="pemakaian bahan + ongkos kirim"
        />
        <Kartu
          label="Pemakaian Bahan"
          nilai={formatRupiah(totalPemakaian)}
          keterangan={`${pemakaian.length} dokumen Material Issue`}
        />
        <Kartu
          label="Ongkos Kirim"
          nilai={formatRupiah(totalOngkir)}
          keterangan={`${ongkir.length} faktur, tidak dibebankan ke HPP`}
        />
        <Kartu
          label="Kerugian Persediaan"
          nilai={formatRupiah(totalKerugian)}
          keterangan={[
            "terpisah dari biaya",
            kerugianTanpaNilai.length > 0
              ? `${kerugianTanpaNilai.length} belum bisa dinilai`
              : null,
            dikecualikan.length > 0
              ? `${dikecualikan.length} penyesuaian Admin tidak dihitung`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          nada="text-clay-600"
        />
      </div>

      {kosongSemua ? (
        <div className="glass rounded-2xl p-8 text-center text-muted text-[13px]">
          Tidak ada pemakaian bahan di luar produksi, ongkos kirim di luar HPP,
          maupun kerugian persediaan pada periode ini.
        </div>
      ) : (
        <>
          {/* ===== Rekap ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-7">
            <div className="glass rounded-2xl overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className={thead}>
                    <th className={th}>Biaya di Luar HPP</th>
                    <th className={`${th} text-right`}>Dokumen</th>
                    <th className={`${th} text-right`}>Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  {perTujuan.map((r) => (
                    <tr key={r.kategori} className="border-b border-line/70">
                      <td className={td}>Material Issue · {r.kategori}</td>
                      <td className={`${td} text-right ${ANGKA}`}>{r.dokumen || "-"}</td>
                      <td className={`${td} text-right ${ANGKA}`}>
                        {r.nilai ? formatRupiah(r.nilai) : "-"}
                      </td>
                    </tr>
                  ))}
                  {tujuanLain.length > 0 && (
                    <tr className="border-b border-line/70">
                      <td className={td}>Material Issue · tujuan lain</td>
                      <td className={`${td} text-right ${ANGKA}`}>{tujuanLain.length}</td>
                      <td className={`${td} text-right ${ANGKA}`}>
                        {formatRupiah(tujuanLain.reduce((s, m) => s + m.nilai, 0))}
                      </td>
                    </tr>
                  )}
                  <tr className="border-b border-line/70">
                    <td className={td}>Ongkos kirim pembelian</td>
                    <td className={`${td} text-right ${ANGKA}`}>{ongkir.length || "-"}</td>
                    <td className={`${td} text-right ${ANGKA}`}>
                      {totalOngkir ? formatRupiah(totalOngkir) : "-"}
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line font-semibold">
                    <td className={td}>Total</td>
                    <td className={`${td} text-right ${ANGKA}`}>
                      {pemakaian.length + ongkir.length}
                    </td>
                    <td className={`${td} text-right ${ANGKA}`}>{formatRupiah(totalBiaya)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="glass rounded-2xl overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className={thead}>
                    <th className={th}>Kerugian Persediaan</th>
                    <th className={`${th} text-right`}>Baris</th>
                    <th className={`${th} text-right`}>Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  {perJenis.map((r) => (
                    <tr key={r.jenis} className="border-b border-line/70">
                      <td className={td}>{r.jenis}</td>
                      <td className={`${td} text-right ${ANGKA}`}>{r.baris || "-"}</td>
                      <td className={`${td} text-right ${ANGKA}`}>
                        {r.nilai ? formatRupiah(r.nilai) : "-"}
                        {r.tanpaNilai > 0 && (
                          <div className="text-[10.5px] text-muted">
                            {r.tanpaNilai} belum dinilai
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line font-semibold">
                    <td className={td}>Total</td>
                    <td className={`${td} text-right ${ANGKA}`}>{kerugian.length}</td>
                    <td className={`${td} text-right ${ANGKA} text-clay-600`}>
                      {formatRupiah(totalKerugian)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {rekapBulan.length > 1 && (
            <div className="glass rounded-2xl overflow-x-auto mb-7">
              <table className="w-full text-[12.5px] min-w-[560px]">
                <thead>
                  <tr className={thead}>
                    <th className={th}>Bulan</th>
                    <th className={`${th} text-right`}>Pemakaian Bahan</th>
                    <th className={`${th} text-right`}>Ongkos Kirim</th>
                    <th className={`${th} text-right`}>Biaya di Luar HPP</th>
                    <th className={`${th} text-right`}>Kerugian Persediaan</th>
                  </tr>
                </thead>
                <tbody>
                  {rekapBulan.map(([key, b]) => (
                    <tr key={key} className="border-b border-line/70 last:border-0">
                      <td className={td}>{formatBulan(key)}</td>
                      <td className={`${td} text-right ${ANGKA}`}>
                        {b.pemakaian ? formatRupiah(b.pemakaian) : "-"}
                      </td>
                      <td className={`${td} text-right ${ANGKA}`}>
                        {b.ongkir ? formatRupiah(b.ongkir) : "-"}
                      </td>
                      <td className={`${td} text-right ${ANGKA} font-semibold`}>
                        {formatRupiah(b.pemakaian + b.ongkir)}
                      </td>
                      <td className={`${td} text-right ${ANGKA} text-clay-600`}>
                        {b.kerugian ? formatRupiah(b.kerugian) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== Biaya di luar HPP ===== */}
          <JudulSeksi
            judul="Pemakaian Bahan di Luar Produksi"
            keterangan="Material Issue, dinilai dengan biaya lot yang terpotong saat dokumen dibuat."
          />
          <div className="mb-7">
            <DataTable
              rows={pemakaian}
              rowKey={(m) => m.id}
              minWidth={820}
              empty="Tidak ada Material Issue pada periode ini."
              footer={
                pemakaian.length > 0
                  ? {
                      row: (
                        <tr className="border-t-2 border-line font-semibold">
                          <td className={`${td} sticky-col`} colSpan={4}>
                            TOTAL ({pemakaian.length} dokumen)
                          </td>
                          <td className={`${td} text-right ${ANGKA}`}>
                            {formatRupiah(totalPemakaian)}
                          </td>
                        </tr>
                      ),
                      card: (
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[12px] text-muted">
                            TOTAL ({pemakaian.length} dokumen)
                          </span>
                          <span className="font-semibold">{formatRupiah(totalPemakaian)}</span>
                        </div>
                      ),
                    }
                  : undefined
              }
              columns={[
                {
                  key: "tanggal",
                  header: "Tanggal",
                  role: "subtitle",
                  className: "whitespace-nowrap",
                  cell: (m) => formatTanggal(m.tanggal),
                },
                {
                  key: "no",
                  header: "No. Dokumen",
                  role: "title",
                  className: "font-mono text-[11.5px] whitespace-nowrap",
                  cell: (m) => m.no,
                },
                {
                  key: "tujuan",
                  header: "Tujuan",
                  role: "badge",
                  cell: (m) => (
                    <Pil
                      teks={m.tujuan}
                      warna={
                        TUJUAN_TONE[m.tujuan as TujuanPemakaian] ?? "bg-white/70 text-muted"
                      }
                    />
                  ),
                },
                {
                  key: "bahan",
                  header: "Bahan & Keterangan",
                  role: "secondary",
                  cell: (m) => (
                    <div className="max-w-[340px]">
                      <div className="truncate">
                        {m.bahan.length} bahan:{" "}
                        {m.bahan
                          .slice(0, 3)
                          .map((b) => b.nama)
                          .join(", ")}
                        {m.bahan.length > 3 ? `, +${m.bahan.length - 3} lainnya` : ""}
                      </div>
                      {m.catatan && (
                        <div className="text-[11px] text-muted truncate">{m.catatan}</div>
                      )}
                    </div>
                  ),
                  cardCell: (m) => (
                    <>
                      <div>
                        {m.bahan.length} bahan: {m.bahan.map((b) => b.nama).join(", ")}
                      </div>
                      {m.catatan && <div className="text-[11px] text-muted">{m.catatan}</div>}
                    </>
                  ),
                },
                {
                  key: "nilai",
                  header: "Nilai",
                  role: "primary",
                  align: "right",
                  className: `${ANGKA} font-medium`,
                  cell: (m) => formatRupiah(m.nilai),
                },
              ]}
            />
          </div>

          <JudulSeksi
            judul="Ongkos Kirim Pembelian"
            keterangan="Biaya kirim di faktur supplier yang tidak dibebankan ke HPP bahan. Mengikuti tanggal terima di faktur, bukan tanggal faktur itu diinput."
          />
          <div className="mb-2">
            <DataTable
              rows={ongkir}
              rowKey={(o) => o.id}
              minWidth={720}
              empty="Tidak ada ongkos kirim di luar HPP pada periode ini."
              footer={
                ongkir.length > 0
                  ? {
                      row: (
                        <tr className="border-t-2 border-line font-semibold">
                          <td className={`${td} sticky-col`} colSpan={4}>
                            TOTAL ({ongkir.length} faktur)
                          </td>
                          <td className={`${td} text-right ${ANGKA}`}>
                            {formatRupiah(totalOngkir)}
                          </td>
                        </tr>
                      ),
                      card: (
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[12px] text-muted">
                            TOTAL ({ongkir.length} faktur)
                          </span>
                          <span className="font-semibold">{formatRupiah(totalOngkir)}</span>
                        </div>
                      ),
                    }
                  : undefined
              }
              columns={[
                {
                  key: "tanggal",
                  header: "Tanggal",
                  role: "subtitle",
                  className: "whitespace-nowrap",
                  cell: (o) => formatTanggal(o.tanggal),
                },
                {
                  key: "faktur",
                  header: "No. Faktur",
                  role: "primary",
                  className: "font-mono text-[11.5px] whitespace-nowrap",
                  cell: (o) => o.noFaktur || "-",
                },
                {
                  key: "supplier",
                  header: "Supplier",
                  role: "title",
                  cell: (o) => <div className="max-w-[240px] truncate">{o.supplier || "-"}</div>,
                  cardCell: (o) => o.supplier || "-",
                },
                {
                  key: "po",
                  header: "No. PO",
                  role: "secondary",
                  className: "font-mono text-[11.5px] whitespace-nowrap",
                  cell: (o) => o.noPo || "-",
                },
                {
                  key: "nilai",
                  header: "Biaya Kirim",
                  role: "primary",
                  align: "right",
                  className: `${ANGKA} font-medium`,
                  cell: (o) => formatRupiah(o.nilai),
                },
              ]}
            />
          </div>
          {ongkirMasukHpp.jumlah > 0 && (
            <p className="text-[11.5px] text-muted px-1">
              {ongkirMasukHpp.jumlah} faktur lain dengan ongkos kirim{" "}
              {formatRupiah(ongkirMasukHpp.nilai)} sudah dibebankan ke HPP bahan,
              jadi tidak dihitung di sini supaya tidak terhitung dua kali.
            </p>
          )}

          {/* ===== Kerugian persediaan ===== */}
          <div className="mt-9">
            <JudulSeksi
              judul="Kerugian Persediaan"
              keterangan="Barang yang hilang dari pembukuan stok. Dihitung terpisah dan tidak dijumlahkan ke biaya di atas."
            />
            <DataTable
              rows={kerugian}
              rowKey={(k) => k.id}
              minWidth={900}
              empty={
                dikecualikan.length > 0
                  ? "Tidak ada kerugian yang dihitung. Selisih opname pada periode ini semuanya dicatat Admin, lihat di bawah."
                  : "Tidak ada pemusnahan maupun selisih opname yang turun pada periode ini."
              }
              footer={
                kerugian.length > 0
                  ? {
                      row: (
                        <tr className="border-t-2 border-line font-semibold">
                          <td className={`${td} sticky-col`} colSpan={4}>
                            TOTAL ({kerugian.length} baris
                            {kerugianTanpaNilai.length > 0
                              ? `, ${kerugianTanpaNilai.length} belum dinilai`
                              : ""}
                            )
                          </td>
                          <td className={`${td} text-right ${ANGKA} text-clay-600`}>
                            {formatRupiah(totalKerugian)}
                          </td>
                          <td className={td} colSpan={2} />
                        </tr>
                      ),
                      card: (
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[12px] text-muted">
                            TOTAL ({kerugian.length} baris)
                          </span>
                          <span className="font-semibold text-clay-600">
                            {formatRupiah(totalKerugian)}
                          </span>
                        </div>
                      ),
                    }
                  : undefined
              }
              columns={[
                {
                  key: "tanggal",
                  header: "Tanggal",
                  role: "subtitle",
                  className: "whitespace-nowrap",
                  cell: (k) => formatTanggal(k.tanggal),
                },
                {
                  key: "jenis",
                  header: "Jenis",
                  role: "badge",
                  cell: (k) => <Pil teks={k.jenis} warna={WARNA_KERUGIAN[k.jenis]} />,
                },
                {
                  key: "barang",
                  header: "Barang",
                  role: "title",
                  cell: (k) => (
                    <div className="max-w-[260px]">
                      <div className="truncate font-medium">{k.barang}</div>
                      <div className="text-[11px] text-muted truncate">
                        {[k.kode, k.keterangan].filter(Boolean).join(" · ") || "-"}
                      </div>
                    </div>
                  ),
                  cardCell: (k) => (
                    <>
                      <div>{k.barang}</div>
                      <div className="text-[11px] text-muted font-normal">
                        {[k.kode, k.keterangan].filter(Boolean).join(" · ")}
                      </div>
                    </>
                  ),
                },
                {
                  key: "qty",
                  header: "Qty",
                  role: "primary",
                  align: "right",
                  className: ANGKA,
                  cell: (k) => `${formatQty(k.qty)} ${k.satuan}`,
                },
                {
                  key: "nilai",
                  header: "Nilai",
                  role: "primary",
                  align: "right",
                  className: ANGKA,
                  cell: (k) =>
                    k.nilai != null ? (
                      <>
                        <div className="font-medium">{formatRupiah(k.nilai)}</div>
                        <div className="text-[10.5px] text-muted">{k.dasarNilai}</div>
                      </>
                    ) : (
                      <span className="text-amber-500 text-[12px]">
                        belum bisa dinilai
                      </span>
                    ),
                },
                {
                  key: "sumber",
                  header: "Sumber",
                  role: "secondary",
                  cell: (k) => <div className="max-w-[200px] truncate">{k.sumber}</div>,
                  cardCell: (k) => k.sumber,
                },
                {
                  key: "oleh",
                  header: "Dicatat Oleh",
                  role: "secondary",
                  className: "whitespace-nowrap",
                  cell: (k) => k.oleh || <span className="text-muted">tidak diketahui</span>,
                },
              ]}
            />

            {dikecualikan.length > 0 && (
              <details className="mt-4 glass rounded-2xl px-4 py-3 group">
                <summary className="cursor-pointer select-none text-[13px] font-medium text-ink">
                  {dikecualikan.length} penyesuaian dicatat Admin, tidak dihitung
                  sebagai kerugian
                  <span className="block text-[11.5px] font-normal text-muted">
                    Dianggap koreksi atau penyesuaian awal. Ditampilkan supaya tetap
                    bisa ditelusuri.
                  </span>
                </summary>
                <div className="mt-3">
                  <DataTable
                    rows={dikecualikan}
                    rowKey={(k) => k.id}
                    minWidth={760}
                    chrome="bare"
                    maxHeight={false}
                    columns={[
                      {
                        key: "tanggal",
                        header: "Tanggal",
                        role: "subtitle",
                        className: "whitespace-nowrap",
                        cell: (k) => formatTanggal(k.tanggal),
                      },
                      {
                        key: "jenis",
                        header: "Jenis",
                        role: "badge",
                        cell: (k) => <Pil teks={k.jenis} warna={WARNA_KERUGIAN[k.jenis]} />,
                      },
                      {
                        key: "barang",
                        header: "Barang",
                        role: "title",
                        cell: (k) => (
                          <div className="max-w-[240px]">
                            <div className="truncate">{k.barang}</div>
                            <div className="text-[11px] text-muted truncate">
                              {[k.kode, k.keterangan].filter(Boolean).join(" · ") || "-"}
                            </div>
                          </div>
                        ),
                        cardCell: (k) => (
                          <>
                            <div>{k.barang}</div>
                            <div className="text-[11px] text-muted font-normal">
                              {[k.kode, k.keterangan].filter(Boolean).join(" · ")}
                            </div>
                          </>
                        ),
                      },
                      {
                        key: "qty",
                        header: "Qty",
                        role: "primary",
                        align: "right",
                        className: ANGKA,
                        cell: (k) => `${formatQty(k.qty)} ${k.satuan}`,
                      },
                      {
                        key: "sumber",
                        header: "Sumber",
                        role: "secondary",
                        cell: (k) => <div className="max-w-[200px] truncate">{k.sumber}</div>,
                        cardCell: (k) => k.sumber,
                      },
                      {
                        key: "oleh",
                        header: "Dicatat Oleh",
                        role: "primary",
                        className: "whitespace-nowrap",
                        cell: (k) => k.oleh || "-",
                      },
                    ]}
                  />
                </div>
              </details>
            )}
            <div className="mt-3 grid gap-1 text-[11.5px] text-muted leading-snug px-1">
              <p>
                <b className="text-ink">Penilaian:</b> pemusnahan dengan harga lot
                yang dimusnahkan; selisih opname bahan dengan harga pembelian
                terakhir yang tercatat saat penyesuaian; produk jadi dengan HPP per
                pcs dari riwayat produksi. Produk yang belum pernah diproduksi lewat
                modul Produksi tidak punya HPP, jadi ditulis &quot;belum bisa
                dinilai&quot;, bukan nol.
              </p>
              <p>
                <b className="text-ink">Produk jadi dihitung bersih per produk per
                opname:</b> perpindahan stok antar varian (waktu nama varian diganti)
                tercatat sebagai pasangan minus dan plus, dan itu bukan kerugian.
              </p>
              <p>
                <b className="text-ink">Penyesuaian oleh Admin tidak dihitung:</b>{" "}
                selisih opname bahan dan produk jadi yang dicatat Admin dianggap
                koreksi atau penyesuaian awal, termasuk opname waktu aplikasi mulai
                dipakai. Yang dicatat staf dihitung. Pemusnahan selalu dihitung.
                Peran pembuat dibaca saat laporan dibuka.
              </p>
              <p>
                <b className="text-ink">Tidak termasuk:</b> barang ditolak QC (biasanya
                diretur ke supplier dan memotong hutang), dan selisih lebih opname
                (tidak dipakai mengurangi kerugian).
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
