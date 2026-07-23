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
    <div className="glass rounded-2xl p-4 sm:p-5 h-full flex flex-col">
      <div className="flex items-center gap-2.5">
        <div className={`rounded-xl p-2 sm:p-2.5 flex-shrink-0 ${TONE_STYLE[tone]}`}>
          <Icon size={17} />
        </div>
        <div className="text-[10.5px] sm:text-[12px] text-muted uppercase tracking-wide font-medium leading-tight">
          {label}
        </div>
      </div>
      <div className="font-display text-[21px] sm:text-[26px] font-semibold text-ink mt-2.5 sm:mt-3 leading-none break-words">
        {value}
      </div>
      {sub && (
        <div className="text-[11.5px] sm:text-[12.5px] text-muted mt-1.5 sm:mt-2 leading-snug line-clamp-2">
          {sub}
        </div>
      )}
    </div>
  );
}
