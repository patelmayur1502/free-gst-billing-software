// Unit test for tallyImport (v1.10.81)
import assert from 'node:assert/strict';
import { parseTallyMasterRegex } from '../src/utils/tallyImport.js';

console.log('[v1.10.81] Testing tallyImport...');

const sampleTallyXml = `
<ENVELOPE>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE>
          <LEDGER NAME="Apex Infotech Pvt Ltd">
            <PARENT>Sundry Debtors</PARENT>
            <PARTYGSTIN>27AAACA1234A1Z5</PARTYGSTIN>
            <STATENAME>Maharashtra</STATENAME>
            <PINCODE>400051</PINCODE>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <LEDGER NAME="Sharma Hardware">
            <PARENT>Sundry Creditors</PARENT>
            <PARTYGSTIN>24AAACS5678B1Z2</PARTYGSTIN>
            <STATENAME>Gujarat</STATENAME>
            <PINCODE>380015</PINCODE>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <STOCKITEM NAME="PVC Pipe 4 Inch">
            <BASEUNITS>Mtrs</BASEUNITS>
            <HSNCODE>3917</HSNCODE>
            <OPENINGBALANCE>150 Mtrs</OPENINGBALANCE>
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
assert.equal(res.clients[0].name, 'Apex Infotech Pvt Ltd');
assert.equal(res.clients[0].gstin, '27AAACA1234A1Z5');
assert.equal(res.clients[0].state, 'Maharashtra');
assert.equal(res.clients[0].pin, '400051');
assert.equal(res.clients[0].isSupplier, false);

assert.equal(res.clients[1].name, 'Sharma Hardware');
assert.equal(res.clients[1].isSupplier, true);

// Check products
assert.equal(res.products.length, 1, 'Should extract 1 stock item');
assert.equal(res.products[0].name, 'PVC Pipe 4 Inch');
assert.equal(res.products[0].unit, 'Mtrs');
assert.equal(res.products[0].hsn, '3917');
assert.equal(res.products[0].stock, 150);

console.log('✓ All tallyImport unit tests passed successfully!');
