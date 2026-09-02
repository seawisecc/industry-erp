/* ============================================================
   Logo perusahaan: pengecilan & penyandian di sisi klien.

   Berkas ini bersih dari import server (lihat bab "Batas server/klien
   di lib/" pada CLAUDE.md), karena yang memakainya form pengaturan
   yang "use client".

   Logonya disimpan sebagai data URI di satu kolom teks, jadi ukuran
   berkas adalah urusan yang harus diselesaikan SEBELUM dikirim, bukan
   sesudah. Yang dilakukan di sini: gambar apa pun yang bisa dibaca
   browser dikecilkan sampai sisi terpanjangnya LOGO_MAX_PX, lalu
   disandikan ulang sampai muat di LOGO_MAX_BYTES.

   Kenapa 400 px: logo tercetak setinggi 16 mm. Pada 300 dpi itu cuma
   sekitar 190 px, jadi 400 px sudah lebih dari cukup untuk tetap tajam
   di kertas sekaligus tidak membuat barisnya membengkak.
   ============================================================ */

/** Sisi terpanjang gambar yang disimpan. */
export const LOGO_MAX_PX = 400;

/** Batas ukuran hasil akhir. Server menolak yang lebih besar. */
export const LOGO_MAX_BYTES = 200 * 1024;

/** Batas berkas yang boleh dipilih, sebelum dikecilkan. */
export const LOGO_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type HasilLogo = {
  dataUrl: string;
  bytes: number;
  lebar: number;
  tinggi: number;
  /** true kalau transparansinya terpaksa diratakan ke putih. */
  diratakan: boolean;
};

/** Perkiraan ukuran byte dari panjang base64-nya. */
export function bytesDataUrl(dataUrl: string): number {
  const koma = dataUrl.indexOf(",");
  if (koma < 0) return 0;
  const b64 = dataUrl.slice(koma + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function muatGambar(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // SVG tanpa width/height intrinsik terbaca 0 dan tidak bisa
      // digambar ke canvas. Ditolak di sini supaya pesannya jelas,
      // bukan menghasilkan kotak kosong di kop dokumen.
      if (!img.naturalWidth || !img.naturalHeight) {
        reject(
          new Error(
            "Ukuran gambar tidak terbaca. Kalau logonya SVG, ekspor dulu jadi PNG."
          )
        );
        return;
      }
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Berkas ini bukan gambar yang bisa dibaca browser."));
    };
    img.src = url;
  });
}

function gambarKeCanvas(img: HTMLImageElement, maxSisi: number) {
  const skala = Math.min(1, maxSisi / Math.max(img.naturalWidth, img.naturalHeight));
  const lebar = Math.max(1, Math.round(img.naturalWidth * skala));
  const tinggi = Math.max(1, Math.round(img.naturalHeight * skala));
  const canvas = document.createElement("canvas");
  canvas.width = lebar;
  canvas.height = tinggi;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser ini tidak bisa memproses gambar.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, lebar, tinggi);
  return { canvas, ctx, lebar, tinggi };
}

/**
 * Baca berkas pilihan user jadi data URI yang siap disimpan.
 *
 * Urutan percobaannya sengaja PNG dulu di beberapa ukuran: logo
 * biasanya bidang warna rata, jadi PNG-nya kecil sekaligus
 * mempertahankan latar transparan. JPEG cuma dipakai sebagai jalan
 * terakhir untuk logo yang isinya foto, dan di situ transparansinya
 * diratakan ke putih, warna kertas.
 */
export async function siapkanLogo(file: File): Promise<HasilLogo> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Pilih berkas gambar (PNG atau JPG).");
  }
  if (file.size > LOGO_MAX_UPLOAD_BYTES) {
    throw new Error(
      `Berkasnya ${formatBytes(file.size)}, terlalu besar untuk diproses. Maksimal ${formatBytes(LOGO_MAX_UPLOAD_BYTES)}.`
    );
  }

  const img = await muatGambar(file);

  for (const sisi of [LOGO_MAX_PX, 320, 256]) {
    const { canvas, lebar, tinggi } = gambarKeCanvas(img, sisi);
    const dataUrl = canvas.toDataURL("image/png");
    const bytes = bytesDataUrl(dataUrl);
    if (bytes <= LOGO_MAX_BYTES) {
      return { dataUrl, bytes, lebar, tinggi, diratakan: false };
    }
  }

  for (const mutu of [0.85, 0.7]) {
    const { canvas, ctx, lebar, tinggi } = gambarKeCanvas(img, LOGO_MAX_PX);
    // JPEG tidak punya alpha. Tanpa alas putih, bagian transparan
    // keluar jadi hitam di kertas.
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, lebar, tinggi);
    const dataUrl = canvas.toDataURL("image/jpeg", mutu);
    const bytes = bytesDataUrl(dataUrl);
    if (bytes <= LOGO_MAX_BYTES) {
      return { dataUrl, bytes, lebar, tinggi, diratakan: true };
    }
  }

  throw new Error(
    "Gambarnya terlalu rumit untuk dikecilkan. Coba logo yang lebih sederhana atau versi PNG-nya."
  );
}

/** Penjaga sisi server: isinya benar data URI gambar dan tidak kebesaran. */
export function validasiLogo(nilai: string): string | null {
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(nilai)) {
    return "Logo harus berupa gambar PNG atau JPG.";
  }
  const bytes = bytesDataUrl(nilai);
  if (bytes > LOGO_MAX_BYTES) {
    return `Logo ${formatBytes(bytes)}, melebihi batas ${formatBytes(LOGO_MAX_BYTES)}.`;
  }
  return null;
}
