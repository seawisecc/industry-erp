import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import StatCard from "@/components/StatCard";
import Link from "next/link";
import {
  Wallet,
  AlertTriangle,
  CalendarClock,
  ShoppingCart,
  ReceiptText,
  AlarmClock,
  HandCoins,
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
} from "lucide-react";
import BarChart, { BarGroup } from "@/components/charts/BarChart";
import { localDateStr, localMonthKey, addDaysStr } from "@/lib/dates";
import HBarList from "@/components/charts/HBarList";
import type { ExecutionData } from "@/app/(app)/production/actions";

function formatRupiah(n: number) {
  if (n >= 1_000_000_000)
    return "Rp " + (n / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " M";
  if (n >= 1_000_000)
    return "Rp " + (n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { profile, organizationId } = await getEffectiveOrg();

  const today = new Date();
  const todayStr = localDateStr(today);
  const in60 = addDaysStr(todayStr, 60);
  const monthStart = `${todayStr.slice(0, 7)}-01`;
  const monthLabel = today.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });

  // Awal periode 6 bulan terakhir (termasuk bulan berjalan) — tanggal LOKAL
  const sixMonthsAgo = `${localMonthKey(
    new Date(today.getFullYear(), today.getMonth() - 5, 1)
  )}-01`;

  const [
    batchesRes,
    itemsRes,
    receivingsRes,
    hutangRes,
    salesRes,
    purchase6Res,
    yieldRes,
    topRes,
    arRes,
    paysRes,
    cashOutRes,
  ] = await Promise.all([
    supabase
      .from("purchase_batches")
      .select("qty_sisa, harga_per_unit, exp_date")
      .eq("organization_id", organizationId)
      .gt("qty_sisa", 0),
    supabase
      .from("items")
      .select("id, stok_minimum, aktif, purchase_batches(qty_sisa)")
      .eq("organization_id", organizationId),
    supabase
      .from("receivings")
      .select("total_invoice")
      .eq("organization_id", organizationId)
      .gte("tanggal_terima", monthStart),
    supabase
      .from("receivings")
      .select("total_invoice, jatuh_tempo")
      .eq("organization_id", organizationId)
      .eq("status_bayar", "Belum Lunas"),
    supabase
      .from("sales_invoices")
      .select("tanggal, total")
      .eq("organization_id", organizationId)
      .gte("tanggal", sixMonthsAgo),
    supabase
      .from("receivings")
      .select("tanggal_terima, total_invoice")
      .eq("organization_id", organizationId)
      .gte("tanggal_terima", sixMonthsAgo),
    supabase
      .from("production_plans")
      .select(
        "no_batch, execution_data, production_batches(production_outputs(qty_hasil))"
      )
      .eq("organization_id", organizationId)
      .eq("status", "Selesai")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("sales_invoice_items")
      .select("qty, products(nama_produk)")
      .eq("organization_id", organizationId),
    // Piutang: invoice penjualan belum lunas
    supabase
      .from("sales_invoices")
      .select("id, total, jatuh_tempo, tanggal, nama_pembeli, clients(company_brand)")
      .eq("organization_id", organizationId)
      .eq("status_bayar", "Belum Lunas"),
    // Pembayaran penjualan (untuk hitung deposit & kas masuk bulan ini)
    supabase
      .from("sales_payments")
      .select("invoice_id, jumlah, tanggal")
      .eq("organization_id", organizationId),
    // Kas keluar bulan ini: pembelian yang dibayar bulan ini
    supabase
      .from("receivings")
      .select("total_invoice, tanggal_bayar")
      .eq("organization_id", organizationId)
      .eq("status_bayar", "Lunas")
      .gte("tanggal_bayar", monthStart),
  ]);

  const batches = (batchesRes.data || []) as {
    qty_sisa: number;
    harga_per_unit: number;
    exp_date: string | null;
  }[];
  const items = (itemsRes.data || []) as unknown as {
    id: string;
    stok_minimum: number;
    aktif: boolean;
    purchase_batches: { qty_sisa: number }[];
  }[];
  const receivings = (receivingsRes.data || []) as { total_invoice: number }[];

  // 1. Nilai stok saat ini
  const nilaiStok = batches.reduce(
    (s, b) => s + Number(b.qty_sisa) * Number(b.harga_per_unit),
    0
  );

  // 2. Item dengan stok di bawah / sama dengan stok minimum
  const stokRendah = items.filter((it) => {
    const sisa = it.purchase_batches.reduce((s, b) => s + Number(b.qty_sisa), 0);
    return sisa <= Number(it.stok_minimum);
  }).length;

  // 3. Batch yang expired dalam 60 hari ke depan (termasuk yang sudah lewat)
  const expiring = batches.filter(
    (b) => b.exp_date && b.exp_date <= in60
  ).length;

  // 4. Total pembelian bulan berjalan
  const pembelianBulanIni = receivings.reduce(
    (s, r) => s + Number(r.total_invoice),
    0
  );

  // 5. Hutang belum lunas + yang lewat jatuh tempo
  const hutang = (hutangRes.data || []) as {
    total_invoice: number;
    jatuh_tempo: string | null;
  }[];
  const totalHutang = hutang.reduce((s, h) => s + Number(h.total_invoice), 0);
  const fakturTerlambat = hutang.filter(
    (h) => h.jatuh_tempo !== null && h.jatuh_tempo < todayStr
  ).length;

  // ===== 6. Grafik: pembelian vs penjualan per bulan (6 bulan) =====
  const monthKeys: string[] = [];
  const monthLabels: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    monthKeys.push(localMonthKey(d));
    monthLabels.push(d.toLocaleDateString("id-ID", { month: "short" }));
  }
  const salesByMonth = new Map<string, number>();
  for (const s of (salesRes.data || []) as { tanggal: string; total: number }[]) {
    const key = s.tanggal.slice(0, 7);
    salesByMonth.set(key, (salesByMonth.get(key) || 0) + Number(s.total));
  }
  const purchaseByMonth = new Map<string, number>();
  for (const p of (purchase6Res.data || []) as {
    tanggal_terima: string;
    total_invoice: number;
  }[]) {
    const key = p.tanggal_terima.slice(0, 7);
    purchaseByMonth.set(key, (purchaseByMonth.get(key) || 0) + Number(p.total_invoice));
  }
  const formatJt = (n: number) =>
    n >= 1_000_000
      ? (n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt"
      : n >= 1000
        ? (n / 1000).toLocaleString("id-ID", { maximumFractionDigits: 0 }) + " rb"
        : String(Math.round(n));
  const vsGroups: BarGroup[] = monthKeys.map((key, i) => ({
    label: monthLabels[i],
    bars: [
      {
        value: purchaseByMonth.get(key) || 0,
        color: "#C1623D",
        title: `Pembelian ${monthLabels[i]}: ${formatRupiah(purchaseByMonth.get(key) || 0)}`,
      },
      {
        value: salesByMonth.get(key) || 0,
        color: "#2F4D3A",
        title: `Penjualan ${monthLabels[i]}: ${formatRupiah(salesByMonth.get(key) || 0)}`,
      },
    ],
  }));

  // ===== 7. Grafik: efisiensi produksi (yield %) =====
  type YieldRow = {
    no_batch: string;
    execution_data: ExecutionData | null;
    production_batches: { production_outputs: { qty_hasil: number }[] } | null;
  };
  const yieldGroups: BarGroup[] = ((yieldRes.data || []) as unknown as YieldRow[])
    .map((p) => {
      const teoritis = (p.execution_data?.variants || []).reduce(
        (s, v) => s + Number(v.rencana_pcs || 0),
        0
      );
      const real = (p.production_batches?.production_outputs || []).reduce(
        (s, o) => s + Number(o.qty_hasil),
        0
      );
      const yieldPct = teoritis > 0 ? (real / teoritis) * 100 : 0;
      return { no_batch: p.no_batch, yieldPct };
    })
    .filter((r) => r.yieldPct > 0)
    .reverse()
    .map((r) => ({
      label: r.no_batch,
      bars: [
        {
          value: Math.round(r.yieldPct * 10) / 10,
          color: r.yieldPct >= 95 ? "#2F4D3A" : "#C1623D",
          title: `${r.no_batch}: yield ${r.yieldPct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`,
        },
      ],
    }));

  // ===== 8. Top 5 produk terjual =====
  const topMap = new Map<string, number>();
  for (const t of (topRes.data || []) as unknown as {
    qty: number;
    products: { nama_produk: string } | null;
  }[]) {
    const nama = t.products?.nama_produk || "—";
    topMap.set(nama, (topMap.get(nama) || 0) + Number(t.qty));
  }
  const topProducts = Array.from(topMap, ([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // ===== 9. Piutang, kas masuk/keluar, notifikasi jatuh tempo =====
  const allPays = (paysRes.data || []) as {
    invoice_id: string;
    jumlah: number;
    tanggal: string;
  }[];
  const dibayarByInv = new Map<string, number>();
  for (const p of allPays) {
    dibayarByInv.set(
      p.invoice_id,
      (dibayarByInv.get(p.invoice_id) || 0) + Number(p.jumlah)
    );
  }

  const arList = ((arRes.data || []) as unknown as {
    id: string;
    total: number;
    jatuh_tempo: string | null;
    tanggal: string;
    nama_pembeli: string | null;
    clients: { company_brand: string } | null;
  }[])
    .map((inv) => ({
      pihak: inv.clients?.company_brand || inv.nama_pembeli || "—",
      jatuh_tempo: inv.jatuh_tempo,
      sisa: Number(inv.total) - (dibayarByInv.get(inv.id) || 0),
    }))
    .filter((r) => r.sisa > 0.5);

  const totalPiutang = arList.reduce((s, r) => s + r.sisa, 0);

  // Notifikasi: piutang yang sudah lewat jatuh tempo (urut paling telat)
  const piutangTelat = arList
    .filter((r) => r.jatuh_tempo !== null && r.jatuh_tempo < todayStr)
    .map((r) => ({
      ...r,
      hari: Math.round(
        (new Date(todayStr).getTime() -
          new Date(r.jatuh_tempo as string).getTime()) /
          86400000
      ),
    }))
    .sort((a, b) => b.hari - a.hari);
  const piutangTelatTop = piutangTelat.slice(0, 5);

  // Kas masuk bulan ini = pembayaran penjualan diterima bulan ini
  const kasMasuk = allPays
    .filter((p) => p.tanggal >= monthStart)
    .reduce((s, p) => s + Number(p.jumlah), 0);
  // Kas keluar bulan ini = pembelian yang dibayar bulan ini
  const kasKeluar = ((cashOutRes.data || []) as { total_invoice: number }[]).reduce(
    (s, r) => s + Number(r.total_invoice),
    0
  );
  const arusBersih = kasMasuk - kasKeluar;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>
      <p className="text-muted text-sm mt-1">
        Halo, <b>{profile?.nama}</b> 👋 — ringkasan gudang, pembelian &amp;
        penjualan
      </p>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          icon={Wallet}
          label="Nilai Stok"
          value={formatRupiah(nilaiStok)}
          sub="Dari semua batch yang masih ada sisa"
          tone="botanical"
        />
        <Link href="/items" className="block">
          <StatCard
            icon={AlertTriangle}
            label="Stok Rendah"
            value={String(stokRendah)}
            sub="Item di bawah stok minimum"
            tone={stokRendah > 0 ? "clay" : "botanical"}
          />
        </Link>
        <Link href="/items/expiry" className="block">
          <StatCard
            icon={CalendarClock}
            label="Expired ≤ 60 Hari"
            value={String(expiring)}
            sub="Klik untuk tindak lanjut: re-test / musnahkan"
            tone={expiring > 0 ? "amber" : "botanical"}
          />
        </Link>
        <Link href="/receivings" className="block">
          <StatCard
            icon={ShoppingCart}
            label="Pembelian Bulan Ini"
            value={formatRupiah(pembelianBulanIni)}
            sub={monthLabel}
            tone="botanical"
          />
        </Link>
        <Link href="/payments" className="block">
          <StatCard
            icon={ReceiptText}
            label="Hutang Belum Lunas"
            value={formatRupiah(totalHutang)}
            sub={`${hutang.length} faktur menunggu pembayaran`}
            tone={totalHutang > 0 ? "amber" : "botanical"}
          />
        </Link>
        <Link href="/payments" className="block">
          <StatCard
            icon={AlarmClock}
            label="Lewat Jatuh Tempo"
            value={String(fakturTerlambat)}
            sub="Faktur yang harus segera dibayar"
            tone={fakturTerlambat > 0 ? "clay" : "botanical"}
          />
        </Link>
      </div>

      {/* ===== KEUANGAN PENJUALAN ===== */}
      <h2 className="font-display text-[15px] font-semibold text-ink mt-6 mb-3">
        Keuangan Penjualan
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Arus kas + piutang */}
        <div className="glass rounded-2xl p-5 flex flex-col">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="rounded-xl p-2 bg-botanical-100 text-botanical-700">
              <Wallet size={17} />
            </div>
            <h3 className="font-display text-[14.5px] font-semibold text-ink">
              Arus Kas — {monthLabel}
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/50 rounded-xl p-3">
              <div className="flex items-center gap-1 text-botanical-700 text-[10.5px] font-medium uppercase tracking-wide">
                <ArrowDownLeft size={13} /> Masuk
              </div>
              <div className="font-display text-[15px] font-semibold text-ink mt-1 leading-tight">
                {formatRupiah(kasMasuk)}
              </div>
            </div>
            <div className="bg-white/50 rounded-xl p-3">
              <div className="flex items-center gap-1 text-clay-600 text-[10.5px] font-medium uppercase tracking-wide">
                <ArrowUpRight size={13} /> Keluar
              </div>
              <div className="font-display text-[15px] font-semibold text-ink mt-1 leading-tight">
                {formatRupiah(kasKeluar)}
              </div>
            </div>
            <div className="bg-white/50 rounded-xl p-3">
              <div className="text-muted text-[10.5px] font-medium uppercase tracking-wide">
                Bersih
              </div>
              <div
                className={`font-display text-[15px] font-semibold mt-1 leading-tight ${
                  arusBersih >= 0 ? "text-botanical-700" : "text-clay-600"
                }`}
              >
                {formatRupiah(arusBersih)}
              </div>
            </div>
          </div>
          <Link
            href="/sales-payments"
            className="mt-auto pt-4 flex items-center justify-between border-t border-line/70 group"
          >
            <span className="flex items-center gap-2 text-[13px] text-muted">
              <HandCoins size={15} className="text-botanical-700" /> Total Piutang
            </span>
            <span className="font-display text-[16px] font-semibold text-ink group-hover:text-botanical-700 transition-colors">
              {formatRupiah(totalPiutang)}
            </span>
          </Link>
        </div>

        {/* Notifikasi piutang jatuh tempo */}
        <div className="glass rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`rounded-xl p-2 ${
                  piutangTelat.length > 0
                    ? "bg-clay-100 text-clay-600"
                    : "bg-botanical-100 text-botanical-700"
                }`}
              >
                <BellRing size={17} />
              </div>
              <h3 className="font-display text-[14.5px] font-semibold text-ink">
                Piutang Jatuh Tempo
              </h3>
            </div>
            <Link
              href="/sales-payments"
              className="text-botanical-700 text-[12px] font-medium hover:underline whitespace-nowrap"
            >
              Lihat semua
            </Link>
          </div>

          {piutangTelatTop.length === 0 ? (
            <p className="text-muted text-[12.5px] py-6 text-center">
              Tidak ada piutang yang lewat jatuh tempo 🎉
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {piutangTelatTop.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 bg-clay-100/40 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-ink truncate">
                      {r.pihak}
                    </div>
                    <div className="text-[11px] text-clay-600 font-medium">
                      telat {r.hari} hari
                    </div>
                  </div>
                  <div className="text-[13px] font-semibold text-ink whitespace-nowrap">
                    {formatRupiah(r.sisa)}
                  </div>
                </div>
              ))}
              {piutangTelat.length > piutangTelatTop.length && (
                <div className="text-[11.5px] text-muted text-center pt-1">
                  +{piutangTelat.length - piutangTelatTop.length} piutang telat
                  lainnya
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== GRAFIK ===== */}
      <h2 className="font-display text-[15px] font-semibold text-ink mt-6 mb-3">
        Grafik &amp; Tren
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pembelian vs Penjualan */}
        <div className="glass rounded-2xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <h2 className="font-display text-[15px] font-semibold text-ink">
              Pembelian vs Penjualan — 6 Bulan Terakhir
            </h2>
            <div className="flex items-center gap-4 text-[11.5px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: "#C1623D" }} />
                Pembelian
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: "#2F4D3A" }} />
                Penjualan
              </span>
            </div>
          </div>
          <BarChart groups={vsGroups} height={170} formatValue={formatJt} showValue />
        </div>

        {/* Yield produksi */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <h2 className="font-display text-[15px] font-semibold text-ink">
              Efisiensi Produksi (Yield %)
            </h2>
            <span className="text-[11.5px] text-muted">
              hijau ≥ 95% · batch terakhir
            </span>
          </div>
          {yieldGroups.length === 0 ? (
            <p className="text-muted text-[12.5px] text-center py-10">
              Belum ada produksi selesai lewat alur Plan → Result.
            </p>
          ) : (
            <BarChart
              groups={yieldGroups}
              height={150}
              formatValue={(n) => `${n}%`}
              showValue
            />
          )}
        </div>

        {/* Top produk */}
        <div className="glass rounded-2xl p-5">
          <h2 className="font-display text-[15px] font-semibold text-ink mb-4">
            Top 5 Produk Terjual
          </h2>
          <HBarList
            data={topProducts}
            formatValue={(n) => n.toLocaleString("id-ID")}
          />
        </div>
      </div>
    </div>
  );
}
