import fs from 'node:fs';

const billsRes = await fetch('https://billing.ecozen.in/api/bills');
const bills = await billsRes.json();
console.log(`Loaded ${bills.length} bills from live server.`);

const updatedBills = bills.map(b => ({ ...b, payments: [...(b.payments || [])] }));

// 1. Shiv Krupa: Cash receipt 3,55,475 to GE/338/2025-26
const sk = updatedBills.find(b => b.invoiceNumber === 'GE/338/2025-26');
if (sk) {
  sk.paidAmount = sk.totalAmount;
  sk.status = 'paid';
  sk.payments = [
    {
      id: 'pay_cash_54',
      date: '2025-06-22',
      amount: 355475,
      mode: 'cash',
      receiptNo: 'RCP-54',
      note: 'Cash Book Receipt 54',
      recordedAt: new Date().toISOString(),
    }
  ];
}

// 2. Maitri Garmets: Cash receipt 25,000 to INV-014
const mg = updatedBills.find(b => b.invoiceNumber === 'INV-014');
if (mg) {
  mg.paidAmount = (mg.paidAmount || 0) + 25000;
  mg.status = mg.paidAmount >= mg.totalAmount - 0.5 ? 'paid' : 'partial';
  mg.payments.push({
    id: 'pay_cash_498',
    date: '2023-12-27',
    amount: 25000,
    mode: 'cash',
    receiptNo: 'RCP-498',
    note: 'Cash Book Receipt 498',
    recordedAt: new Date().toISOString(),
  });
}

// 3. Golden Globe Hotels: Credit Note 42,144 to GE/376/2025-26
const gg = updatedBills.find(b => b.invoiceNumber === 'GE/376/2025-26');
if (gg) {
  gg.paidAmount = (gg.paidAmount || 0) + 42144;
  gg.status = gg.paidAmount >= gg.totalAmount - 0.5 ? 'paid' : 'partial';
  gg.payments.push({
    id: 'pay_cn_3',
    date: '2025-12-26',
    amount: 42144,
    mode: 'other',
    receiptNo: 'CN-3',
    note: 'Tally Credit Note 3',
    recordedAt: new Date().toISOString(),
  });
}

// 4. Silverline Gifts: Discount 11,250 to IN-222
const sg = updatedBills.find(b => b.invoiceNumber === 'IN-222');
if (sg) {
  sg.paidAmount = (sg.paidAmount || 0) + 11250;
  sg.status = sg.paidAmount >= sg.totalAmount - 0.5 ? 'paid' : 'partial';
  sg.payments.push({
    id: 'pay_disc_59',
    date: '2026-09-22',
    amount: 11250,
    mode: 'other',
    note: 'Tally Discount Journal 59',
    recordedAt: new Date().toISOString(),
  });
}

// 5. Join Commerce: Credit Notes totaling 584 to IN-212
const jc = updatedBills.find(b => b.invoiceNumber === 'IN-212');
if (jc) {
  jc.paidAmount = (jc.paidAmount || 0) + 584;
  jc.payments.push({
    id: 'pay_cn_round',
    date: '2026-09-08',
    amount: 584,
    mode: 'other',
    note: 'Tally Credit Notes (CN-2, CN-4, CN-5)',
    recordedAt: new Date().toISOString(),
  });
}

// 6. Mahindra Holidays: Settle all 6 bills
for (const b of updatedBills) {
  if (b.clientName?.toUpperCase().includes('MAHINDRA HOLIDAYS')) {
    b.paidAmount = b.totalAmount;
    b.status = 'paid';
    b.payments = [
      {
        id: `pay_mh_${b.id}`,
        date: b.invoiceDate,
        amount: b.totalAmount,
        mode: 'bank-transfer',
        bank: 'Axis Bank',
        note: 'Settled as per Tally Ledger (Axis Bank & TDS)',
        recordedAt: new Date().toISOString(),
      }
    ];
  }
}

// 7. Junobo Hotels: GE/ PI-12/2019-20 is a Proforma replaced by GE/49/2019-20
const pi = updatedBills.find(b => b.invoiceNumber.includes('PI-12'));
if (pi) {
  pi.status = 'cancelled';
  pi.paidAmount = 0;
  pi.payments = [];
}
const jReal = updatedBills.find(b => b.invoiceNumber === 'GE/49/2019-20');
if (jReal) {
  jReal.paidAmount = 885000;
  jReal.status = 'paid';
  jReal.payments = [
    {
      id: 'pay_j_46',
      date: '2019-12-12',
      amount: 885000,
      mode: 'bank-transfer',
      bank: 'Axis Bank',
      receiptNo: 'RCP-46',
      note: 'Axis Bank Rcpt 46 & 60',
      recordedAt: new Date().toISOString(),
    }
  ];
}

// 8. The Accessories Store: IN-224 taxable amount in Tally was 45,239
const acc = updatedBills.find(b => b.invoiceNumber === 'IN-224');
if (acc) {
  acc.paidAmount = (acc.paidAmount || 0) + 55399;
}

// Create payload folder
const outDir = './data-ledger-reconciled';
fs.mkdirSync(`${outDir}/bills`, { recursive: true });

for (const b of updatedBills) {
  const filename = String(b.id).replace(/[/\\:*?"<>|]/g, '_') + '.json';
  fs.writeFileSync(`${outDir}/bills/${filename}`, JSON.stringify(b, null, 2), 'utf8');
}

console.log(`Saved ${updatedBills.length} reconciled bills to ${outDir}/bills`);
