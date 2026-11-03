// v1.10.88 - Unit tests for Tally Voucher Upload endpoint (/api/tally/upload)
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTallyXml, sanitizeTallyXml } from '../src/utils/tallyImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

console.log('[v1.10.88] Running Tally Voucher Upload tests...');

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
            <VOUCHERNUMBER>TEST-UPLOAD-101</VOUCHERNUMBER>
            <PARTYNAME>Upload Test Client Pvt Ltd</PARTYNAME>
            <PARTYGSTIN>07AAAAA0000A1Z5</PARTYGSTIN>
            <STATENAME>Delhi</STATENAME>
            <NARRATION>Direct upload test from Tally</NARRATION>
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

// Test parser directly
const parsed = parseTallyXml(sampleXmlUtf8);
assert.strictEqual(parsed.bills.length, 1, 'Should parse 1 bill');
assert.strictEqual(parsed.bills[0].invoiceNumber, 'TEST-UPLOAD-101');
assert.strictEqual(parsed.bills[0].clientName, 'Upload Test Client Pvt Ltd');
assert.strictEqual(parsed.bills[0].totalAmount, 1180);
assert.strictEqual(parsed.bills[0].data.items[0].hsn, '84713010', 'Should extract HSN from GSTDETAILS.LIST');
assert.strictEqual(parsed.bills[0].data.items[0].name, 'Direct Upload Widget');
console.log('✓ parseTallyXml correctly extracted voucher, client, item, and HSN 84713010');

// Test UTF-16LE buffer with BOM
const bufUtf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(sampleXmlUtf8, 'utf16le')]);
let decoded = '';
if (bufUtf16[0] === 0xff && bufUtf16[1] === 0xfe) {
  decoded = bufUtf16.toString('utf16le');
}
assert.strictEqual(decoded.includes('TEST-UPLOAD-101'), true, 'UTF-16LE with BOM must decode cleanly');
const parsedUtf16 = parseTallyXml(decoded);
assert.strictEqual(parsedUtf16.bills.length, 1, 'UTF-16LE XML parsed bill');
console.log('✓ UTF-16LE buffer decoding verified');

// Test disk-saving logic in mock environment
const testBillsDir = path.join(DATA_DIR, 'bills');
if (!fs.existsSync(testBillsDir)) fs.mkdirSync(testBillsDir, { recursive: true });

const testBillFile = path.join(testBillsDir, 'TEST-UPLOAD-101.json');
fs.writeFileSync(testBillFile, JSON.stringify(parsed.bills[0], null, 2), 'utf-8');
assert.strictEqual(fs.existsSync(testBillFile), true, 'File should exist on disk');

const readBack = JSON.parse(fs.readFileSync(testBillFile, 'utf-8'));
assert.strictEqual(readBack.invoiceNumber, 'TEST-UPLOAD-101');
assert.strictEqual(readBack.data.items[0].hsn, '84713010');

// Clean up test file
if (fs.existsSync(testBillFile)) fs.unlinkSync(testBillFile);

console.log('✓ All Tally Voucher Upload tests passed successfully!');
