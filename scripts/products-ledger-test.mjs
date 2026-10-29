// Unit test for stockMovementLedger & productPartySalesBreakdown (v1.10.81)
import assert from 'node:assert/strict';
import { stockMovementLedger, productPartySalesBreakdown } from '../src/utils/products.js';

console.log('[v1.10.81] Testing stockMovementLedger...');

const mockProducts = [
  { id: 'p1', name: 'Cement 50kg', stock: 100, purchasePrice: 350, unit: 'Bags' },
];

const mockBills = [
  {
    id: 'b1',
    invoiceDate: '2026-10-15',
    data: {
      client: { name: 'Metro Builders' },
      stockApplied: { p1: -20 },
      items: [{ productId: 'p1', name: 'Cement 50kg', quantity: 20, rate: 400 }],
    },
  },
];

const mockPurchases = [
  {
    id: 'pur1',
    date: '2026-10-10',
    items: [{ productId: 'p1', name: 'Cement 50kg', quantity: 50, rate: 350 }],
  },
];

const ledger = stockMovementLedger(mockProducts, mockBills, mockPurchases, '2026-10-01', '2026-10-31');
assert.equal(ledger.length, 1);
assert.equal(ledger[0].inward, 50, 'Inward should be 50');
assert.equal(ledger[0].outward, 20, 'Outward should be 20');
assert.equal(ledger[0].closing, 100, 'Closing stock should match product stock');

// Test party breakdown
const breakdown = productPartySalesBreakdown(mockProducts[0], mockBills, '2026-10-01', '2026-10-31');
assert.equal(breakdown.length, 1);
assert.equal(breakdown[0].clientName, 'Metro Builders');
assert.equal(breakdown[0].quantity, 20);
assert.equal(breakdown[0].avgRate, 400);

console.log('✓ All stockMovementLedger unit tests passed successfully!');
