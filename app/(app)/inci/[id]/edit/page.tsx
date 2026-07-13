import { createClient } from "@/lib/supabase/server";
import { updateInci } from "../../actions";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

export default async function EditInciPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: inci } = await supabase
    .from("inci_master")
    .select("*")
    .eq("id", id)
    .single();

  if (!inci) {
    notFound();
  }

  const updateInciWithId = updateInci.bind(null, id);

  return (
    <div className="max-w-lg">
      <Link href="/inci" className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink">
        <ArrowLeft size={15} /> Kembali ke INCI Name
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-6">Edit INCI Name</h1>

      <form action={updateInciWithId} className="glass rounded-2xl p-6 flex flex-col gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">INCI Name</label>
          <input
            name="inci_name"
            required
            defaultValue={inci.inci_name}
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">CAS Number</label>
            <input
              name="cas_number"
              defaultValue={inci.cas_number || ""}
              className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">NOAEL (mg/kg/d)</label>
            <input
              name="noael"
              defaultValue={inci.noael || ""}
              className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
          </div>
        </div>

        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Function</label>
          <input
            name="function"
            defaultValue={inci.function || ""}
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>

        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Reference</label>
          <textarea
            name="reference"
            rows={2}
            defaultValue={inci.reference || ""}
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>

        <button
          type="submit"
          className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm mt-2"
        >
          Simpan Perubahan
        </button>
      </form>
    </div>
  );
}