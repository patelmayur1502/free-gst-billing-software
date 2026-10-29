// v1.10.77 (#85) - product helpers for bulk edit and the stock report.
import { appliedStock, isCancelledBill } from '../utils.js';

const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v));

// One edited row of the bulk-edit grid -> the product to save, or { error }.
// Same rules as the single product form: a name is required, GST % 0-100,
// and the selling price is mirrored to `rate` for older readers.
export const bulkRowToProduct = (product, edits) => {
  const merged = { ...product, ...edits };
  const name = String(merged.name ?? '').trim();
  if (!name) return { error: 'a product needs a name' };
  const gst = num(merged.taxPercent);
  if (!Number.isFinite(gst) || gst < 0 || gst > 100) return { error: `${name}: GST % must be 0 to 100` };
  for (const k of ['purchasePrice', 'sellingPrice', 'stock']) {
    if (!Number.isFinite(num(merged[k]))) return { error: `${name}: ${k === 'stock' ? 'stock' : 'price'} must be a number` };
  }
  const sellingPrice = num(edits.sellingPrice ?? product.sellingPrice ?? product.rate);
  return {
    product: {
      ...product,
      name,
      hsn: String(merged.hsn ?? '').trim(),
      purchasePrice: num(merged.purchasePrice),
      sellingPrice,
      rate: sellingPrice,
      taxPercent: gst,
      unit: merged.unit || 'Nos',
      stock: num(merged.stock),
    },
  };
};

// Closing stock of each product at the end of a day (YYYY-MM-DD), worked
// back from today's stock: take off what purchases dated after it brought in,
// and add back what invoices dated after it took out (each invoice's own
// stock record, see appliedStock). Stock typed in by hand on the Products
// screen has no date, so it counts as if it happened today.
// Returns Map(productId -> quantity).
export const closingStock = (products, bills, purchases, asOf) => {
  const qty = new Map((products || []).map((p) => [p.id, Number(p.stock) || 0]));
  const byName = new Map((products || []).map((p) => [String(p.name || '').trim().toLowerCase(), p.id]));
  for (const pur of purchases || []) {
    if (!pur?.date || pur.date <= asOf) continue;
    for (const it of pur.items || []) {
      const id = it.productId || byName.get(String(it.name || '').trim().toLowerCase());
      if (id && qty.has(id)) qty.set(id, qty.get(id) - (Number(it.quantity) || 0));
    }
  }
  for (const b of bills || []) {
    if (!b?.invoiceDate || b.invoiceDate <= asOf || isCancelledBill(b)) continue;
    for (const [id, change] of Object.entries(appliedStock(b))) {
      if (qty.has(id)) qty.set(id, qty.get(id) - change);
    }
  }
  for (const [id, q] of qty) qty.set(id, Math.round(q * 1000) / 1000);
  return qty;
};

// Value of a quantity at the product's purchase price (cost), or at its
// selling price when no purchase price is known.
export const stockValueOf = (product, quantity) => {
  const cost = Number(product?.purchasePrice) || 0;
  const price = cost > 0 ? cost : (Number(product?.sellingPrice) || Number(product?.rate) || 0);
  return { price, value: Math.round(price * (Number(quantity) || 0) * 100) / 100, atCost: cost > 0 };
};

/**
 * Computes item movement ledger for a date range:
 * Opening Stock + Inward - Outward = Closing Stock.
 */
export const stockMovementLedger = (products, bills, purchases, startDate, endDate) => {
  // Opening stock is as of the day before startDate
  const startD = new Date(`${startDate}T00:00:00`);
  startD.setDate(startD.getDate() - 1);
  const prevDate = startD.toISOString().slice(0, 10);

  const openingMap = closingStock(products, bills, purchases, prevDate);
  const closingMap = closingStock(products, bills, purchases, endDate);

  const byName = new Map((products || []).map((p) => [String(p.name || '').trim().toLowerCase(), p.id]));
  const inwardMap = new Map();
  const outwardMap = new Map();

  for (const pur of purchases || []) {
    if (!pur?.date || pur.date < startDate || pur.date > endDate) continue;
    for (const it of pur.items || []) {
      const id = it.productId || byName.get(String(it.name || '').trim().toLowerCase());
      if (id) {
        const q = Number(it.quantity) || 0;
        inwardMap.set(id, (inwardMap.get(id) || 0) + q);
      }
    }
  }

  for (const b of bills || []) {
    if (!b?.invoiceDate || b.invoiceDate < startDate || b.invoiceDate > endDate || isCancelledBill(b)) continue;
    for (const [id, change] of Object.entries(appliedStock(b))) {
      const q = Math.abs(change);
      outwardMap.set(id, (outwardMap.get(id) || 0) + q);
    }
  }

  return (products || []).map((p) => {
    const opening = openingMap.get(p.id) ?? 0;
    const inward = inwardMap.get(p.id) ?? 0;
    const outward = outwardMap.get(p.id) ?? 0;
    const closing = closingMap.get(p.id) ?? (opening + inward - outward);
    const { price, value } = stockValueOf(p, closing);

    return {
      product: p,
      opening: Math.round(opening * 1000) / 1000,
      inward: Math.round(inward * 1000) / 1000,
      outward: Math.round(outward * 1000) / 1000,
      closing: Math.round(closing * 1000) / 1000,
      rate: price,
      valuation: value,
    };
  });
};

/**
 * Computes party-wise customer sales breakdown for a single product.
 */
export const productPartySalesBreakdown = (product, bills, startDate, endDate) => {
  if (!product) return [];
  const targetId = product.id;
  const targetName = String(product.name || '').trim().toLowerCase();
  const partyMap = new Map();

  for (const b of bills || []) {
    if (!b || isCancelledBill(b)) continue;
    const d = b.invoiceDate || b.data?.details?.invoiceDate;
    if (startDate && d < startDate) continue;
    if (endDate && d > endDate) continue;

    const clientName = String(b.data?.client?.name || b.clientName || 'Cash / Unnamed').trim();
    const items = b.data?.items || [];

    for (const it of items) {
      const matchId = it.productId === targetId;
      const matchName = String(it.name || '').trim().toLowerCase() === targetName;
      if (matchId || matchName) {
        const qty = Number(it.quantity) || 0;
        const rate = Number(it.rate) || 0;
        const amount = qty * rate;

        const current = partyMap.get(clientName) || { clientName, quantity: 0, totalAmount: 0, txns: 0, lastDate: d };
        current.quantity += qty;
        current.totalAmount += amount;
        current.txns += 1;
        if (!current.lastDate || d > current.lastDate) current.lastDate = d;
        partyMap.set(clientName, current);
      }
    }
  }

  return Array.from(partyMap.values())
    .map((p) => ({
      ...p,
      avgRate: p.quantity > 0 ? Math.round((p.totalAmount / p.quantity) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.quantity - a.quantity);
};
