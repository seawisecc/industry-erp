"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finishProduction } from "../../../actions";
import DataTable from "@/components/DataTable";
import { useConfirmSave } from "@/components/ConfirmSave";
import NumberInput from "@/components/NumberInput";

export type ResultVariant = {
  nama_varian: string;
  teoritis_pcs: number;
};

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}

export default function ResultForm({
  planId,
  variants,
}: {
  planId: string;
  variants: ResultVariant[];
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const [real, setReal] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      variants.map((v) => [
        v.nama_varian,
        v.teoritis_pcs > 0 ? String(v.teoritis_pcs) : "",
      ])
    )
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totalTeoritis = variants.reduce((s, v) => s + v.teoritis_pcs, 0);
  const totalReal = variants.reduce(
    (s, v) => s + parseNum(real[v.nama_varian] || ""),
    0
  );
  const yieldPct = totalTeoritis > 0 ? (totalReal / totalTeoritis) * 100 : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const lanjut = await konfirmasi.minta({
      judul: "Kunci hasil produksi batch ini?",
      pesan: "Stok bahan & kemasan terpotong sesuai data penimbangan, dan batch produk jadi terbentuk.",
      ringkasan: [
        { label: "Hasil Nyata", nilai: totalReal.toLocaleString("id-ID") + " pcs" },
        { label: "Teoritis", nilai: totalTeoritis.toLocaleString("id-ID") + " pcs" },
        { label: "Yield", nilai: yieldPct.toFixed(1).replace(".", ",") + " %" },
      ],
      tombol: "Ya, Simpan Hasil",
      nada: "bahaya",
    });
    if (!lanjut) return;

    setLoading(true);
    setError("");
    const result = await finishProduction(
      planId,
      variants.map((v) => ({
        varian_ukuran: v.nama_varian,
        qty_hasil: parseNum(real[v.nama_varian] || ""),
      }))
    );
    if (result.ok && result.batchId) {
      router.push(`/production/${result.batchId}`);
      router.refresh();
    } else {
      setError(result.error || "Gagal menyimpan hasil");
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Hasil Produk Jadi
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            Teoritis = rencana kemas dari tahap eksekusi. Isi jumlah real yang
            benar-benar jadi.
          </p>
        </div>

        <DataTable
          rows={variants}
          rowKey={(v) => v.nama_varian}
          minWidth={480}
          chrome="bare"
          expandable={false}
          empty="Belum ada varian."
          footer={{
            row: (
              <tr className="bg-white/50 font-semibold">
                <td className="px-4 py-2.5 sticky-col">Total</td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px]">
                  {totalTeoritis.toLocaleString("id-ID")}
                </td>
                <td className="px-4 py-2.5 font-mono text-[12px]">
                  {totalReal.toLocaleString("id-ID")}
                </td>
                <td
                  className={`px-4 py-2.5 text-right text-[12px] ${
                    yieldPct >= 95 ? "text-botanical-700" : "text-clay-600"
                  }`}
                >
                  yield{" "}
                  {yieldPct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
                </td>
              </tr>
            ),
            card: (
              <div className="flex items-baseline justify-between gap-3 font-semibold">
                <span className="text-[12px] text-muted">
                  Total {totalReal.toLocaleString("id-ID")} dari{" "}
                  {totalTeoritis.toLocaleString("id-ID")} pcs
                </span>
                <span
                  className={
                    yieldPct >= 95 ? "text-botanical-700" : "text-clay-600"
                  }
                >
                  yield{" "}
                  {yieldPct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
                </span>
              </div>
            ),
          }}
          columns={[
            {
              key: "varian",
              header: "Varian",
              role: "title",
              className: "font-medium",
              cell: (v) => v.nama_varian,
            },
            {
              key: "teoritis",
              header: "Teoritis (pcs)",
              role: "primary",
              align: "right",
              className: "font-mono text-[12px]",
              cell: (v) => v.teoritis_pcs.toLocaleString("id-ID"),
            },
            {
              key: "real",
              header: "Real (pcs)",
              role: "primary",
              headClassName: "w-[150px]",
              cell: (v) => (
                <NumberInput
                  aria-label={`Hasil real ${v.nama_varian}`}
                  value={real[v.nama_varian] || ""}
                  onChange={(nilai) =>
                    setReal((s) => ({ ...s, [v.nama_varian]: nilai }))
                  }
                  className={inputCls}
                />
              ),
            },
            {
              key: "selisih",
              header: "Selisih",
              role: "primary",
              align: "right",
              cell: (v) => {
                const diff = parseNum(real[v.nama_varian] || "") - v.teoritis_pcs;
                return (
                  <span
                    className={`font-mono text-[12px] ${
                      diff === 0
                        ? "text-muted"
                        : diff < 0
                          ? "text-clay-600"
                          : "text-botanical-700"
                    }`}
                  >
                    {diff === 0
                      ? "-"
                      : `${diff > 0 ? "+" : ""}${diff.toLocaleString("id-ID")}`}
                  </span>
                );
              },
            },
          ]}
        />
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading || totalReal <= 0}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading
          ? "Memotong stok & menghitung HPP..."
          : "Simpan Hasil & Potong Stok"}
      </button>
      <p className="text-muted text-[12px] text-center -mt-3">
        Stok terpotong FEFO sesuai timbangan real + kemasan + adjusting. HPP real
        tercatat di Production History.
      </p>
      {konfirmasi.dialog}
    </form>
  );
}
