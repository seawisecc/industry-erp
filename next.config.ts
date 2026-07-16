import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Cache halaman di sisi browser selama 30 detik — pindah bolak-balik
    // antar menu terasa instan (SPA-like). Data di-refresh otomatis setelah
    // ada mutasi (router.refresh) atau lewat 30 detik.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
