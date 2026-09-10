"use client";

/* ============================================================
   Catatan hasil develop + hasil uji tiap parameter.

   Boleh disimpan berkali-kali, dan itu inti alurnya: formulator
   mengisi sambil percobaan berjalan, bukan sekali di akhir. Simpan
   pertama menaikkan status Draft jadi Trial di sisi RPC.

   Satu komponen untuk dua keadaan (bisa diisi / sudah dibekukan),
   supaya susunan kolom target dan hasil persis sama di kedua-duanya.
   Formula yang sudah disetujui dibaca berdampingan dengan percobaan
   berikutnya, dan dua tata letak yang berbeda membuat orang salah
   membandingkan baris.
   ============================================================ */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import DataTable from "@/components/DataTable";
import { useConfirmSave } from "@/components/ConfirmSave";
import { enterKeFieldBerikutnya } from "@/lib/keyboard";
import { saveRndResult } from "../actions";

export type SpecRow = {
  id: string;
  grup: string | null;
  parameter: string;
  satuan: string | null;
  target: string | null;
  hasil: string | null;
};

export default function HasilForm({
  id,
  hasilDevelop,
  specs,
  beku,
}: {
  id: string;
  hasilDevelop: string | null;
  specs: SpecRow[];
  /** true = formula sudah diputuskan, isinya cuma dibaca */
  beku: boolean;
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const [catatan, setCatatan] = useState(hasilDevelop || "");
  const [hasil, setHasil] = useState<Record<string, string>>(() =>
    Object.fromEntries(specs.map((s) => [s.id, s.hasil || ""]))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const terisi = specs.filter((s) => (hasil[s.id] || "").trim()).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const lanjut = await konfirmasi.minta({
      judul: "Simpan hasil develop?",
      pesan:
        "Boleh disimpan berkali-kali selama formula belum diputuskan, jadi tidak perlu menunggu semua parameter terisi.",
      ringkasan: [
        { label: "Parameter terisi", nilai: `${terisi} dari ${specs.length}` },
        { label: "Catatan", nilai: catatan.trim() ? "diisi" : "kosong" },
      ],
    });
    if (!lanjut) return;

    setLoading(true);
    setError("");
    try {
      const res = await saveRndResult(
        id,
        catatan.trim() || null,
        specs.map((s) => ({ id: s.id, hasil: (hasil[s.id] || "").trim() || null }))
      );
      if (res.ok) {
        router.refresh();
        setLoading(false);
      } else {
        setError(res.error);
        setLoading(false);
      }
    } catch {
      setError(
        "Gagal menyimpan. Koneksi bermasalah, muat ulang halaman lalu coba lagi."
      );
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-2.5 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-botanical-700";

  const tabel = (
    <DataTable
      rows={specs}
      rowKey={(r) => r.id}
      minWidth={720}
      chrome="bare"
      expandable={false}
      maxHeight={false}
      empty="Formula ini belum punya spesifikasi target. Tambahkan lewat Ubah Formula."
      groupBy={{
        key: (r) => r.grup || "Lainnya",
        header: (g) => `${g.key} · ${g.rows.length} parameter`,
      }}
      columns={[
        {
          key: "parameter",
          header: "Parameter",
          role: "title",
          cell: (r) => (
            <>
              <div className="font-medium">{r.parameter}</div>
              {r.satuan && (
                <div className="text-[11px] text-muted">{r.satuan}</div>
              )}
            </>
          ),
        },
        {
          key: "target",
          header: "Target",
          role: "primary",
          cell: (r) => r.target || "-",
        },
        {
          key: "hasil",
          header: "Hasil Uji",
          role: "primary",
          cell: (r) =>
            beku ? (
              <span className={hasil[r.id] ? "" : "text-muted"}>
                {hasil[r.id] || "belum diisi"}
              </span>
            ) : (
              <input
                value={hasil[r.id] || ""}
                onChange={(e) =>
                  setHasil((h) => ({ ...h, [r.id]: e.target.value }))
                }
                placeholder="Hasil"
                aria-label={`Hasil uji ${r.parameter}`}
                className={inputCls}
              />
            ),
        },
      ]}
    />
  );

  if (beku) {
    return (
      <div className="flex flex-col gap-4">
        <div className="glass rounded-2xl p-6">
          <h2 className="font-display text-[15.5px] font-semibold text-ink mb-3">
            Hasil Uji Parameter
          </h2>
          {tabel}
        </div>
        <div className="glass rounded-2xl p-6">
          <h2 className="font-display text-[15.5px] font-semibold text-ink mb-2">
            Catatan Hasil Develop
          </h2>
          <p className="text-[13px] text-ink/80 whitespace-pre-wrap">
            {catatan || "Tidak ada catatan."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={enterKeFieldBerikutnya}
      className="flex flex-col gap-4"
    >
      <div className="glass rounded-2xl p-6">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Hasil Uji Parameter
          </h2>
          <span className="text-muted text-[12.5px]">
            {terisi} dari {specs.length} terisi
          </span>
        </div>
        {tabel}
      </div>

      <div className="glass rounded-2xl p-6">
        <h2 className="font-display text-[15.5px] font-semibold text-ink mb-2">
          Catatan Hasil Develop
        </h2>
        <textarea
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          rows={5}
          placeholder="Apa yang terjadi di lab: tekstur, kestabilan, kendala proses, usulan perbaikan untuk revisi berikutnya."
          className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
        />
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center justify-center gap-1.5 bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60"
      >
        <Save size={15} /> {loading ? "Menyimpan..." : "Simpan Hasil Develop"}
      </button>
      {konfirmasi.dialog}
    </form>
  );
}
