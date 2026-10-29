// Unit test for tallyImport (v1.10.83)
import assert from 'node:assert/strict';
import { parseTallyMasterRegex, parseTallyMasterXml, sanitizeTallyXml, unescapeXml } from '../src/utils/tallyImport.js';

console.log('[v1.10.83] Testing tallyImport...');

// 1. Test unescapeXml & sanitizeTallyXml
assert.equal(unescapeXml('A &amp; B &quot;Item&quot;'), 'A & B "Item"');
assert.equal(sanitizeTallyXml('\uFEFF<TAG>&#4; Applicable\0</TAG>'), '<TAG> Applicable</TAG>');

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

// Check clients
assert.equal(res.clients.length, 2, 'Should extract 2 clients (1 debtor, 1 creditor)');
assert.equal(res.clients[0].name, 'Apex & Infotech Pvt Ltd', 'Should unescape &amp; in client name');
assert.equal(res.clients[0].gstin, '27AAACA1234A1Z5');
assert.equal(res.clients[0].state, 'Maharashtra');
assert.equal(res.clients[0].pin, '400051');
assert.equal(res.clients[0].address, 'Suite 101, BKC');
assert.equal(res.clients[0].isSupplier, false);

assert.equal(res.clients[1].name, 'Sharma "Hardware"', 'Should unescape &quot; in vendor name');
assert.equal(res.clients[1].isSupplier, true);
assert.equal(res.clients[1].state, 'Gujarat', 'Should infer Gujarat from 24 prefix when state tag is empty');

// Check products
assert.equal(res.products.length, 1, 'Should extract 1 stock item');
assert.equal(res.products[0].name, '18 " PVC Pipe 4 Inch', 'Should unescape &quot; in product name');
assert.equal(res.products[0].unit, 'Mtrs');
assert.equal(res.products[0].hsn, '3917');
assert.equal(res.products[0].stock, 150);
assert.equal(res.products[0].rate, 45.5);

// Test parseTallyMasterXml fallback
const resXml = parseTallyMasterXml(sampleTallyXml);
assert.equal(resXml.clients.length, 2);
assert.equal(resXml.products.length, 1);

console.log('✓ All tallyImport unit tests passed successfully!');
