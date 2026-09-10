import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { localDateStr } from "@/lib/dates";
import { statusBeku } from "@/lib/rnd";
import { kunciBahan } from "@/lib/rndCost";
import RndForm, { type FormulaAwal } from "../../RndForm";
import { getRndOptions } from "../../data";

type Raw = Omit<FormulaAwal, "items" | "specs" | "packaging"> & {
  no_formula: string;
  status: string;
  rnd_formula_items: {
    material_id: string | null;
    item_id: string | null;
    fase: string | null;
    percentage: number;
    fungsi: string | null;
  }[];
  rnd_formula_specs: (FormulaAwal["specs"][number] & { urutan: number })[];
  rnd_formula_packaging: {
    material_id: string | null;
    item_id: string | null;
    nama: string | null;
    qty_per_pcs: number;
    harga_estimasi: number | null;
  }[];
};

export default async function EditRndPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, opts] = await Promise.all([
    supabase
      .from("rnd_formulas")
      .select(
        "id, no_formula, status, nama_produk, brand, client_id, tanggal_develop, trial_gram, netto_gram, catatan, " +
          "rnd_formula_items(material_id, item_id, fase, percentage, fungsi), " +
          "rnd_formula_specs(id, urutan, grup, parameter, satuan, target), " +
          "rnd_formula_packaging(material_id, item_id, nama, qty_per_pcs, harga_estimasi)"
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    getRndOptions(organizationId!),
  ]);

  if (!data) notFound();
  const f = data as unknown as Raw;

  // Formula yang sudah diputuskan adalah potret keputusan hari itu.
  // RPC-nya juga menolak, tapi layar edit yang tetap terbuka cuma
  // membuat orang mengetik ulang formula lalu ditolak di ujung.
  if (statusBeku(f.status)) {
    return (
      <div className="max-w-3xl">
        <Link
          href={`/rnd/${id}`}
          className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
        >
          <ArrowLeft size={15} /> Kembali ke {f.no_formula}
        </Link>
        <div className="glass rounded-2xl p-8 text-center text-muted text-sm">
          Formula ini berstatus {f.status}, jadi isinya sudah dibekukan.
          Perubahan dilakukan lewat revisi baru, supaya versi yang dipakai
          produksi tetap bisa ditunjuk.
        </div>
      </div>
    );
  }

  const awal: FormulaAwal = {
    id: f.id,
    nama_produk: f.nama_produk,
    brand: f.brand,
    client_id: f.client_id,
    tanggal_develop: f.tanggal_develop,
    trial_gram: f.trial_gram == null ? null : Number(f.trial_gram),
    netto_gram: f.netto_gram == null ? null : Number(f.netto_gram),
    catatan: f.catatan,
    items: (f.rnd_formula_items || []).map((r) => ({
      key: kunciBahan(r.material_id, r.item_id),
      fase: r.fase,
      percentage: Number(r.percentage),
      fungsi: r.fungsi,
    })),
    specs: [...(f.rnd_formula_specs || [])]
      .sort((a, b) => a.urutan - b.urutan)
      .map((s) => ({
        id: s.id,
        grup: s.grup,
        parameter: s.parameter,
        satuan: s.satuan,
        target: s.target,
      })),
    packaging: (f.rnd_formula_packaging || []).map((p) => ({
      // Baris kemasan boleh tidak menunjuk master apa pun; yang seperti
      // itu tidak punya kunci dan cuma membawa namanya.
      key:
        p.material_id || p.item_id
          ? kunciBahan(p.material_id, p.item_id)
          : null,
      nama: p.nama,
      qty_per_pcs: Number(p.qty_per_pcs),
      harga_estimasi: p.harga_estimasi == null ? null : Number(p.harga_estimasi),
    })),
  };

  return (
    <div className="max-w-5xl">
      <Link
        href={`/rnd/${id}`}
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke {f.no_formula}
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Ubah Formula
      </h1>
      <p className="text-muted text-sm mb-6 font-mono">{f.no_formula}</p>

      <RndForm
        bahan={opts.bahan}
        clients={opts.clients}
        hariIni={localDateStr()}
        formula={awal}
      />
    </div>
  );
}
