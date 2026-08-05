/* ============================================================
   Tabel daftar — satu definisi kolom, dua bentuk tampilan.

   Masalah yang diselesaikan: tabel ERP ini punya 6-9 kolom. Di
   layar sempit ada dua jalan buruk yang sama-sama pernah dipakai
   orang — memaksa semua kolom muat (font mengecil sampai tidak
   terbaca) atau membiarkan scroll horizontal tanpa jangkar
   (user menggeser ke kolom 7, lupa sedang melihat baris siapa).

   Yang dipakai di sini:

   - >= 768px : tabel biasa, KOLOM PERTAMA sticky saat digeser ke
     samping, BARIS JUDUL sticky saat digulung ke bawah. Sejauh apa
     pun perginya, identitas baris dan nama kolom tetap kelihatan.
   - <  768px : tabel dibongkar jadi kartu per baris. Yang tampil
     di muka cuma field penting; sisanya di balik <details> yang
     bisa di-tap. Native <details>, jadi komponen ini tetap server
     component dan tidak menambah JS ke bundle.

   Sumber keduanya satu: array `columns`. Menambah kolom otomatis
   ikut ke kartu, tidak ada dua markup yang harus dijaga sinkron.
   ============================================================ */

import { Fragment, type ReactNode } from "react";

/**
 * Peran kolom. Menentukan posisinya di kartu HP; di tabel desktop
 * semua kolom tampil sama saja sesuai urutan array.
 *
 * - `title`     judul kartu (biasanya nama)
 * - `subtitle`  baris kecil di bawah judul (biasanya kode/nomor)
 * - `badge`     pil status di kanan judul
 * - `primary`   angka penting, tampil sebagai grid fakta di muka kartu
 * - `secondary` default — sembunyi di balik "Detail selengkapnya"
 * - `actions`   grup ikon, pindah ke kaki kartu
 */
export type ColumnRole =
  | "title"
  | "subtitle"
  | "badge"
  | "primary"
  | "secondary"
  | "actions";

export type Column<T> = {
  /** unik dalam satu tabel; dipakai sebagai React key */
  key: string;
  /** judul kolom di <thead>. Kosongkan untuk kolom aksi. */
  header?: ReactNode;
  cell: (row: T) => ReactNode;
  /**
   * Bentuk lain khusus kartu HP. Dipakai kalau versi tabelnya
   * mengandung batasan lebar (truncate/max-w) yang tidak masuk akal
   * di kartu.
   */
  cardCell?: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  role?: ColumnRole;
  /** label di kartu; default memakai `header` */
  cardLabel?: string;
  className?: string;
  headClassName?: string;
};

const ALIGN = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

/**
 * Pengelompokan baris dengan baris pemisah, mis. "Fase A · 3 bahan".
 *
 * Baris TIDAK diurutkan ulang di sini — yang berurutan dengan `key`
 * sama digabung jadi satu kelompok. Urutannya tetap tanggung jawab
 * pemanggil, supaya urutan di layar sama dengan urutan yang dipakai
 * di tempat lain (mis. `lib/formulaOrder.ts`).
 */
export type GroupBy<T> = {
  key: (row: T) => string;
  /** isi baris pemisah; teks polos sudah cukup */
  header: (group: { key: string; rows: T[] }) => ReactNode;
};

type Grup<T> = { key: string; rows: T[] };

function bagiKelompok<T>(rows: T[], groupBy?: GroupBy<T>): Grup<T>[] {
  if (!groupBy) return [{ key: "", rows }];
  const out: Grup<T>[] = [];
  for (const row of rows) {
    const key = groupBy.key(row);
    const last = out[out.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else out.push({ key, rows: [row] });
  }
  return out;
}

export default function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty = "Belum ada data.",
  minWidth = 880,
  rowClassName,
  footer,
  sticky = true,
  stickyHead = true,
  maxHeight = "calc(100dvh - 6rem)",
  expandable = true,
  chrome = "panel",
  onRowClick,
  groupBy,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  /** ditampilkan saat `rows` kosong */
  empty?: ReactNode;
  /** lebar minimum tabel desktop sebelum mulai scroll horizontal */
  minWidth?: number;
  rowClassName?: (row: T) => string;
  /**
   * Baris ringkasan (<tfoot>). Isi sebagai <tr>…</tr> — di HP
   * dirender ulang sebagai kartu ringkasan lewat `footer.card`.
   */
  footer?: { row: ReactNode; card?: ReactNode };
  /** matikan kolom sticky, mis. tabel 3 kolom yang tidak pernah scroll */
  sticky?: boolean;
  /** matikan baris judul sticky */
  stickyHead?: boolean;
  /**
   * Batas tinggi area tabel desktop; nilai CSS apa pun.
   *
   * Ini yang membuat baris judul sticky benar-benar bekerja: `top: 0`
   * berjangkar ke scroll container terdekat, dan pembungkus tabel sudah
   * jadi scroll container gara-gara overflow-x. Tanpa batas tinggi,
   * container itu tidak pernah ter-scroll sendiri sehingga headernya
   * ikut hanyut bersama halaman.
   *
   * `false` mengembalikan tinggi mengikuti isi — header jadi tidak
   * menempel lagi. Pakai untuk tabel pendek yang sudah pasti muat.
   */
  maxHeight?: string | false;
  /**
   * Sembunyikan kolom `secondary` di balik "Detail selengkapnya" (default).
   *
   * Matikan untuk tabel yang selnya berisi INPUT: field yang harus diisi
   * tidak boleh bersembunyi di balik satu tap lagi — user tidak akan tahu
   * ada yang terlewat. Dengan `expandable={false}` semua kolom tampil
   * langsung di kartu.
   */
  expandable?: boolean;
  /**
   * "panel" (default) membungkus tabel dengan panel kaca sendiri.
   * Pakai "bare" kalau tabelnya sudah berada di DALAM panel kaca —
   * kaca di atas kaca membuat tepinya menumpuk dan latarnya keruh.
   */
  chrome?: "panel" | "bare";
  /**
   * Klik di mana saja pada baris/kartu. Hanya boleh diisi dari client
   * component. Kontrol asli (checkbox, input) tetap harus ada — ini
   * cuma memperluas area sentuhnya.
   */
  onRowClick?: (row: T) => void;
  /**
   * Sisipkan baris pemisah di antara kelompok baris yang berurutan.
   * Di HP jadi judul kecil di atas tiap kelompok kartu.
   */
  groupBy?: GroupBy<T>;
}) {
  const kosong = rows.length === 0;
  const kelompok = bagiKelompok(rows, groupBy);

  const titleCol = columns.find((c) => c.role === "title");
  const subtitleCol = columns.find((c) => c.role === "subtitle");
  const badgeCols = columns.filter((c) => c.role === "badge");
  const primaryCols = columns.filter((c) => c.role === "primary");
  const actionCol = columns.find((c) => c.role === "actions");
  const restCols = columns.filter(
    (c) => c.role === undefined || c.role === "secondary"
  );
  // Tanpa mode expand, kolom sekunder ikut berdiri sejajar dengan primary
  const factCols = expandable ? primaryCols : [...primaryCols, ...restCols];
  const secondaryCols = expandable ? restCols : [];

  const cardOf = (col: Column<T>, row: T) => (col.cardCell ?? col.cell)(row);

  return (
    <>
      {/* ---------- Tabel: tablet & desktop ---------- */}
      <div
        className={`dt-table hidden md:block overflow-auto ${
          chrome === "panel" ? "glass rounded-2xl" : ""
        }`}
        style={maxHeight === false ? undefined : { maxHeight }}
      >
        <table className="w-full text-[13.5px]" style={{ minWidth }}>
          <thead>
            {/* Tanpa border-b: garisnya digambar sebagai inset shadow di
                .sticky-head supaya ikut menempel waktu header digeser. */}
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide">
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  className={[
                    "px-4 py-2.5 font-semibold whitespace-nowrap",
                    ALIGN[c.align ?? "left"],
                    stickyHead ? "sticky-head" : "border-b border-line",
                    sticky && i === 0 ? "sticky-col sticky-col-head" : "",
                    c.headClassName ?? "",
                  ].join(" ")}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kosong ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-center text-muted py-10 text-sm"
                >
                  {empty}
                </td>
              </tr>
            ) : (
              kelompok.map((g, gi) => {
                // Nomor baris global, supaya rowKey tetap menerima index
                // yang sama seperti tanpa pengelompokan.
                const offset = kelompok
                  .slice(0, gi)
                  .reduce((s, x) => s + x.rows.length, 0);
                return (
                  <Fragment key={`g-${gi}-${g.key}`}>
                    {groupBy && (
                      <tr className="border-b border-line">
                        <td
                          colSpan={columns.length}
                          className="px-4 py-1.5 bg-botanical-100/50 text-[11.5px] font-semibold uppercase tracking-wide text-botanical-700"
                        >
                          {/* Menempel di tepi kiri supaya labelnya tetap
                              terbaca waktu tabel digeser ke samping. */}
                          <span className="sticky left-4 inline-block">
                            {groupBy.header(g)}
                          </span>
                        </td>
                      </tr>
                    )}
                    {g.rows.map((row, i) => {
                      const idx = offset + i;
                      return (
                        <tr
                          key={rowKey(row, idx)}
                          onClick={onRowClick ? () => onRowClick(row) : undefined}
                          className={[
                            "group/row border-b border-line last:border-0 hover:bg-white/40 transition-colors",
                            onRowClick ? "cursor-pointer" : "",
                            rowClassName?.(row) ?? "",
                          ].join(" ")}
                        >
                          {columns.map((c, ci) => (
                            <td
                              key={c.key}
                              className={[
                                "px-4 py-3",
                                ALIGN[c.align ?? "left"],
                                sticky && ci === 0 ? "sticky-col" : "",
                                c.className ?? "",
                              ].join(" ")}
                            >
                              {c.cell(row)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })
            )}
          </tbody>
          {footer && !kosong && (
            <tfoot className="dt-foot">{footer.row}</tfoot>
          )}
        </table>
      </div>

      {/* ---------- Kartu: HP ---------- */}
      <div className="dt-cards md:hidden flex flex-col gap-2">
        {kosong ? (
          <div
            className={`text-center text-muted py-10 text-sm px-4 ${
              chrome === "panel" ? "glass rounded-2xl" : ""
            }`}
          >
            {empty}
          </div>
        ) : (
          kelompok.map((g, gi) => {
            const offset = kelompok
              .slice(0, gi)
              .reduce((s, x) => s + x.rows.length, 0);
            return (
              <Fragment key={`g-${gi}-${g.key}`}>
                {groupBy && (
                  <div className="text-[11.5px] font-semibold uppercase tracking-wide text-botanical-700 px-1 pt-2 first:pt-0">
                    {groupBy.header(g)}
                  </div>
                )}
                {g.rows.map((row, i) => {
                  const idx = offset + i;
                  return (
                    <article
                      key={rowKey(row, idx)}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={[
                        "px-3.5 py-3",
                        chrome === "panel"
                          ? "glass rounded-2xl"
                          : "border border-line rounded-xl bg-white/40",
                        onRowClick ? "cursor-pointer" : "",
                        rowClassName?.(row) ?? "",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {titleCol && (
                            <div className="font-medium text-[14px] text-ink leading-snug">
                              {cardOf(titleCol, row)}
                            </div>
                          )}
                          {subtitleCol && (
                            <div className="text-[12px] text-muted mt-0.5">
                              {cardOf(subtitleCol, row)}
                            </div>
                          )}
                        </div>
                        {badgeCols.length > 0 && (
                          <div className="flex flex-wrap justify-end gap-1 shrink-0">
                            {badgeCols.map((c) => (
                              <span key={c.key}>{cardOf(c, row)}</span>
                            ))}
                          </div>
                        )}
                      </div>
        
                      {factCols.length > 0 && (
                        <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                          {factCols.map((c) => (
                            <div key={c.key} className="min-w-0">
                              <dt className="text-[10.5px] uppercase tracking-wide text-muted">
                                {c.cardLabel ?? c.header}
                              </dt>
                              <dd className="text-[13px] text-ink mt-px">
                                {cardOf(c, row)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
        
                      {secondaryCols.length > 0 && (
                        <details className="mt-2 group/det">
                          <summary className="list-none cursor-pointer select-none inline-flex items-center gap-1 text-[12px] font-medium text-botanical-700 py-1">
                            <span
                              aria-hidden="true"
                              className="transition-transform group-open/det:rotate-90"
                            >
                              ▸
                            </span>
                            Detail selengkapnya
                          </summary>
                          <dl className="mt-1.5 flex flex-col gap-1.5 border-t border-line pt-2">
                            {secondaryCols.map((c) => (
                              <div
                                key={c.key}
                                className="flex items-baseline justify-between gap-3"
                              >
                                <dt className="text-[11.5px] text-muted shrink-0">
                                  {c.cardLabel ?? c.header}
                                </dt>
                                <dd className="text-[12.5px] text-ink text-right min-w-0">
                                  {cardOf(c, row)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      )}
        
                      {actionCol && (
                        <div className="mt-1.5 pt-1.5 border-t border-line flex justify-end">
                          {cardOf(actionCol, row)}
                        </div>
                      )}
                    </article>
                  );
                })}
              </Fragment>
            );
          })
        )}
      </div>

      {footer?.card && !kosong && (
        <div
          className={`dt-cards px-3.5 py-3 mt-2 ${
            chrome === "panel"
              ? "glass rounded-2xl"
              : "border border-line rounded-xl bg-white/40"
          }`}
        >
          {footer.card}
        </div>
      )}
    </>
  );
}
