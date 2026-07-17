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

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>
      <p className="text-muted text-sm mt-1">
        Halo, <b>{profile?.nama}</b> 👋 — ringkasan gudang &amp; pembelian
      </p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

      {/* ===== GRAFIK ===== */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
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
