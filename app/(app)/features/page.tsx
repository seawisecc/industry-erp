import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFeatures } from "@/lib/featuresServer";
import SettingsShell from "@/components/SettingsShell";
import FeaturesForm from "./FeaturesForm";

export default async function FeaturesPage() {
  const { organizationId, isSuperAdmin } = await getEffectiveOrg();
  const features = await getFeatures(organizationId!);

  return (
    <SettingsShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Features</h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Aktifkan fitur lanjutan sesuai kesiapan pabrik Anda — bisa dinyalakan
          atau dimatikan kapan saja tanpa memengaruhi data.
        </p>
      </div>

      <div className="mt-4">
        <FeaturesForm initial={features} canToggleMes={isSuperAdmin} />
      </div>
    </SettingsShell>
  );
}
