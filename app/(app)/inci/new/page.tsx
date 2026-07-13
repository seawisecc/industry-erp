import { createInci } from "../actions";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NewInciPage() {
  return (
    <div className="max-w-lg">
      <Link href="/inci" className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink">
        <ArrowLeft size={15} /> Kembali ke INCI Name
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-6">Tambah INCI Name</h1>

      <form action={createInci} className="bg-white border border-line rounded-lg p-6 flex flex-col gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">INCI Name</label>
          <input
            name="inci_name"
            required
            placeholder="Misal: Aqua / Glycerin"
            className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">CAS Number</label>
            <input
              name="cas_number"
              placeholder="7732-18-5"
              className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">NOAEL (mg/kg/d)</label>
            <input
              name="noael"
              className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
          </div>
        </div>

        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Function</label>
          <input
            name="function"
            placeholder="Solvent / Humectant / dst"
            className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>

        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Reference</label>
          <textarea
            name="reference"
            rows={2}
            placeholder="Sumber rujukan (CIR, SCCS, dst)"
            className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>

        <button
          type="submit"
          className="bg-botanical-700 text-white rounded-sm py-2.5 text-sm font-medium hover:bg-botanical-800 transition-colors mt-2"
        >
          Simpan
        </button>
      </form>
    </div>
  );
}