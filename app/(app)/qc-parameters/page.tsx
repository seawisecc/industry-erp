import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFeatures } from "@/lib/featuresServer";
import { redirect } from "next/navigation";
import SettingsShell from "@/components/SettingsShell";
import QcParamsForm from "./QcParamsForm";
import type { QcParamInput } from "@/lib/qcParams";

export default async function QcParametersPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();
  const features = await getFeatures(organizationId!);
  if (!(features.qc)) redirect("/settings");

  const { data } = await supabase
    .from("qc_parameters")
    .select("id, kategori, nama, satuan, spesifikasi, grup, aktif, urutan")
    .eq("organization_id", organizationId)
    .order("urutan");

  const initial = ((data || []) as QcParamInput[]).map((p) => ({
    id: p.id,
    kategori: p.kategori,
    nama: p.nama,
    satuan: p.satuan,
    spesifikasi: p.spesifikasi,
    grup: p.grup,
    aktif: p.aktif,
  }));

  return (
    <SettingsShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          Parameter Uji QC
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Master parameter pemeriksaan per kategori — bahan baku, bahan kemas,
          IPC/produk ruahan, dan produk jadi. Centang parameter yang ingin
          ditampilkan di lembar pengujian.
        </p>
      </div>

      <div className="mt-4">
        <QcParamsForm initial={initial} />
      </div>
    </SettingsShell>
  );
}
