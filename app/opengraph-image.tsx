import { ImageResponse } from "next/og";

/* ============================================================
   Gambar link preview (og:image) 1200×630 — dirender otomatis
   oleh Next saat link aplikasi dibagikan (WA, Telegram, dsb).
   ============================================================ */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Seawise Enterprise Apps — Industry Edition";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 90px",
          backgroundColor: "#16261D",
          backgroundImage:
            "radial-gradient(700px 400px at 90% 0%, rgba(193,98,61,0.35) 0%, rgba(193,98,61,0) 60%), radial-gradient(600px 400px at 0% 100%, rgba(47,77,58,0.6) 0%, rgba(47,77,58,0) 55%)",
          color: "#FAF7F1",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg
            width="72"
            height="72"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="32" height="32" rx="7" fill="#2F4D3A" />
            <g transform="translate(3.52 3.52) scale(0.78)">
              <path
                d="M13 4h6v6.5l5.5 12c1 2.2-.6 4.5-3 4.5H10.5c-2.4 0-4-2.3-3-4.5l5.5-12V4z"
                stroke="#FAF7F1"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M11.5 5.5h9"
                stroke="#FAF7F1"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path
                d="M19 7c2.2-1.6 4.6-1 5.6.6.9 1.5.3 3.6-1.6 4.4-2.2.9-4.6-.6-5-2.4"
                stroke="#C1623D"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>
              Seawise Enterprise Apps
            </div>
            <div
              style={{
                fontSize: 19,
                color: "#D9A441",
                textTransform: "uppercase",
                letterSpacing: 4,
              }}
            >
              Industry Edition
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: 62,
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: -1.5,
            marginTop: 70,
            maxWidth: 950,
          }}
        >
          ERP manufaktur kosmetik yang siap audit CPKB.
        </div>

        <div
          style={{
            fontSize: 26,
            color: "rgba(250,247,241,0.65)",
            marginTop: 28,
            maxWidth: 900,
            lineHeight: 1.5,
          }}
        >
          Pembelian → stok FEFO → produksi & HPP real → QC/QA → penjualan.
          Satu sistem, jejak dokumen lengkap.
        </div>

        <div style={{ display: "flex", gap: 14, marginTop: 56 }}>
          {["FEFO & Expiry", "HPP per Batch", "MES", "QC · QA", "CoA"].map(
            (t) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  fontSize: 20,
                  padding: "10px 22px",
                  borderRadius: 999,
                  border: "1.5px solid rgba(250,247,241,0.25)",
                  color: "rgba(250,247,241,0.85)",
                }}
              >
                {t}
              </div>
            )
          )}
        </div>
      </div>
    ),
    size
  );
}
