"use client";

import { useState } from "react";
import { DatabaseBackup, Download } from "lucide-react";
import { exportBackup } from "./actions";

export default function ExportCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleExport() {
    if (loading) return;
    setLoading(true);
    setError("");
    setSuccess("");
    const result = await exportBackup();
    if (result.ok) {
      const blob = new Blob([result.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `seawise-backup-${new Date().toLocaleDateString("sv-SE")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess("✓ Backup berhasil diunduh");
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  return (
    <div className="glass rounded-2xl p-5 flex flex-col gap-3 h-full">
      <div className="bg-clay-100 text-clay-600 rounded-xl p-2.5 self-start">
        <DatabaseBackup size={18} />
      </div>
      <div>
        <h2 className="font-display text-[15px] font-semibold text-ink">
          Export / Backup Database
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Unduh seluruh data company (supplier, material, stok, PO, produksi,
          client, dst.) dalam satu file JSON — simpan rutin sebagai pengamanan.
        </p>
      </div>
      <p className="text-[11.5px] text-muted">
        Berisi hanya data company-mu. Simpan di tempat aman — file ini memuat
        data bisnis lengkap.
      </p>
      <div className="mt-auto">
        <button
          type="button"
          onClick={handleExport}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-botanical-700 text-white rounded-lg py-2 text-[13px] font-medium hover:bg-botanical-800 transition-colors disabled:opacity-60"
        >
          {loading ? (
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <Download size={15} />
          )}
          {loading ? "Menyiapkan backup..." : "Download Backup (JSON)"}
        </button>
      </div>
      {error && <p className="text-clay-600 text-[12px]">{error}</p>}
      {success && (
        <p className="text-botanical-700 text-[12.5px] font-medium">{success}</p>
      )}
    </div>
  );
}
