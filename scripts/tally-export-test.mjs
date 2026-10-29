// Unit test for tallyExport (v1.10.81)
import assert from 'node:assert/strict';
import { exportToTallyXml, escapeXml, toTallyDate } from '../src/utils/tallyExport.js';

console.log('[v1.10.81] Testing tallyExport...');

// 1. Check date conversion and XML escaping
assert.equal(toTallyDate('2026-10-29'), '20261029');
assert.equal(escapeXml('A & B <C> "D"'), 'A &amp; B &lt;C&gt; &quot;D&quot;');

// 2. Check full XML generation
const mockBills = [
  {
    id: 'b1',
    data: {
      details: { invoiceNumber: 'INV/26-27/001', invoiceDate: '2026-10-29', placeOfSupply: 'Maharashtra' },
      client: { name: 'Acme & Sons' },
      items: [
        { name: 'Widget A', quantity: 10, rate: 100, unit: 'Nos' },
      ],
      totals: {
        subtotal: 1000,
        cgst: 90,
        sgst: 90,
        igst: 0,
        total: 1180,
      },
    },
  },
];

const mockReceipts = [
  {
    receiptNo: 'RCP-001',
    date: '2026-10-29',
    clientName: 'Acme & Sons',
    amount: 1180,
    paymentMode: 'Bank Transfer',
    referenceNo: 'UTR998877',
    againstInvoice: 'INV/26-27/001',
  },
];

const xml = exportToTallyXml({
  companyName: 'Test Enterprises',
  bills: mockBills,
  purchases: [],
  receipts: mockReceipts,
});

assert.ok(xml.includes('<ENVELOPE>'), 'Should contain root ENVELOPE');
assert.ok(xml.includes('<VOUCHER VCHTYPE="Sales" ACTION="Create">'), 'Should contain Sales voucher');
assert.ok(xml.includes('<PARTYLEDGERNAME>Acme &amp; Sons</PARTYLEDGERNAME>'), 'Should properly escape party name');
assert.ok(xml.includes('<DATE>20261029</DATE>'), 'Should format date as YYYYMMDD');
assert.ok(xml.includes('<VOUCHER VCHTYPE="Receipt" ACTION="Create">'), 'Should contain Receipt voucher');
assert.ok(xml.includes('<BILLTYPE>Agst Ref</BILLTYPE>'), 'Should have Against Reference bill allocation');
assert.ok(xml.includes('<NAME>INV/26-27/001</NAME>'), 'Should link payment against the invoice number');

console.log('✓ All tallyExport unit tests passed successfully!');
