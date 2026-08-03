export default function PrintLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-[3px] border-botanical-700/20" />
        <div className="absolute inset-0 rounded-full border-[3px] border-botanical-700 border-t-transparent animate-spin" />
      </div>
      <p className="text-muted text-[13px]">Menyiapkan dokumen...</p>
    </div>
  );
}
