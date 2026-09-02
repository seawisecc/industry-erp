"use client";

import { useMemo, useState } from "react";
import { Search, Store, X } from "lucide-react";
import OutletActions, { type OutletProdItem } from "./OutletActions";
import type { TaxSettings } from "@/lib/invoiceMath";

/* ============================================================
   Rekap stok per outlet, dengan pencarian.

   Penyaringannya di KLIEN, bukan lewat parameter URL seperti tabel
   pengiriman di bawahnya. Dua alasan:

   - Seluruh konsinyasi yang masih aktif memang sudah dibaca untuk
     menghitung rekap ini, jadi menyaring di server berarti satu
     perjalanan bolak-balik untuk data yang sudah ada di tangan.
   - Halaman ini punya kotak cari kedua (TableToolbar) yang memiliki
     `?q=`. Memakai parameter yang sama akan membuat satu ketikan
     menyaring dua daftar sekaligus, dan pemakainya tidak akan pernah
     bisa menebak yang mana yang sedang dicari.

   Karena itu pula lencana `/` tidak dipasang di sini: shortcut itu
   milik kotak cari halaman, dan dua kotak yang mengaku punya tombol
   yang sama lebih buruk daripada satu kotak tanpa shortcut.
   ============================================================ */

export type OutletRingkas = {
  clientId: string;
  client: string;
  pengiriman: number;
  totalSisa: number;
  produk: OutletProdItem[];
};

export default function OutletRekap({
  outlets,
  taxSettings,
}: {
  outlets: OutletRingkas[];
  taxSettings: TaxSettings;
}) {
  const [q, setQ] = useState("");

  const cocok = useMemo(() => {
    const cari = q.trim().toLowerCase();
    if (!cari) return outlets;
    return outlets.filter((o) => {
      if (o.client.toLowerCase().includes(cari)) return true;
      // Ikut mencocokkan isi titipannya: orang sering ingat produknya
      // lebih dulu daripada nama outletnya.
      return o.produk.some((p) =>
        [p.nama, p.brand, p.varian]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(cari)
      );
    });
  }, [outlets, q]);

  return (
    <>
      <div className="flex items-end justify-between gap-3 flex-wrap mt-5 mb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg p-1.5 bg-botanical-100 text-botanical-700">
            <Store size={16} />
          </div>
          <div>
            <h3 className="font-display text-[15px] font-semibold text-ink">
              Stok per Outlet
            </h3>
            <p className="text-muted text-[11.5px]">
              {q.trim()
                ? `${cocok.length} dari ${outlets.length} outlet`
                : `${outlets.length} outlet punya barang di lokasi, catat laku/retur langsung dari sini.`}
            </p>
          </div>
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              // Esc: bersihkan dulu, tekan sekali lagi untuk melepas fokus.
              if (e.key !== "Escape") return;
              e.preventDefault();
              if (q) setQ("");
              else e.currentTarget.blur();
            }}
            placeholder="Cari outlet atau produk..."
            aria-label="Cari outlet konsinyasi"
            className="w-full h-[42px] glass-input rounded-lg pl-9 pr-8 text-[13px] focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-1"
              title="Bersihkan"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {cocok.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center">
          <p className="text-muted text-[13px]">
            Tidak ada outlet yang cocok dengan &ldquo;{q.trim()}&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => setQ("")}
            className="text-botanical-700 text-[12.5px] font-medium hover:underline mt-1"
          >
            Tampilkan semua outlet
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {cocok.map((o) => (
            <div key={o.clientId} className="glass rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="font-semibold text-ink truncate" title={o.client}>
                    {o.client}
                  </div>
                  <div className="text-[11.5px] text-muted">
                    {o.pengiriman} pengiriman aktif
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-display text-[22px] font-semibold text-botanical-700 leading-none">
                    {o.totalSisa.toLocaleString("id-ID")}
                  </div>
                  <div className="text-[10.5px] uppercase tracking-wide text-muted">
                    total pcs di lokasi
                  </div>
                </div>
              </div>

              <div className="border-t border-line pt-2 flex flex-col gap-1">
                {o.produk.map((p) => (
                  <div
                    key={`${p.product_id}|${p.varian}`}
                    className="flex items-center justify-between text-[12.5px] py-0.5"
                  >
                    <span className="truncate pr-3">
                      {p.nama}
                      {p.varian !== "-" && (
                        <span className="text-muted"> · {p.varian}</span>
                      )}
                    </span>
                    <span className="font-medium whitespace-nowrap">
                      {p.sisa.toLocaleString("id-ID")} pcs
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-line mt-3 pt-3">
                <OutletActions
                  clientId={o.clientId}
                  clientName={o.client}
                  produk={o.produk}
                  taxSettings={taxSettings}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
