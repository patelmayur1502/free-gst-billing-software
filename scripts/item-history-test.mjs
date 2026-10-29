// Unit test for getItemSalesHistory (v1.10.81)
import assert from 'node:assert/strict';
import { getItemSalesHistory } from '../src/utils/itemHistory.js';

const mockBills = [
  {
    id: 'b1',
    invoiceDate: '2026-10-15',
    data: {
      details: { invoiceNumber: 'INV-001', invoiceDate: '2026-10-15' },
      client: { name: 'Acme Corp' },
      items: [
        { name: 'Steel Rod 12mm', quantity: 10, rate: 450, discount: 0, taxPercent: 18 },
        { name: 'Cement Bag', quantity: 50, rate: 380, discount: 0, taxPercent: 28 },
      ],
    },
  },
  {
    id: 'b2',
    invoiceDate: '2026-10-20',
    data: {
      details: { invoiceNumber: 'INV-002', invoiceDate: '2026-10-20' },
      client: { name: 'BuildWell Infra' },
      items: [
        { name: 'Steel Rod 12mm', quantity: 25, rate: 440, discount: 0, taxPercent: 18 },
      ],
    },
  },
  {
    id: 'b3',
    invoiceDate: '2026-10-25',
    data: {
      details: { invoiceNumber: 'INV-003', invoiceDate: '2026-10-25' },
      client: { name: 'Acme Corp' },
      items: [
        { name: 'Steel Rod 12mm', quantity: 15, rate: 445, discount: 0, taxPercent: 18 },
      ],
    },
  },
];

console.log('[v1.10.81] Testing getItemSalesHistory...');

// 1. Check history for Acme Corp (has 2 sales: INV-003 latest @ 445, INV-001 @ 450)
const resAcme = getItemSalesHistory({
  itemName: 'Steel Rod 12mm',
  clientName: 'Acme Corp',
  bills: mockBills,
});

assert.ok(resAcme.lastPartySale, 'Should find last party sale');
assert.equal(resAcme.lastPartySale.invoiceNumber, 'INV-003', 'Latest invoice should be INV-003');
assert.equal(resAcme.lastPartySale.rate, 445, 'Rate should be 445');
assert.equal(resAcme.lastPartySale.quantity, 15, 'Quantity should be 15');
assert.equal(resAcme.partyHistory.length, 2, 'Should have 2 historical sales to Acme Corp');

// 2. Check other parties sales (BuildWell Infra @ 440)
assert.equal(resAcme.otherPartyHistory.length, 1, 'Should find 1 other party sale');
assert.equal(resAcme.otherPartyHistory[0].clientName, 'BuildWell Infra');
assert.equal(resAcme.otherPartyHistory[0].rate, 440);

// 3. Check for non-existent item
const resNone = getItemSalesHistory({
  itemName: 'Copper Wire',
  clientName: 'Acme Corp',
  bills: mockBills,
});
assert.equal(resNone.lastPartySale, null);
assert.equal(resNone.partyHistory.length, 0);
assert.equal(resNone.otherPartyHistory.length, 0);

console.log('✓ All itemHistory unit tests passed successfully!');
