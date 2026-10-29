// Unit test for tallyImport (v1.10.84)
import assert from 'node:assert/strict';
import {
  parseTallyMasterRegex, parseTallyMasterXml, parseTallySalesVouchersXml,
  parseTallyXml, sanitizeTallyXml, unescapeXml,
} from '../src/utils/tallyImport.js';

console.log('[v1.10.84] Testing tallyImport...');

// 1. Test unescapeXml & sanitizeTallyXml
assert.equal(unescapeXml('A &amp; B &quot;Item&quot;'), 'A & B "Item"');
assert.equal(sanitizeTallyXml('\uFEFF<TAG>&#4; Applicable\0</TAG>'), '<TAG> Applicable</TAG>');

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

// 4. Test Unified parseTallyXml auto-detection
const autoVch = parseTallyXml(sampleSalesXml);
assert.equal(autoVch.isVoucher, true);
assert.equal(autoVch.bills.length, 1);

const autoMaster = parseTallyXml(sampleTallyXml);
assert.equal(autoMaster.isMaster, true);
assert.equal(autoMaster.clients.length, 2);

console.log('✓ All tallyImport unit tests passed successfully!');
