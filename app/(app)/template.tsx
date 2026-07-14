// template.tsx di-mount ulang setiap pindah halaman → animasi .page-enter
// jalan tiap navigasi, bikin transisi antar halaman terasa halus.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
