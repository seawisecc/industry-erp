import { LucideIcon } from "lucide-react";

type Tone = "botanical" | "clay" | "amber";

const TONE_STYLE: Record<Tone, string> = {
  botanical: "bg-botanical-100 text-botanical-700",
  clay: "bg-clay-100 text-clay-600",
  amber: "bg-amber-100 text-amber-500",
};

export default function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "botanical",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2.5 ${TONE_STYLE[tone]}`}>
          <Icon size={18} />
        </div>
        <div className="text-[12px] text-muted uppercase tracking-wide font-medium">
          {label}
        </div>
      </div>
      <div className="font-display text-[26px] font-semibold text-ink mt-3 leading-none">
        {value}
      </div>
      {sub && <div className="text-[12.5px] text-muted mt-2">{sub}</div>}
    </div>
  );
}
