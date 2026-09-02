import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import SettingsShell from "@/components/SettingsShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import DataTable from "@/components/DataTable";
import {
  ilikeOr,
  pageInfo,
  parseListQuery,
  type SearchParams,
  orderFor,
} from "@/lib/pagination";
import {
  AKSI_TONE,
  MODUL_TERPANTAU,
  formatNilai,
  labelKolom,
  labelModul,
  type AktivitasAksi,
  type Perubahan,
} from "@/lib/activityLog";

type LogRow = {
  id: string;
  user_nama: string | null;
  user_email: string | null;
  modul: string;
  tabel: string;
  aksi: string;
  dokumen_no: string | null;
  ringkasan: string;
  perubahan: Perubahan | null;
  created_at: string;
};

/** Rentang waktu → jumlah hari ke belakang. "" = seluruh riwayat. */
const PERIODE: Record<string, number> = {
  "7": 7,
  "30": 30,
  "90": 90,
};

function formatWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Daftar "kolom: dari → ke" untuk aksi Ubah. */
function DaftarPerubahan({ perubahan }: { perubahan: Perubahan | null }) {
  const entries = Object.entries(perubahan ?? {});
  if (entries.length === 0) return <span className="text-muted">-</span>;

  return (
    <ul className="flex flex-col gap-1 text-[12px]">
      {entries.map(([kolom, v]) => (
        <li key={kolom} className="leading-snug">
          <span className="text-muted">{labelKolom(kolom)}: </span>
          <span className="text-clay-600 line-through">{formatNilai(v?.dari)}</span>
          <span className="text-muted"> → </span>
          <span className="text-botanical-700 font-medium">
            {formatNilai(v?.ke)}
          </span>
        </li>
      ))}
    </ul>
  );
}

const SORT: Record<string, string> = {
  waktu: "created_at",
  aksi: "aksi",
  modul: "modul",
  user: "user_nama",
  dokumen: "dokumen_no",
};

export default async function ActivityLogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  const ord = orderFor(sp, SORT, { column: "created_at", ascending: false });

  let query = supabase
    .from("activity_logs")
    .select(
      "id, user_nama, user_email, modul, tabel, aksi, dokumen_no, ringkasan, perubahan, created_at",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(ilikeOr(["ringkasan", "dokumen_no", "user_nama"], sp.q));
  if (sp.filter("modul")) query = query.eq("modul", sp.filter("modul"));
  if (sp.filter("aksi")) query = query.eq("aksi", sp.filter("aksi"));

  // Rentang dihitung sebagai instant (bukan tanggal kalender): created_at
  // adalah timestamptz, dan "30 hari terakhir" memang berarti 30x24 jam
  // ke belakang dari sekarang, bukan batas tengah malam di zona mana pun.
  const hari = PERIODE[sp.filter("periode")];
  if (hari) {
    const batas = new Date();
    batas.setDate(batas.getDate() - hari);
    query = query.gte("created_at", batas.toISOString());
  }

  const { data: logs, count } = await query
    .order(ord.column, { ascending: ord.ascending })
    // Penyeimbang: satu transaksi menghasilkan beberapa baris dengan
    // created_at yang sama persis, jadi tanpa ini urutannya bisa
    // berpindah-pindah antar muat ulang.
    .order("id", { ascending: false })
    .range(sp.from, sp.to);

  const list = (logs || []) as unknown as LogRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <SettingsShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          Activity Log
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          {info.total.toLocaleString("id-ID")} catatan · siapa mengubah apa dan
          kapan, untuk dokumen pembelian, produksi, QC/QA, penjualan, stok, dan
          hak akses
        </p>
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari ringkasan / no. dokumen / nama..."
          info={info}
          filters={[
            {
              param: "modul",
              label: "Semua Modul",
              options: MODUL_TERPANTAU.map((m) => ({
                value: m,
                label: labelModul(m),
              })),
            },
            {
              param: "aksi",
              label: "Semua Aksi",
              options: [
                { value: "Buat", label: "Buat" },
                { value: "Ubah", label: "Ubah" },
                { value: "Hapus", label: "Hapus" },
              ],
            },
            {
              param: "periode",
              label: "Seluruh Riwayat",
              options: [
                { value: "7", label: "7 hari terakhir" },
                { value: "30", label: "30 hari terakhir" },
                { value: "90", label: "90 hari terakhir" },
              ],
            },
          ]}
        />
      </div>

      <DataTable
        rows={list}
        rowKey={(r) => r.id}
        minWidth={900}
        empty={
          sp.q || sp.filter("modul") || sp.filter("aksi") || sp.filter("periode")
            ? "Tidak ada catatan yang cocok dengan pencarian/filter."
            : "Belum ada aktivitas tercatat."
        }
        columns={[
          {
            key: "waktu",
            header: "Waktu",
            sort: "waktu",
            role: "subtitle",
            className: "whitespace-nowrap text-[12.5px]",
            cell: (r) => formatWaktu(r.created_at),
          },
          {
            key: "ringkasan",
            header: "Aktivitas",
            role: "title",
            cell: (r) => (
              <div className="max-w-[320px] truncate" title={r.ringkasan}>
                {r.ringkasan}
              </div>
            ),
            cardCell: (r) => r.ringkasan,
          },
          {
            key: "aksi",
            header: "Aksi",
            sort: "aksi",
            role: "badge",
            cell: (r) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                  AKSI_TONE[r.aksi as AktivitasAksi] ?? "bg-white/70 text-muted"
                }`}
              >
                {r.aksi}
              </span>
            ),
          },
          {
            key: "modul",
            header: "Modul",
            sort: "modul",
            role: "primary",
            className: "whitespace-nowrap text-[12.5px]",
            cell: (r) => labelModul(r.modul),
          },
          {
            key: "user",
            header: "Oleh",
            sort: "user",
            role: "primary",
            cell: (r) => (
              <div className="max-w-[160px] truncate" title={r.user_email ?? ""}>
                {r.user_nama || "-"}
              </div>
            ),
            cardCell: (r) => r.user_nama || "-",
          },
          {
            key: "dokumen",
            header: "Dokumen",
            sort: "dokumen",
            role: "secondary",
            className: "font-mono text-[11.5px] whitespace-nowrap",
            cell: (r) => r.dokumen_no || "-",
          },
          {
            key: "perubahan",
            header: "Perubahan",
            cardLabel: "Rincian perubahan",
            role: "secondary",
            cell: (r) => (
              <div className="max-w-[320px]">
                <DaftarPerubahan perubahan={r.perubahan} />
              </div>
            ),
            cardCell: (r) => <DaftarPerubahan perubahan={r.perubahan} />,
          },
        ]}
      />
      <Pagination info={info} />

      <p className="text-[11.5px] text-muted px-1 pt-3 leading-relaxed">
        Catatan ditulis otomatis oleh database di transaksi yang sama dengan
        perubahannya, jadi tidak ada aksi yang bisa terlewat. Log ini{" "}
        <b>tidak bisa disunting atau dihapus</b> dari aplikasi, termasuk oleh
        Admin. Satu kali simpan produk dengan formula berubah tampil sebagai
        dua baris (formula lama dihapus, formula baru ditetapkan) karena memang
        begitu urutannya di database.
      </p>
    </SettingsShell>
  );
}
