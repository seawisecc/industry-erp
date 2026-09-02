/* ============================================================
   Kop dokumen cetak A4.

   Sembilan dokumen (PO, Penerimaan, Retur Pembelian, Produksi, QC,
   QC Produk Jadi, QA, Stock Opname, Tanda Terima Konsinyasi) dulu
   menyalin markup kop yang sama persis. Sembilan salinan berarti
   sembilan kesempatan untuk lupa: waktu logo ditambahkan, delapan di
   antaranya akan tetap tercetak tanpa logo tanpa error apa pun.

   Invoice TIDAK memakai komponen ini. Kopnya berbentuk banner berwarna
   dengan identitas perusahaan di kanan, bukan kiri, karena sisi kirinya
   dipakai logo dan sisi kanannya harus sejajar dengan blok nomor &
   tanggal di bawahnya. Nota 58 mm juga tidak: kertas thermal cuma
   punya satu warna dan logonya lebih sering keluar jadi blok hitam
   daripada terbaca.
   ============================================================ */

export type PrintKopProps = {
  nama: string;
  alamat?: string | null;
  /** Baris "Telp: ... | Email: ..." yang sudah dirangkai pemanggil. */
  kontak?: string | null;
  /** Data URI logo perusahaan. Kosong = kop tanpa logo, tetap rapi. */
  logo?: string | null;
  /** Blok kanan: judul dokumen, nomor, tanggal. */
  kanan: React.ReactNode;
};

export default function PrintKop({
  nama,
  alamat,
  kontak,
  logo,
  kanan,
}: PrintKopProps) {
  return (
    <div className="flex justify-between items-start border-b-2 border-[#1a1a1a] pb-4">
      <div className="flex items-start gap-4 min-w-0">
        {logo && (
          /* Sengaja <img> biasa, bukan next/image: isinya data URI yang
             tidak ada yang bisa dioptimalkan, dan halaman cetak harus
             utuh sekali render supaya dialog Print tidak keburu terbuka
             sebelum gambarnya datang. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt=""
            className="h-[16mm] w-auto max-w-[38mm] object-contain shrink-0"
          />
        )}
        <div className="min-w-0">
          <div className="font-display text-[22px] font-bold leading-tight">
            {nama}
          </div>
          {alamat && (
            <div className="text-[11.5px] text-neutral-600 mt-1 max-w-[90mm] whitespace-pre-line">
              {alamat}
            </div>
          )}
          {kontak && (
            <div className="text-[11px] text-neutral-600 mt-0.5">{kontak}</div>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">{kanan}</div>
    </div>
  );
}
