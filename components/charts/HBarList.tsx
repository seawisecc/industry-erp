// Daftar bar horizontal (top-N) — server component, zero JS.

export default function HBarList({
  data,
  color = "#2F4D3A",
  formatValue,
}: {
  data: { label: string; value: number; sub?: string }[];
  color?: string;
  formatValue?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex flex-col gap-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex justify-between items-baseline mb-1">
            <span className="text-[12.5px] font-medium truncate max-w-[70%]" title={d.label}>
              {d.label}
            </span>
            <span className="text-[12px] text-muted whitespace-nowrap">
              {formatValue ? formatValue(d.value) : d.value}
              {d.sub ? ` ${d.sub}` : ""}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/50 border border-line overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
      {data.length === 0 && (
        <p className="text-muted text-[12.5px] text-center py-4">Belum ada data.</p>
      )}
    </div>
  );
}
