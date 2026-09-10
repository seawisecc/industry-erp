import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { localDateStr } from "@/lib/dates";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import RndForm from "../RndForm";
import { getRndOptions } from "../data";

export default async function NewRndPage() {
  const { organizationId } = await getEffectiveOrg();
  const { items, clients } = await getRndOptions(organizationId!);

  return (
    <div className="max-w-5xl">
      <Link
        href="/rnd"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke R&amp;D Formulation
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Develop Formula Baru
      </h1>
      <p className="text-muted text-sm mb-6">
        Nomor formula dibuat otomatis saat disimpan. Lembar kerja lab bisa
        dicetak sesudahnya.
      </p>

      <RndForm items={items} clients={clients} hariIni={localDateStr()} />
    </div>
  );
}
