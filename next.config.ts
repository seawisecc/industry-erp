import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Cache halaman di sisi browser selama 30 detik, jadi pindah
    // bolak-balik antar menu terasa instan (SPA-like). Data di-refresh
    // otomatis setelah ada mutasi (router.refresh) atau lewat 30 detik.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },

  async headers() {
    return [
      {
        // Service worker tidak boleh ikut di-cache lama. Browser memang
        // memeriksa ulang /sw.js paling lambat tiap 24 jam, tapi tanpa
        // header ini perbaikan di sw.js bisa tertahan sehari penuh di
        // perangkat yang sudah memasang aplikasinya.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
