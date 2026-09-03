"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import OrgSwitcher from "./OrgSwitcher";
import SignOutButton from "./SignOutButton";
import InstallAppButton from "./InstallAppButton";
import { Menu, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { canAccessModule } from "@/lib/modules";
import { NAV, NAV_GRUP, HUBS } from "@/lib/navConfig";
import { SIDEBAR_KEY_LAMA, tulisRail } from "@/lib/sidebarPref";

type OrgOption = { id: string; nama: string; slug: string; aktif: boolean };

/* ------------------------------------------------------------
   Dua lebar, dua sebab yang berbeda.

   `rail` adalah PREFERENSI user, datang dari cookie lewat server
   (lihat lib/sidebarPref.ts), jadi HTML pertama sudah selebar yang
   benar dan sidebar tidak lagi berkedip di tiap muat halaman.

   `dijelajah` adalah keadaan SEMENTARA: kursor sedang di atas
   sidebar, atau fokus keyboard sedang di dalamnya. Saat itu rail
   melebar MENUMPUK di atas konten, bukan mendorongnya. Yang menahan
   lebar di alur layout adalah div pengganjal terpisah, dan lebarnya
   tidak ikut berubah saat dijelajah. Itu inti polanya: halaman kerja
   tidak pernah bergeser cuma karena kursor lewat.

   Fokus keyboard ikut melebarkan, bukan cuma hover. Tanpa itu orang
   yang menekan Tab masuk ke sidebar berpindah antar ikon tanpa tahu
   dia sedang menyorot menu apa.
   ------------------------------------------------------------ */

const LEBAR_RAIL = 68;
const LEBAR_PENUH = 230;

export default function SidebarNav({
  profileNama,
  isSuperAdmin,
  role,
  allowedModules,
  organizations,
  currentOrgId,
  currentOrgNama,
  railAwal,
}: {
  profileNama: string;
  isSuperAdmin: boolean;
  role: string;
  allowedModules: string[] | null;
  organizations: OrgOption[];
  currentOrgId: string;
  currentOrgNama: string;
  railAwal: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // drawer HP
  const [rail, setRail] = useState(railAwal);
  const [dijelajah, setDijelajah] = useState(false);

  /* Sapu preferensi versi localStorage sekali, lalu lupakan kuncinya.
     Sengaja TIDAK ikut mengubah tampilan saat ini: mengubah state di
     dalam effect melanggar react-hooks/set-state-in-effect dan
     menambah satu render sesudah layar terlanjur dilukis. Cukup
     tulis cookie-nya, muat halaman berikutnya sudah benar dari
     server. Yang dikorbankan cuma satu kali muat, sekali seumur
     akun. */
  useEffect(() => {
    try {
      const lama = localStorage.getItem(SIDEBAR_KEY_LAMA);
      if (lama === null) return;
      localStorage.removeItem(SIDEBAR_KEY_LAMA);
      if (lama === "1" && !document.cookie.includes("sidebar-rail=")) {
        tulisRail(true);
      }
    } catch {
      // mode privasi, tidak ada yang perlu disapu
    }
  }, []);

  function toggleRail() {
    const baru = !rail;
    setRail(baru);
    setDijelajah(false);
    tulisRail(baru);
  }

  // Tutup drawer tiap pindah halaman.
  //
  // Dibandingkan saat render, bukan lewat useEffect. Effect berjalan
  // sesudah browser melukis, jadi halaman baru sempat tampil dengan
  // drawer masih menutupi layar sebelum ia menghilang.
  const [pathTerakhir, setPathTerakhir] = useState(pathname);
  if (pathTerakhir !== pathname) {
    setPathTerakhir(pathname);
    setOpen(false);
    setDijelajah(false);
  }

  const access = { isSuperAdmin, role, allowedModules };
  const visibleNav = NAV.filter((item) => {
    // Menu hub tampil kalau user punya akses ke salah satu bagiannya
    const pages = HUBS[item.href];
    if (pages) return pages.some((p) => canAccessModule(access, p.slice(1)));
    return canAccessModule(access, item.href.slice(1));
  });

  // Grup yang seluruh menunya tidak boleh diakses tidak ikut dirender,
  // supaya tidak ada judul grup yang menggantung tanpa isi.
  const grupTampil = NAV_GRUP.map((grup) => ({
    grup,
    items: visibleNav.filter((i) => i.grup === grup),
  })).filter((g) => g.items.length > 0);

  function isActive(href: string) {
    const pages = HUBS[href];
    if (pages) return pages.some((p) => pathname?.startsWith(p));
    return pathname?.startsWith(href);
  }

  /** Sedang menampilkan label? Di HP drawer selalu penuh. */
  const luas = !rail || dijelajah;

  return (
    <>
      {/* ===== Top bar (HP saja) ===== */}
      <div className="sm:hidden fixed top-0 inset-x-0 z-40 glass-dark text-white flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen(true)} className="p-1 -ml-1" aria-label="Buka menu">
          <Menu size={22} />
        </button>
        <Logo size={22} />
        <div className="leading-tight">
          <div className="font-display font-semibold text-[13.5px]">
            Industry Management
          </div>
          <div className="text-[10px] text-white/50">{currentOrgNama}</div>
        </div>
      </div>

      {/* ===== Backdrop (HP saat drawer terbuka) ===== */}
      {open && (
        <div
          className="sm:hidden fixed inset-0 bg-black/45 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ===== Pengganjal lebar (desktop) =====
          Ini yang menahan tempat sidebar di alur layout. Lebarnya cuma
          mengikuti PREFERENSI, tidak ikut melebar saat sidebar dijelajah,
          jadi konten tidak pernah bergeser waktu kursor lewat. */}
      <div
        aria-hidden
        className="hidden sm:block shrink-0 transition-[width] duration-300 ease-out"
        style={{ width: rail ? LEBAR_RAIL : LEBAR_PENUH }}
      />

      {/* ===== Sidebar / Drawer ===== */}
      <aside
        onMouseEnter={() => rail && setDijelajah(true)}
        onMouseLeave={() => setDijelajah(false)}
        onFocusCapture={() => rail && setDijelajah(true)}
        onBlurCapture={(e) => {
          // Fokus pindah ke luar sidebar, bukan sekadar antar tombol
          // di dalamnya.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDijelajah(false);
          }
        }}
        data-overlay={rail && dijelajah ? "1" : undefined}
        className={`sidebar-panel fixed inset-y-0 left-0 z-50 glass-dark text-white/80 flex flex-col h-screen overflow-y-auto overflow-x-hidden transform transition-all duration-300 ease-out w-[250px] p-4 ${
          open ? "translate-x-0" : "-translate-x-full"
        } sm:translate-x-0 ${
          rail
            ? dijelajah
              ? "sm:shadow-2xl sm:shadow-black/40 sm:px-3"
              : "sm:px-2"
            : ""
        }`}
        /* Lebar desktop dikirim sebagai custom property, media query-nya
           ada di globals.css (.sidebar-panel). Inline style biasa akan
           berlaku juga di HP dan merusak lebar drawer. */
        style={{ "--sb-w": `${luas ? LEBAR_PENUH : LEBAR_RAIL}px` } as React.CSSProperties}
      >
        {/* Header */}
        <div
          className={`flex items-center gap-2.5 px-2 pb-4 pt-1 ${
            luas ? "" : "sm:px-0 sm:justify-center"
          }`}
        >
          <Logo size={28} />
          <div className={`flex-1 ${luas ? "" : "sm:hidden"}`}>
            <div className="font-display font-semibold text-[15px] text-white leading-tight">
              Industry Management
            </div>
            <div className="text-[11px] text-white/50 tracking-wide">
              by Seawise Studio
            </div>
          </div>
          {/* Tombol sematkan / lepaskan (desktop). Hanya muncul saat label
              terbaca, supaya rail yang sedang diam tetap bersih ikon. */}
          <button
            onClick={toggleRail}
            title={rail ? "Sematkan sidebar" : "Ciutkan jadi rail ikon"}
            aria-label={rail ? "Sematkan sidebar" : "Ciutkan jadi rail ikon"}
            className={`hidden text-white/50 hover:text-white p-1 transition-colors ${
              luas ? "sm:block" : ""
            }`}
          >
            {rail ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          {/* Tombol tutup drawer (HP) */}
          <button
            onClick={() => setOpen(false)}
            className="sm:hidden text-white/60 hover:text-white p-1"
            aria-label="Tutup menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Alasan yang sama dengan judul grup: disembunyikan lewat CSS
            supaya super admin tetap bisa ganti company dari drawer HP. */}
        {isSuperAdmin && (
          <div className={luas ? "" : "sm:hidden"}>
            <OrgSwitcher organizations={organizations} currentOrgId={currentOrgId} />
          </div>
        )}

        <nav className="flex flex-col flex-1 gap-0.5">
          {grupTampil.map(({ grup, items }, i) => (
            <div key={grup} className="flex flex-col gap-0.5">
              {/* Judul grup disembunyikan lewat CSS, BUKAN dengan tidak
                  merendernya. Drawer HP selalu selebar 250px, jadi
                  judulnya harus tetap terbaca di sana walau preferensi
                  desktop orang itu rail. Menyembunyikannya di JS ikut
                  menghapusnya di HP, dan kelompoknya jadi tidak berjudul
                  di layar yang justru paling butuh penanda. */}
              <div
                className={`text-[10px] uppercase tracking-[0.12em] text-white/35 px-3 pb-1 ${
                  i === 0 ? "pt-1" : "pt-4"
                } ${luas ? "" : "sm:hidden"}`}
              >
                {grup}
              </div>
              {/* Pengganti judul saat rail diam: kelompoknya tetap
                  kelihatan tanpa memaksa teks ke lebar 68px. */}
              {!luas && i > 0 && (
                <div className="hidden sm:block h-px bg-white/10 mx-2 my-2" />
              )}

              {items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-label={item.label}
                    className={`flex items-center gap-2.5 py-2.5 rounded-lg text-[13.5px] font-medium transition-all ${
                      luas ? "px-3" : "sm:justify-center sm:px-0 px-3"
                    } ${
                      active
                        ? "bg-white/15 text-white shadow-sm border border-white/10"
                        : "text-white/65 hover:bg-white/8 hover:text-white border border-transparent"
                    }`}
                  >
                    <Icon size={17} strokeWidth={2} className="shrink-0" />
                    <span className={`truncate ${luas ? "" : "sm:hidden"}`}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div
          className={`border-t border-white/10 pt-3 mt-2 ${
            luas ? "px-2" : "sm:px-0 px-2"
          }`}
        >
          <div className={luas ? "" : "sm:hidden"}>
            <div className="text-[13px] font-medium text-white truncate">
              {currentOrgNama}
            </div>
            <div className="text-[11px] text-white/45 truncate">{profileNama}</div>
            {/* Tombol pasang duduk di kanan Keluar, dan tidak merender
                apa pun kalau browsernya memang tidak bisa memasang. */}
            <div className="flex items-center gap-2">
              <SignOutButton />
              <div className="mt-2">
                <InstallAppButton />
              </div>
            </div>
          </div>
          {!luas && (
            <div className="hidden sm:flex flex-col items-center gap-1">
              <SignOutButton variant="icon" />
              <InstallAppButton />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

