// Unit test for tallyImport (v1.10.87)
import assert from 'node:assert/strict';
import {
  parseTallyMasterRegex, parseTallyMasterXml, parseTallySalesVouchersXml,
  parseTallyXml, sanitizeTallyXml, unescapeXml,
  detectDuplicateInvoices, resolveDuplicateBill,
  extractHsnFromXmlSnippet, normalizeItemKey,
} from '../src/utils/tallyImport.js';

console.log('[v1.10.87] Testing tallyImport...');

// 1. Test unescapeXml & sanitizeTallyXml
assert.equal(unescapeXml('A &amp; B &quot;Item&quot;'), 'A & B "Item"');
assert.equal(sanitizeTallyXml('\uFEFF<TAG>&#4; Applicable\0</TAG>'), '<TAG> Applicable</TAG>');

// 1.1 Test extractHsnFromXmlSnippet across diverse Tally schemas
assert.equal(extractHsnFromXmlSnippet('<HSNCODE>84717020</HSNCODE>'), '84717020');
assert.equal(extractHsnFromXmlSnippet('<HSNCODE TYPE="String">84717020</HSNCODE>'), '84717020');
assert.equal(extractHsnFromXmlSnippet('<GSTDETAILS.LIST><HSNCODE>84717020</HSNCODE></GSTDETAILS.LIST>'), '84717020');
assert.equal(extractHsnFromXmlSnippet('<ACCOUNTINGALLOCATIONS.LIST><GSTOVRDNHSNCODE>84717020</GSTOVRDNHSNCODE></ACCOUNTINGALLOCATIONS.LIST>'), '84717020');
assert.equal(extractHsnFromXmlSnippet('<COMMODITYCODE>4202</COMMODITYCODE>'), '4202');
assert.equal(extractHsnFromXmlSnippet('<HSNSACCODE>9965</HSNSACCODE>'), '9965');
assert.equal(normalizeItemKey('18 " PVC Pipe 4 Inch'), '18 pvc pipe 4 inch');

// 2. Test Masters parsing
const sampleTallyXml = `
<ENVELOPE>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE>
          <LEDGER NAME="Apex &amp; Infotech Pvt Ltd">
            <PARENT>Sundry Debtors</PARENT>
            <PARTYGSTIN>27AAACA1234A1Z5</PARTYGSTIN>
            <STATENAME>Maharashtra</STATENAME>
            <PINCODE>400051</PINCODE>
            <ADDRESS.LIST>
              <ADDRESS>Suite 101</ADDRESS>
              <ADDRESS>BKC</ADDRESS>
            </ADDRESS.LIST>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <LEDGER NAME="Sharma &quot;Hardware&quot;">
            <PARENT>Sundry Creditors</PARENT>
            <PARTYGSTIN>24AAACS5678B1Z2</PARTYGSTIN>
            <STATENAME></STATENAME>
            <PINCODE>380015</PINCODE>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <STOCKITEM NAME="18 &quot; PVC Pipe 4 Inch">
            <GSTAPPLICABLE>&#4; Applicable</GSTAPPLICABLE>
            <BASEUNITS>Mtrs</BASEUNITS>
            <HSNCODE>3917</HSNCODE>
            <OPENINGBALANCE>150 Mtrs</OPENINGBALANCE>
            <OPENINGRATE>45.50</OPENINGRATE>
          </STOCKITEM>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`;

const res = parseTallyMasterRegex(sampleTallyXml);
assert.equal(res.clients.length, 2, 'Should extract 2 clients (1 debtor, 1 creditor)');
assert.equal(res.clients[0].name, 'Apex & Infotech Pvt Ltd');
assert.equal(res.clients[0].gstin, '27AAACA1234A1Z5');
assert.equal(res.clients[0].state, 'Maharashtra');
assert.equal(res.clients[0].address, 'Suite 101, BKC');
assert.equal(res.clients[0].isSupplier, false);
assert.equal(res.clients[1].name, 'Sharma "Hardware"');
assert.equal(res.clients[1].isSupplier, true);
assert.equal(res.clients[1].state, 'Gujarat');
assert.equal(res.products.length, 1);
assert.equal(res.products[0].name, '18 " PVC Pipe 4 Inch');
assert.equal(res.products[0].unit, 'Mtrs');
assert.equal(res.products[0].stock, 150);
assert.equal(res.products[0].rate, 45.5);

// 3. Test Sales Voucher XML parsing
const sampleSalesXml = `
<ENVELOPE>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <DATE>20240415</DATE>
            <VOUCHERNUMBER>INV-2024-001</VOUCHERNUMBER>
            <PARTYNAME>Apex &amp; Infotech Pvt Ltd</PARTYNAME>
            <PARTYGSTIN>27AAACA1234A1Z5</PARTYGSTIN>
            <STATENAME>Maharashtra</STATENAME>
            <PLACEOFSUPPLY>Maharashtra</PLACEOFSUPPLY>
            <ADDRESS.LIST>
              <ADDRESS>BKC, Mumbai</ADDRESS>
            </ADDRESS.LIST>
            <NARRATION>Tax Invoice for IT supplies</NARRATION>
            <INVENTORYENTRIES.LIST>
              <STOCKITEMNAME>18 &quot; PVC Pipe 4 Inch</STOCKITEMNAME>
              <ACTUALQTY> 10.00 Mtrs</ACTUALQTY>
              <BILLEDQTY> 10.00 Mtrs</BILLEDQTY>
              <RATE> 100.00/Mtrs</RATE>
              <AMOUNT>1000.00</AMOUNT>
              <HSNCODE>3917</HSNCODE>
            </INVENTORYENTRIES.LIST>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>Apex &amp; Infotech Pvt Ltd</LEDGERNAME>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>-1180.00</AMOUNT>
            </LEDGERENTRIES.LIST>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>Sales Account</LEDGERNAME>
              <AMOUNT>1000.00</AMOUNT>
            </LEDGERENTRIES.LIST>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>CGST</LEDGERNAME>
              <BASICRATEOFINVOICETAX>9</BASICRATEOFINVOICETAX>
              <AMOUNT>90.00</AMOUNT>
            </LEDGERENTRIES.LIST>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>SGST</LEDGERNAME>
              <BASICRATEOFINVOICETAX>9</BASICRATEOFINVOICETAX>
              <AMOUNT>90.00</AMOUNT>
            </LEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`;

const resVch = parseTallySalesVouchersXml(sampleSalesXml);
assert.equal(resVch.bills.length, 1, 'Should extract 1 sales bill');
const bill = resVch.bills[0];
assert.equal(bill.invoiceNumber, 'INV-2024-001');
assert.equal(bill.invoiceDate, '2024-04-15');
assert.equal(bill.clientName, 'Apex & Infotech Pvt Ltd');
assert.equal(bill.totalAmount, 1180);
assert.equal(bill.totalTaxAmount, 180);
assert.equal(bill.data.items.length, 1);
assert.equal(bill.data.items[0].name, '18 " PVC Pipe 4 Inch');
assert.equal(bill.data.items[0].quantity, 10);
assert.equal(bill.data.items[0].rate, 100);
assert.equal(bill.data.items[0].hsn, '3917');
assert.equal(bill.data.totals.cgst, 90);
assert.equal(bill.data.totals.sgst, 90);

// 3.1 Test Sales Voucher XML parsing when HSN is missing from voucher but provided via products
const salesXmlWithoutHsn = sampleSalesXml.replace('<HSNCODE>3917</HSNCODE>', '');
const resBackfilled = parseTallySalesVouchersXml(salesXmlWithoutHsn, {
  products: [{ name: '18 " PVC Pipe 4 Inch', hsn: '3917' }],
});
assert.equal(resBackfilled.bills[0].data.items[0].hsn, '3917', 'Should backfill HSN from product catalog');

// 4. Test Unified parseTallyXml auto-detection
const autoVch = parseTallyXml(sampleSalesXml);
assert.equal(autoVch.isVoucher, true);
assert.equal(autoVch.bills.length, 1);

// 4.1 Test combined XML with both StockItem and Voucher lacking HSN tag
const combinedXml = `
<ENVELOPE>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE>
          <STOCKITEM NAME="18 &quot; PVC Pipe 4 Inch">
            <BASEUNITS>Mtrs</BASEUNITS>
            <GSTDETAILS.LIST>
              <HSNCODE>3917</HSNCODE>
            </GSTDETAILS.LIST>
          </STOCKITEM>
        </TALLYMESSAGE>
        ${sampleSalesXml.replace('<HSNCODE>3917</HSNCODE>', '')}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
`;
const autoCombined = parseTallyXml(combinedXml);
assert.equal(autoCombined.isMaster, true);
assert.equal(autoCombined.isVoucher, true);
assert.equal(autoCombined.bills[0].data.items[0].hsn, '3917', 'Combined XML should populate HSN on vouchers from stock items in same file');

const autoMaster = parseTallyXml(sampleTallyXml);
assert.equal(autoMaster.isMaster, true);
assert.equal(autoMaster.clients.length, 2);

// 5. Test detectDuplicateInvoices and resolveDuplicateBill
const incomingBills = [
  { rawInvoiceNumber: 'INV-101', invoiceNumber: 'INV-101', id: 'INV-101' },
  { rawInvoiceNumber: 'INV-101', invoiceNumber: 'INV-101', id: 'INV-101' },
  { rawInvoiceNumber: 'INV-102', invoiceNumber: 'INV-102', id: 'INV-102' },
];
const existingBills = [
  { invoiceNumber: 'INV-102', id: 'INV-102' },
];

const dupInfo = detectDuplicateInvoices(incomingBills, existingBills);
assert.equal(dupInfo.hasDuplicates, true);
assert.equal(dupInfo.duplicatesInFileCount, 1, '1 duplicate inside incoming file');
assert.equal(dupInfo.duplicatesInDbCount, 1, '1 duplicate colliding with DB');

// Test strategy: keep-both
const usedNos = new Set(['inv-102']);
const seenInSess = new Map();
const res1 = resolveDuplicateBill(incomingBills[0], { strategy: 'keep-both', usedInvNos: usedNos, seenInSession: seenInSess });
assert.equal(res1.actionTaken, 'new');
assert.equal(res1.billToSave.invoiceNumber, 'INV-101');

const res2 = resolveDuplicateBill(incomingBills[1], { strategy: 'keep-both', usedInvNos: usedNos, seenInSession: seenInSess });
assert.equal(res2.actionTaken, 'suffixed');
assert.equal(res2.billToSave.invoiceNumber, 'INV-101-1');

// Test strategy: replace
const existingMap = new Map([['inv-102', { id: 'inv-102-uuid', invoiceNumber: 'INV-102' }]]);
const resReplace = resolveDuplicateBill(incomingBills[2], { strategy: 'replace', existingBillsMap: existingMap, usedInvNos: usedNos, seenInSession: seenInSess });
assert.equal(resReplace.actionTaken, 'replaced');
assert.equal(resReplace.shouldOverwrite, true);
assert.equal(resReplace.billToSave.id, 'inv-102-uuid');

// Test strategy: skip
const resSkip = resolveDuplicateBill(incomingBills[2], { strategy: 'skip', existingBillsMap: existingMap, usedInvNos: usedNos, seenInSession: seenInSess });
assert.equal(resSkip.actionTaken, 'skipped');
assert.equal(resSkip.skip, true);

console.log('✓ All tallyImport unit tests passed successfully!');
