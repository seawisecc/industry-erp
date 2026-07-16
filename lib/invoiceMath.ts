export type InvoiceItemCalc = { qty: number; harga: number };

export function computeTotals(
  items: InvoiceItemCalc[],
  diskonPercent: number,
  pakaiTax: boolean,
  taxPercent: number
) {
  const subtotal = items.reduce((s, it) => s + it.qty * it.harga, 0);
  const diskon = (subtotal * diskonPercent) / 100;
  const dpp = subtotal - diskon;
  const tax = pakaiTax ? (dpp * taxPercent) / 100 : 0;
  return { subtotal, diskon, tax, total: dpp + tax };
}
