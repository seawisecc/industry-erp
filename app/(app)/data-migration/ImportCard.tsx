"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  Download,
  Upload,
  Briefcase,
  BookText,
  FlaskConical,
  Boxes,
  LucideIcon,
} from "lucide-react";
import { runImport, ImportKind } from "./actions";

// Ikon dipilih di sini (client) — komponen/function tidak boleh dioper
// sebagai prop dari Server Component.
const ICONS: Record<ImportKind, LucideIcon> = {
  suppliers: Briefcase,
  inci: BookText,
  materials: FlaskConical,
  items: Boxes,
};

type CsvRow = Record<string, string | undefined>;

export type ImportCardConfig = {
  kind: ImportKind;
  title: string;
  desc: string;
  requiredCols: string[]; // kolom wajib
  optionalCols: string[];
  note?: string;
  templateSample: string[]; // 1 baris contoh, urut sesuai kolom
  previewCols: string[]; // kolom yang ditampilkan di preview (max 3)
};

/** Deteksi delimiter dari baris header — Excel region Indonesia sering pakai ";" */
function detectDelimiter(firstLine: string): string {
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

export default function ImportCard({ config }: { config: ImportCardConfig }) {
  const Icon = ICONS[config.kind];
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const allCols = [...config.requiredCols, ...config.optionalCols];

  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [success, setSuccess] = useState("");

  function downloadTemplate() {
    const csv =
      allCols.join(",") +
      "\n" +
      config.templateSample.map((v) => (v.includes(",") ? `"${v}"` : v)).join(",") +
      "\n";
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template-${config.kind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    setWarning("");
    setSuccess("");
    setRows([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = (evt.target?.result as string).replace(/^﻿/, "");
      const firstLine = text.split(/\r\n|\n/)[0] || "";
      const delimiter = detectDelimiter(firstLine);

      Papa.parse<CsvRow>(text, {
        header: true,
        skipEmptyLines: true,
        delimiter,
        transformHeader: (h) => h.trim().toLowerCase(),
        complete: (result) => {
          const headers = result.meta.fields || [];
          const missing = config.requiredCols.filter((c) => !headers.includes(c));
          if (missing.length > 0) {
            setError(
              `Kolom wajib tidak ditemukan: ${missing.join(", ")}. Kolom terbaca: ${headers.join(", ") || "(kosong)"}. Pakai template biar pasti cocok.`
            );
            return;
          }
          const unknown = headers.filter((h) => h && !allCols.includes(h));
          if (unknown.length > 0) {
            setWarning(`Kolom ini diabaikan: ${unknown.join(", ")}`);
          }
          setRows(result.data);
        },
        error: (err: Error) => setError(err.message),
      });
    };
    reader.readAsText(file);
    // reset supaya file yang sama bisa dipilih ulang
    e.target.value = "";
  }

  async function handleImport() {
    if (loading || rows.length === 0) return;
    setLoading(true);
    setError("");
    const result = await runImport(config.kind, rows);
    if (result.ok) {
      setSuccess(`✓ ${result.count} baris berhasil diimport`);
      setRows([]);
      setFileName("");
      router.refresh();
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-3">
      <div className="bg-botanical-100 text-botanical-700 rounded-xl p-2.5 self-start">
        <Icon size={18} />
      </div>

      <div>
        <h2 className="font-display text-[15px] font-semibold text-ink">
          {config.title}
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">{config.desc}</p>
      </div>

      <div className="bg-white/50 border border-line rounded-lg px-3 py-2.5">
        <div className="text-[10.5px] uppercase tracking-wide text-muted mb-1">
          Kolom CSV
        </div>
        <div className="font-mono text-[11.5px] leading-relaxed break-words">
          {config.requiredCols.map((c) => (
            <b key={c}>{c}, </b>
          ))}
          {config.optionalCols.join(", ")}
        </div>
      </div>

      {config.note && <p className="text-[11.5px] text-muted">{config.note}</p>}

      <div className="mt-auto flex flex-col gap-2">
        <button
          type="button"
          onClick={downloadTemplate}
          className="flex items-center justify-center gap-2 border border-line rounded-lg py-2 text-[13px] font-medium hover:bg-white/60 transition-colors"
        >
          <Download size={15} /> Download Template
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-2 bg-botanical-700 text-white rounded-lg py-2 text-[13px] font-medium hover:bg-botanical-800 transition-colors"
        >
          <Upload size={15} /> {fileName ? "Ganti File" : "Upload CSV"}
        </button>
      </div>

      {fileName && (
        <p className="text-[11.5px] text-muted truncate">📄 {fileName}</p>
      )}
      {error && <p className="text-clay-600 text-[12px]">{error}</p>}
      {warning && (
        <p className="text-amber-500 text-[12px] bg-amber-100 rounded-md px-2.5 py-1.5">
          ⚠ {warning}
        </p>
      )}
      {success && (
        <p className="text-botanical-700 text-[12.5px] font-medium">{success}</p>
      )}

      {rows.length > 0 && (
        <>
          <div className="border border-line rounded-lg overflow-hidden">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="bg-white/60 text-left text-muted">
                  {config.previewCols.map((c) => (
                    <th key={c} className="px-2 py-1.5 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 4).map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    {config.previewCols.map((c) => (
                      <td key={c} className="px-2 py-1.5 truncate max-w-[90px]">
                        {r[c] || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 4 && (
              <p className="text-[11px] text-muted px-2 py-1 bg-white/60">
                +{rows.length - 4} baris lainnya
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleImport}
            disabled={loading}
            className="bg-botanical-700 text-white rounded-lg py-2 text-[13px] font-medium hover:bg-botanical-800 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && (
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {loading ? "Mengimport..." : `Import ${rows.length} Baris`}
          </button>
        </>
      )}
    </div>
  );
}
