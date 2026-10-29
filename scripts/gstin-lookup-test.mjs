// Unit test for gstinLookup & official GSTN schema parsing (v1.10.82)
import assert from 'node:assert/strict';
import { lookupGstinLocal, parseOfficialGstnPayload } from '../src/utils/gstinLookup.js';

console.log('[v1.10.82] Testing lookupGstinLocal...');

const mockClients = [
  { id: 'c1', name: 'Tata Steel Ltd', gstin: '27AAACT2727Q1ZW', city: 'Mumbai', state: 'Maharashtra', pin: '400001' },
];

const mockBills = [
  {
    id: 'b1',
    data: {
      client: { name: 'Reliance Retail', gstin: '24AABCR2424P1ZX', city: 'Ahmedabad', state: 'Gujarat', pin: '380001' },
    },
  },
];

// 1. Found in clients
const res1 = lookupGstinLocal('27AAACT2727Q1ZW', { clients: mockClients, bills: mockBills });
assert.ok(res1, 'Should find Tata Steel in clients');
assert.equal(res1.name, 'Tata Steel Ltd');
assert.equal(res1.city, 'Mumbai');

// 2. Found in bills
const res2 = lookupGstinLocal('24AABCR2424P1ZX', { clients: mockClients, bills: mockBills });
assert.ok(res2, 'Should find Reliance Retail in bills');
assert.equal(res2.name, 'Reliance Retail');
assert.equal(res2.city, 'Ahmedabad');

// 3. Not found
const res3 = lookupGstinLocal('07AAAAA0000A1Z5', { clients: mockClients, bills: mockBills });
assert.equal(res3, null, 'Should return null for unknown GSTIN');

// 4. Test official GSTN developer portal schema parser
console.log('[v1.10.82] Testing parseOfficialGstnPayload...');
const sampleOfficialPayload = {
  gstin: '29HJKPS9689A8Z5',
  lgnm: 'Kamath Foods',
  tradeNam: 'ALTON PLASTIC PRIVATE LTD.',
  sts: 'Active',
  dty: 'Regular',
  einvoiceStatus: 'Yes',
  pradr: {
    addr: {
      bno: '5',
      flno: '4TH FLOOR',
      bnm: 'KATGARA HOUSE',
      st: '15, L JAGMOHANDAS MARG',
      loc: 'MALABAR HILL',
      stcd: 'Maharashtra',
      pncd: 400006,
    },
  },
};

const parsed = parseOfficialGstnPayload(sampleOfficialPayload);
assert.equal(parsed.name, 'Kamath Foods', 'Legal name should map to client name');
assert.equal(parsed.tradeName, 'ALTON PLASTIC PRIVATE LTD.');
assert.equal(parsed.state, 'Maharashtra');
assert.equal(parsed.pin, '400006');
assert.equal(parsed.city, 'MALABAR HILL');
assert.equal(parsed.isActive, true);
assert.equal(parsed.einvoiceEnabled, true);
assert.ok(parsed.address.includes('KATGARA HOUSE'), 'Address should include building name');
assert.ok(parsed.address.includes('15, L JAGMOHANDAS MARG'), 'Address should include street');

console.log('✓ All gstinLookup tests passed successfully!');
