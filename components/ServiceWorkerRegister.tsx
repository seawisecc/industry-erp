"use client";

import { useEffect } from "react";

/**
 * Mendaftarkan /sw.js. Tanpa service worker yang punya handler `fetch`,
 * Chrome tidak pernah menawarkan "Install" walau manifest-nya sudah benar.
 *
 * Di dev justru sebaliknya: service worker yang tertinggal dari `npm start`
 * di localhost akan menyajikan chunk lama ke `npm run dev` di port yang sama,
 * dan gejalanya menyesatkan (perubahan kode seperti tidak berpengaruh).
 * Karena itu di dev yang dilakukan bukan mendaftar, tapi mencabut.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((daftar) => daftar.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Gagal daftar cuma berarti aplikasi tidak bisa dipasang.
      // Semua fitur lain jalan seperti biasa, jadi jangan ganggu user.
    });
  }, []);

  return null;
}
