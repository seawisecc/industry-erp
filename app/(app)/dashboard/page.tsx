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
  const todayStr = today.toISOString().slice(0, 10);
  const in60 = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const monthStart = `${todayStr.slice(0, 7)}-01`;
  const monthLabel = today.toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });

  const [batchesRes, itemsRes, receivingsRes, hutangRes] = await Promise.all([
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
        <StatCard
          icon={CalendarClock}
          label="Expired ≤ 60 Hari"
          value={String(expiring)}
          sub="Batch mendekati / lewat exp date"
          tone={expiring > 0 ? "amber" : "botanical"}
        />
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

      <p className="text-muted text-[12.5px] mt-6">
        Statistik cost produksi akan muncul di sini setelah modul Produksi jadi.
      </p>
    </div>
  );
}
