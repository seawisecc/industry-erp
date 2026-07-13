"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Upload, X, FileUp } from "lucide-react";
import { importInci } from "./actions";

type Row = {
  inci_name: string;
  cas_number?: string;
  noael?: string;
  function?: string;
  reference?: string;
};

const EXPECTED_COLUMNS = ["inci_name", "cas_number", "noael", "function", "reference"];

function detectDelimiter(firstLine: string): string {
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

export default function ImportButton() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    setWarning("");
    setRows([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const cleanText = text.replace(/^\uFEFF/, "");
      const firstLine = cleanText.split(/\r\n|\n/)[0] || "";
      const delimiter = detectDelimiter(firstLine);

      Papa.parse<Row>(cleanText, {
        header: true,
        skipEmptyLines: true,
        delimiter,
        transformHeader: (h) => h.trim().toLowerCase(),
        complete: (result) => {
          const headers = result.meta.fields || [];
          const hasNameColumn = headers.includes("inci_name");

          if (!hasNameColumn) {
            setWarning(
              `Kolom "inci_name" tidak ditemukan. Kolom yang terbaca dari file: ${headers.join(", ") || "(tidak ada)"}.`
            );
          }

          const unknownCols = headers.filter((h) => h && !EXPECTED_COLUMNS.includes(h));
          if (unknownCols.length > 0 && hasNameColumn) {
            setWarning(`Kolom ini tidak dikenali dan akan diabaikan: ${unknownCols.join(", ")}`);
          }

          setRows(result.data);
        },
        error: (err: Error) => setError(err.message),
      });
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setLoading(true);
    setError("");
    try {
      await importInci(rows);
      setOpen(false);
      setRows([]);
      setFileName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengimport data");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-white border border-line text-ink text-[13.5px] font-medium px-4 py-2.5 rounded-sm hover:bg-porcelain transition-colors"
      >
        <Upload size={16} /> Import CSV
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold">Import INCI Name dari CSV</h2>
              <button onClick={() => setOpen(false)}>
                <X size={18} className="text-muted" />
              </button>
            </div>

            <p className="text-[12.5px] text-muted mb-3">
              Kolom yang dikenali: <b>inci_name</b> (wajib), cas_number, noael, function, reference.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFile}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 border border-line rounded-sm px-3 py-2 text-sm mb-4 w-full hover:bg-porcelain transition-colors"
            >
              <FileUp size={16} className="text-muted flex-shrink-0" />
              <span className="truncate">{fileName || "Pilih File CSV..."}</span>
            </button>

            {error && <p className="text-clay-600 text-[12.5px] mb-3">{error}</p>}
            {warning && (
              <p className="text-amber-500 text-[12.5px] mb-3 bg-amber-100 rounded-sm px-3 py-2">
                ⚠ {warning}
              </p>
            )}

            {rows.length > 0 && (
              <div className="border border-line rounded-md overflow-hidden mb-4">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-porcelain text-left">
                      <th className="px-2 py-1.5">INCI Name</th>
                      <th className="px-2 py-1.5">CAS Number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="px-2 py-1.5">{r.inci_name || "-"}</td>
                        <td className="px-2 py-1.5">{r.cas_number || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 5 && (
                  <p className="text-[11.5px] text-muted px-2 py-1.5 bg-porcelain">
                    +{rows.length - 5} baris lainnya
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={rows.length === 0 || loading}
              className="w-full bg-botanical-700 text-white rounded-sm py-2.5 text-sm font-medium hover:bg-botanical-800 transition-colors disabled:opacity-50"
            >
              {loading ? "Mengimport..." : `Import ${rows.length} INCI Name`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}