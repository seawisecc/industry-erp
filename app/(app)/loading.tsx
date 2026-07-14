export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-[3px] border-botanical-700/20" />
        <div className="absolute inset-0 rounded-full border-[3px] border-botanical-700 border-t-transparent animate-spin" />
      </div>
      <p className="text-muted text-[13px]">Memuat halaman...</p>
    </div>
  );
}
