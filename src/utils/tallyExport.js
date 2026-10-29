// v1.10.81 - Tally Prime & Tally ERP 9 XML Export Engine
// Generates standard Tally-compatible XML (<ENVELOPE>...<VOUCHER>...)
// for Sales Invoices, Purchases, Credit Notes, and Payment Receipts
// with Agst Ref bill allocations.

import { isCancelledBill } from '../utils.js';

/**
 * Escapes characters for XML payload.
 */
export function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Converts ISO date (YYYY-MM-DD) to Tally format (YYYYMMDD).
 */
export function toTallyDate(dateStr) {
  if (!dateStr) return '';
  return String(dateStr).replace(/-/g, '').slice(0, 8);
}

/**
 * Generates Tally XML for a list of sales bills.
 */
function generateSalesVouchersXml(bills) {
  const vouchers = [];

  for (const b of bills) {
    if (!b || !b.data || isCancelledBill(b)) continue;
    const invNo = b.data.details?.invoiceNumber || b.invoiceNumber || 'INV';
    const invDate = toTallyDate(b.data.details?.invoiceDate || b.invoiceDate);
    const clientName = b.data.client?.name || b.clientName || 'Cash';
    const pos = b.data.details?.placeOfSupply || b.data.client?.state || '';
    const totals = b.data.totals || {};
    const totalAmount = Number(totals.total || b.totalAmount || 0);
    const taxableAmount = Number(totals.subtotal || totals.taxableAmount || 0);
    const cgst = Number(totals.cgst || 0);
    const sgst = Number(totals.sgst || totals.utgst || 0);
    const igst = Number(totals.igst || 0);
    const cess = Number(totals.cess || 0);
    const roundOff = Number(totals.roundOff || 0);
    const isCreditNote = b.data.invoiceType === 'credit-note';
    const vchType = isCreditNote ? 'Credit Note' : 'Sales';

    // In Tally XML:
    // For Sales: Party is DEBIT (ISDEEMEDPOSITIVE=Yes, Amount is negative)
    // Sales ledger is CREDIT (ISDEEMEDPOSITIVE=No, Amount is positive)
    // Taxes are CREDIT (ISDEEMEDPOSITIVE=No, Amount is positive)
    const partyPositive = isCreditNote ? 'No' : 'Yes';
    const incomePositive = isCreditNote ? 'Yes' : 'No';
    const partyAmount = isCreditNote ? totalAmount.toFixed(2) : (-totalAmount).toFixed(2);
    const incomeMultiplier = isCreditNote ? -1 : 1;

    let vchXml = `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${escapeXml(vchType)}" ACTION="Create">
            <DATE>${invDate}</DATE>
            <VOUCHERNUMBER>${escapeXml(invNo)}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${escapeXml(clientName)}</PARTYLEDGERNAME>
            <BASICBUYERNAME>${escapeXml(clientName)}</BASICBUYERNAME>
            <PLACEOFSUPPLY>${escapeXml(pos)}</PLACEOFSUPPLY>
            <NARRATION>${escapeXml(vchType)} ${escapeXml(invNo)}</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${escapeXml(clientName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${partyPositive}</ISDEEMEDPOSITIVE>
              <AMOUNT>${partyAmount}</AMOUNT>
              <BILLALLOCATIONS.LIST>
                <NAME>${escapeXml(invNo)}</NAME>
                <BILLTYPE>New Ref</BILLTYPE>
                <AMOUNT>${partyAmount}</AMOUNT>
              </BILLALLOCATIONS.LIST>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${incomePositive}</ISDEEMEDPOSITIVE>
              <AMOUNT>${(incomeMultiplier * taxableAmount).toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;

    if (cgst > 0) {
      vchXml += `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>CGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${incomePositive}</ISDEEMEDPOSITIVE>
              <AMOUNT>${(incomeMultiplier * cgst).toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;
    }
    if (sgst > 0) {
      vchXml += `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>SGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${incomePositive}</ISDEEMEDPOSITIVE>
              <AMOUNT>${(incomeMultiplier * sgst).toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;
    }
    if (igst > 0) {
      vchXml += `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>IGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${incomePositive}</ISDEEMEDPOSITIVE>
              <AMOUNT>${(incomeMultiplier * igst).toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;
    }
    if (cess > 0) {
      vchXml += `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Cess</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${incomePositive}</ISDEEMEDPOSITIVE>
              <AMOUNT>${(incomeMultiplier * cess).toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;
    }
    if (Math.abs(roundOff) > 0.001) {
      vchXml += `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Round Off</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${roundOff > 0 ? incomePositive : partyPositive}</ISDEEMEDPOSITIVE>
              <AMOUNT>${(incomeMultiplier * roundOff).toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;
    }

    // Inventory items
    const items = b.data.items || [];
    for (const item of items) {
      const iQty = Number(item.quantity) || 0;
      const iRate = Number(item.rate) || 0;
      const iUnit = item.unit || 'Nos';
      const iAmt = iQty * iRate;
      vchXml += `
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${escapeXml(item.name)}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>${incomePositive}</ISDEEMEDPOSITIVE>
              <RATE>${iRate.toFixed(2)}/${escapeXml(iUnit)}</RATE>
              <AMOUNT>${(incomeMultiplier * iAmt).toFixed(2)}</AMOUNT>
              <ACTUALQTY>${iQty} ${escapeXml(iUnit)}</ACTUALQTY>
              <BILLEDQTY>${iQty} ${escapeXml(iUnit)}</BILLEDQTY>
            </ALLINVENTORYENTRIES.LIST>`;
    }

    vchXml += `
          </VOUCHER>
        </TALLYMESSAGE>`;

    vouchers.push(vchXml);
  }

  return vouchers;
}

/**
 * Generates Tally XML for a list of purchase bills.
 */
function generatePurchaseVouchersXml(purchases) {
  const vouchers = [];

  for (const p of purchases) {
    if (!p) continue;
    const billNo = p.billNumber || p.invoiceNumber || 'PUR';
    const date = toTallyDate(p.date || p.billDate);
    const supplier = p.supplierName || 'Cash Supplier';
    const totalAmount = Number(p.totalAmount || p.total || 0);
    const taxable = Number(p.taxableAmount || (totalAmount - (p.totalTax || 0)));
    const cgst = Number(p.cgst || 0);
    const sgst = Number(p.sgst || 0);
    const igst = Number(p.igst || 0);

    let vchXml = `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Purchase" ACTION="Create">
            <DATE>${date}</DATE>
            <VOUCHERNUMBER>${escapeXml(billNo)}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${escapeXml(supplier)}</PARTYLEDGERNAME>
            <BASICBUYERNAME>${escapeXml(supplier)}</BASICBUYERNAME>
            <NARRATION>Purchase Bill ${escapeXml(billNo)}</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${escapeXml(supplier)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${totalAmount.toFixed(2)}</AMOUNT>
              <BILLALLOCATIONS.LIST>
                <NAME>${escapeXml(billNo)}</NAME>
                <BILLTYPE>New Ref</BILLTYPE>
                <AMOUNT>${totalAmount.toFixed(2)}</AMOUNT>
              </BILLALLOCATIONS.LIST>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Purchase Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>${(-taxable).toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;

    if (cgst > 0) {
      vchXml += `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Input CGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>${(-cgst).toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;
    }
    if (sgst > 0) {
      vchXml += `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Input SGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>${(-sgst).toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;
    }
    if (igst > 0) {
      vchXml += `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Input IGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>${(-igst).toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;
    }

    vchXml += `
          </VOUCHER>
        </TALLYMESSAGE>`;

    vouchers.push(vchXml);
  }

  return vouchers;
}

/**
 * Generates Tally XML for a list of receipt vouchers.
 */
function generateReceiptVouchersXml(receipts) {
  const vouchers = [];

  for (const r of receipts) {
    if (!r) continue;
    const rcpNo = r.receiptNo || 'RCP';
    const date = toTallyDate(r.date);
    const clientName = r.clientName || 'Cash';
    const amount = Number(r.amount || 0);
    if (amount <= 0) continue;

    const mode = String(r.paymentMode || 'Bank Transfer').toLowerCase();
    const isCash = mode.includes('cash');
    const bankOrCashLedger = isCash ? 'Cash' : 'Bank Account';
    const againstInv = r.againstInvoice || '';

    let vchXml = `        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Receipt" ACTION="Create">
            <DATE>${date}</DATE>
            <VOUCHERNUMBER>${escapeXml(rcpNo)}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${escapeXml(clientName)}</PARTYLEDGERNAME>
            <NARRATION>Payment received (${escapeXml(r.paymentMode || '')}${r.referenceNo ? ` Ref: ${escapeXml(r.referenceNo)}` : ''})</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${escapeXml(bankOrCashLedger)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>${(-amount).toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${escapeXml(clientName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${amount.toFixed(2)}</AMOUNT>`;

    if (againstInv) {
      vchXml += `
              <BILLALLOCATIONS.LIST>
                <NAME>${escapeXml(againstInv)}</NAME>
                <BILLTYPE>Agst Ref</BILLTYPE>
                <AMOUNT>${amount.toFixed(2)}</AMOUNT>
              </BILLALLOCATIONS.LIST>`;
    }

    vchXml += `
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>`;

    vouchers.push(vchXml);
  }

  return vouchers;
}

/**
 * Master export function: Bundles transactions into Tally XML format.
 *
 * @param {Object} opts
 * @param {string} [opts.companyName] - Tally company name
 * @param {Array} [opts.bills] - Sales bills to export
 * @param {Array} [opts.purchases] - Purchases to export
 * @param {Array} [opts.receipts] - Receipts to export
 * @returns {string} XML content
 */
export function exportToTallyXml({ companyName = 'Company', bills = [], purchases = [], receipts = [] } = {}) {
  const salesVouchers = generateSalesVouchersXml(bills);
  const purchaseVouchers = generatePurchaseVouchersXml(purchases);
  const receiptVouchers = generateReceiptVouchersXml(receipts);

  const allVouchers = [...salesVouchers, ...purchaseVouchers, ...receiptVouchers];

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${allVouchers.join('\n')}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}
