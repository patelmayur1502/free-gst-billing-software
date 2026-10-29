// v1.10.81 - Item sales rate & quantity history (Party-wise and Market-wise).
// Helps cashiers and accountants see what rate/qty this item was sold to this
// specific party in previous bills, plus recent rates charged to other parties.

import { isCancelledBill, resolveLineDiscount } from '../utils.js';

/**
 * Normalise a string for loose comparison (case, extra spaces trimmed).
 */
const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * Extracts historical sales for a product from all completed invoices.
 *
 * @param {Object} opts
 * @param {string} opts.itemName - Product name to search
 * @param {string} [opts.clientName] - Current party/customer name
 * @param {Array} opts.bills - Array of all bills from store
 * @param {number} [opts.limit=5] - Maximum other-party sales to return
 * @returns {Object} { lastPartySale, partyHistory, otherPartyHistory }
 */
export function getItemSalesHistory({ itemName, clientName = '', bills = [], limit = 5 }) {
  const targetItem = norm(itemName);
  if (!targetItem || !Array.isArray(bills) || bills.length === 0) {
    return { lastPartySale: null, partyHistory: [], otherPartyHistory: [] };
  }

  const targetClient = norm(clientName);
  const partySales = [];
  const otherSales = [];

  // Sort bills descending by invoice date
  const sortedBills = [...bills]
    .filter((b) => b && b.data && !isCancelledBill(b))
    .sort((a, b) => {
      const da = String(a.data?.details?.invoiceDate || a.invoiceDate || '');
      const db = String(b.data?.details?.invoiceDate || b.invoiceDate || '');
      return db.localeCompare(da);
    });

  for (const bill of sortedBills) {
    const bClient = String(bill.data?.client?.name || bill.clientName || '').trim();
    const isThisParty = targetClient && norm(bClient) === targetClient;
    const items = bill.data?.items || [];
    const invNo = bill.data?.details?.invoiceNumber || bill.invoiceNumber || '';
    const invDate = bill.data?.details?.invoiceDate || bill.invoiceDate || '';

    for (const item of items) {
      if (norm(item.name) === targetItem) {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const disc = resolveLineDiscount ? resolveLineDiscount(item) : (Number(item.discount) || 0);
        // Effective net rate per unit after item discount
        const effectiveRate = qty > 0 ? Math.max(0, (qty * rate - disc) / qty) : rate;

        const record = {
          invoiceNumber: invNo,
          invoiceDate: invDate,
          clientName: bClient || 'Cash / Unnamed',
          quantity: qty,
          unit: item.unit || 'Nos',
          rate,
          discount: disc,
          effectiveRate: Math.round(effectiveRate * 100) / 100,
          taxPercent: Number(item.taxPercent) || 0,
        };

        if (isThisParty) {
          partySales.push(record);
        } else {
          otherSales.push(record);
        }
      }
    }
  }

  return {
    lastPartySale: partySales[0] || null,
    partyHistory: partySales,
    otherPartyHistory: otherSales.slice(0, limit),
  };
}
