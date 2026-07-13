import { createClient } from "@/lib/supabase/server";
import { updateSupplier } from "../../actions";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .single();

  if (!supplier) {
    notFound();
  }

  const updateSupplierWithId = updateSupplier.bind(null, id);

  return (
    <div className="max-w-lg">
      <Link href="/suppliers" className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink">
        <ArrowLeft size={15} /> Kembali ke Supplier
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-6">Edit Supplier</h1>

      <form action={updateSupplierWithId} className="bg-white border border-line rounded-lg p-6 flex flex-col gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Nama Supplier</label>
          <input
            name="nama"
            required
            defaultValue={supplier.nama}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>

        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Alamat</label>
          <textarea
            name="alamat"
            rows={2}
            defaultValue={supplier.alamat || ""}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">Nama Kontak</label>
            <input
              name="nama_kontak"
              defaultValue={supplier.nama_kontak || ""}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">No. Telp</label>
            <input
              name="no_telp"
              defaultValue={supplier.no_telp || ""}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">Email</label>
            <input
              name="email"
              type="email"
              defaultValue={supplier.email || ""}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">NPWP</label>
            <input
              name="npwp"
              defaultValue={supplier.npwp || ""}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
          </div>
        </div>

        <button
          type="submit"
          className="bg-botanical-700 text-white rounded-sm py-2.5 text-sm font-medium hover:bg-botanical-800 transition-colors mt-2"
        >
          Simpan Perubahan
        </button>
      </form>
    </div>
  );
}