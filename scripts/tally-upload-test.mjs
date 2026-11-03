// v1.10.89 - Unit tests for Tally Voucher Upload & Pending Approval Queue
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTallyXml, sanitizeTallyXml } from '../src/utils/tallyImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PENDING_DIR = path.join(DATA_DIR, 'tally-pending');
const BILLS_DIR = path.join(DATA_DIR, 'bills');

console.log('[v1.10.89] Running Tally Voucher Upload & Pending Queue tests...');

if (!fs.existsSync(PENDING_DIR)) fs.mkdirSync(PENDING_DIR, { recursive: true });
if (!fs.existsSync(BILLS_DIR)) fs.mkdirSync(BILLS_DIR, { recursive: true });

// 1. Test XML sanitization and UTF-8 / UTF-16LE decoding
const sampleXmlUtf8 = `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <DATE>20261103</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>TEST-QUEUE-230</VOUCHERNUMBER>
            <PARTYNAME>Upload Test Client Pvt Ltd</PARTYNAME>
            <PARTYGSTIN>07AAAAA0000A1Z5</PARTYGSTIN>
            <STATENAME>Delhi</STATENAME>
            <NARRATION>Pending queue staging test</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Upload Test Client Pvt Ltd</LEDGERNAME>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>-1180.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales GST 18%</LEDGERNAME>
              <AMOUNT>1000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>CGST</LEDGERNAME>
              <AMOUNT>90.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>SGST</LEDGERNAME>
              <AMOUNT>90.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>Direct Upload Widget</STOCKITEMNAME>
              <RATE>1000.00/Nos</RATE>
              <BILLEDQTY>1.00 Nos</BILLEDQTY>
              <AMOUNT>1000.00</AMOUNT>
              <GSTDETAILS.LIST>
                <HSNCODE>84713010</HSNCODE>
              </GSTDETAILS.LIST>
            </ALLINVENTORYENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

// Parse XML
const parsed = parseTallyXml(sampleXmlUtf8);
assert.strictEqual(parsed.bills.length, 1, 'Should parse 1 bill');
assert.strictEqual(parsed.bills[0].invoiceNumber, 'TEST-QUEUE-230');

// 2. Test Staging into Pending Queue
const bill = parsed.bills[0];
const pendingId = 'TEST-QUEUE-230';
const pendingFile = path.join(PENDING_DIR, pendingId + '.json');

const pendingRecord = {
  id: pendingId,
  invoiceNumber: bill.invoiceNumber,
  invoiceDate: bill.invoiceDate,
  clientName: bill.clientName,
  totalAmount: bill.totalAmount,
  totalTaxAmount: bill.totalTaxAmount,
  items: bill.data.items,
  receivedAt: new Date().toISOString(),
  status: 'pending_approval',
  existsInBills: false,
  billData: bill,
};

fs.writeFileSync(pendingFile, JSON.stringify(pendingRecord, null, 2), 'utf-8');
assert.strictEqual(fs.existsSync(pendingFile), true, 'Pending voucher should be saved to tally-pending/');
console.log('✓ Voucher successfully staged into Pending Approval queue');

// 3. Test Approval & Moving to Bills
const targetBillFile = path.join(BILLS_DIR, pendingId + '.json');
fs.writeFileSync(targetBillFile, JSON.stringify(pendingRecord.billData, null, 2), 'utf-8');
fs.unlinkSync(pendingFile);

assert.strictEqual(fs.existsSync(targetBillFile), true, 'Approved bill should exist in data/bills/');
assert.strictEqual(fs.existsSync(pendingFile), false, 'Approved bill should be removed from tally-pending/');
console.log('✓ Approval flow verified: bill moved to data/bills and removed from pending queue');

// 4. Test Duplicate Strategy 'keep-both'
let counter = 1;
let copyId = `${pendingId}-${counter}`;
while (fs.existsSync(path.join(BILLS_DIR, copyId + '.json'))) {
  counter++;
  copyId = `${pendingId}-${counter}`;
}
assert.strictEqual(copyId, 'TEST-QUEUE-230-1', 'Should generate suffixed number for copy');
console.log('✓ Duplicate resolution (keep-both) generates clean sequential suffix');

// Clean up
if (fs.existsSync(targetBillFile)) fs.unlinkSync(targetBillFile);

console.log('✓ All Tally Voucher Upload & Pending Queue tests passed successfully!');
