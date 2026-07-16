// Grafik batang ringan tanpa library — server component, zero JS di client.

export type BarGroup = {
  label: string;
  bars: { value: number; color: string; title?: string }[];
};

export default function BarChart({
  groups,
  height = 150,
  formatValue,
  showValue = false,
}: {
  groups: BarGroup[];
  height?: number;
  formatValue?: (n: number) => string;
  showValue?: boolean;
}) {
  const max = Math.max(1, ...groups.flatMap((g) => g.bars.map((b) => b.value)));

  return (
    <div>
      <div className="flex items-end gap-2 sm:gap-3" style={{ height }}>
        {groups.map((g, gi) => (
          <div key={gi} className="flex-1 flex items-end justify-center gap-1 h-full">
            {g.bars.map((b, bi) => {
              const h = Math.max(3, (b.value / max) * 100);
              return (
                <div
                  key={bi}
                  className="flex flex-col items-center justify-end h-full flex-1 max-w-[38px]"
                  title={b.title || `${g.label}: ${formatValue ? formatValue(b.value) : b.value}`}
                >
                  {showValue && b.value > 0 && (
                    <span className="text-[9.5px] text-muted mb-0.5 whitespace-nowrap">
                      {formatValue ? formatValue(b.value) : b.value}
                    </span>
                  )}
                  <div
                    className="w-full rounded-t-md transition-all"
                    style={{ height: `${h}%`, backgroundColor: b.color }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex gap-2 sm:gap-3 mt-1.5 border-t border-line pt-1.5">
        {groups.map((g, gi) => (
          <div
            key={gi}
            className="flex-1 text-center text-[10.5px] text-muted truncate"
            title={g.label}
          >
            {g.label}
          </div>
        ))}
      </div>
    </div>
  );
}
