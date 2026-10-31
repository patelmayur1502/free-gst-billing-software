// Unit test for tallyExport (v1.10.86)
import assert from 'node:assert/strict';
import { exportToTallyXml, escapeXml, toTallyDate } from '../src/utils/tallyExport.js';

console.log('[v1.10.86] Testing tallyExport...');

// 1. Check date conversion and XML escaping
assert.equal(toTallyDate('2026-10-29'), '20261029');
assert.equal(escapeXml('A & B <C> "D"'), 'A &amp; B &lt;C&gt; &quot;D&quot;');

// 2. Check full XML generation
const mockBills = [
  {
    id: 'b1',
    data: {
      details: { invoiceNumber: 'INV/26-27/001', invoiceDate: '2026-10-29', placeOfSupply: 'Maharashtra' },
      client: { name: 'Acme & Sons', gstin: '27AABCU9603R1ZX', address: 'Plot 4, MIDC, Andheri East, Mumbai' },
      items: [
        { name: 'Widget A', quantity: 10, rate: 100, unit: 'Nos', taxPercent: 18, hsn: '8471' },
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
  companyName: 'Galaxy Enterprises',
  bills: mockBills,
  purchases: [],
  receipts: mockReceipts,
});

assert.ok(xml.includes('<ENVELOPE>'), 'Should contain root ENVELOPE');
assert.ok(xml.includes('<SVCURRENTCOMPANY>Galaxy Enterprises</SVCURRENTCOMPANY>'), 'Should include company name');
assert.ok(xml.includes('<VOUCHER VCHTYPE="Sales" ACTION="Create">'), 'Should contain Sales voucher');
assert.ok(xml.includes('<PARTYLEDGERNAME>Acme &amp; Sons</PARTYLEDGERNAME>'), 'Should properly escape party name');
assert.ok(xml.includes('<PARTYGSTIN>27AABCU9603R1ZX</PARTYGSTIN>'), 'Should include client GSTIN');
assert.ok(xml.includes('<DATE>20261029</DATE>'), 'Should format date as YYYYMMDD');
assert.ok(xml.includes('<INVENTORYENTRIES.LIST>'), 'Should have item inventory entries');
assert.ok(xml.includes('<HSNCODE>8471</HSNCODE>'), 'Should export HSNCODE in inventory entry');
assert.ok(xml.includes('<GSTOVRDNHSNCODE>8471</GSTOVRDNHSNCODE>'), 'Should export GSTOVRDNHSNCODE in accounting allocation');
assert.ok(xml.includes('<BATCHALLOCATIONS.LIST>'), 'Should have batch allocations for Tally inventory');
assert.ok(xml.includes('<ACCOUNTINGALLOCATIONS.LIST>'), 'Should have accounting allocation under inventory');
assert.ok(xml.includes('<LEDGERNAME>GST SALES 18%</LEDGERNAME>'), 'Should map item to GST SALES 18% ledger');
assert.ok(xml.includes('<ISPARTYLEDGER>Yes</ISPARTYLEDGER>'), 'Should mark party ledger as party');
assert.ok(xml.includes('<LEDGERNAME>OUTPUT CGST 9%</LEDGERNAME>'), 'Should format CGST ledger with 9% rate');
assert.ok(xml.includes('<LEDGERNAME>OUTPUT SGST 9%</LEDGERNAME>'), 'Should format SGST ledger with 9% rate');
assert.ok(xml.includes('<VOUCHER VCHTYPE="Receipt" ACTION="Create">'), 'Should contain Receipt voucher');
assert.ok(xml.includes('<BILLTYPE>Agst Ref</BILLTYPE>'), 'Should have Against Reference bill allocation');
assert.ok(xml.includes('<NAME>INV/26-27/001</NAME>'), 'Should link payment against the invoice number');

console.log('✓ All tallyExport unit tests passed successfully!');
