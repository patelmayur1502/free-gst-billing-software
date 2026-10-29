import fs from 'node:fs';
import path from 'node:path';

function readXml(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  if (buf.length > 4 && buf[1] === 0x00 && buf[3] === 0x00) return new TextDecoder('utf-16le').decode(buf);
  return buf.toString('utf-8');
}

export function parseBankXml(xmlText, bankName, accountType) {
  const receipts = [];
  const chunks = xmlText.split(/<DSPVCHDATE>/i).slice(1);

  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    const dateM = chunk.match(/^([^<]+)<\/DSPVCHDATE>/);
    const dateStr = dateM ? dateM[1].trim() : '';

    const typeM = chunk.match(/<DSPVCHTYPE>([^<]+)<\/DSPVCHTYPE>/);
    if (!typeM || typeM[1].trim() !== 'Rcpt') continue;

    // Convert date DD-M-YYYY or D-M-YYYY to YYYY-MM-DD
    const parts = dateStr.split('-');
    let isoDate = dateStr;
    if (parts.length === 3) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2];
      isoDate = `${y}-${m}-${d}`;
    }

    const vchNoM = chunk.match(/<DSPEXPLVCHNUMBER>\s*\(No\.\s*:\s*([^)]+)\)\s*<\/DSPEXPLVCHNUMBER>/i);
    const vchNo = vchNoM ? vchNoM[1].trim() : '';

    const explAccounts = [...chunk.matchAll(/<DSPVCHEXPLACCOUNT>([^<]+)<\/DSPVCHEXPLACCOUNT>/gi)].map(m => m[1].trim());
    const explCrAmts = [...chunk.matchAll(/<DSPVCHEXPLCRAMTEXCELEXPORT>([\d.]+)<\/DSPVCHEXPLCRAMTEXCELEXPORT>/gi)].map(m => parseFloat(m[1]));

    if (explAccounts.length > 0 && explCrAmts.length > 0) {
      for (let i = 0; i < explAccounts.length; i++) {
        const acc = explAccounts[i].trim();
        const amt = explCrAmts[i] || 0;
        const upper = acc.toUpperCase();
        if (upper !== 'ROUND OF' && upper !== 'DISCOUNT' && amt > 0) {
          receipts.push({
            id: `rcp_${bankName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${vchNo || (idx + 1)}_${i + 1}`,
            receiptNo: vchNo ? `RCP-${vchNo}` : `RCP-${idx + 1}`,
            date: isoDate,
            rawDate: dateStr,
            vchNo,
            bank: bankName,
            accountType,
            partyName: acc,
            amount: amt,
          });
        }
      }
    } else {
      const ledM = chunk.match(/<DSPVCHLEDACCOUNT>([^<]+)<\/DSPVCHLEDACCOUNT>/);
      const drM = chunk.match(/<DSPVCHDRAMT>(-?[\d.]+)<\/DSPVCHDRAMT>/);
      if (ledM && drM) {
        const acc = ledM[1].trim();
        const amt = Math.abs(parseFloat(drM[1])) || 0;
        if (acc !== '(as per details)' && amt > 0) {
          receipts.push({
            id: `rcp_${bankName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${vchNo || (idx + 1)}`,
            receiptNo: vchNo ? `RCP-${vchNo}` : `RCP-${idx + 1}`,
            date: isoDate,
            rawDate: dateStr,
            vchNo,
            bank: bankName,
            accountType,
            partyName: acc,
            amount: amt,
          });
        }
      }
    }
  }

  return receipts;
}

export function reconcileBillsWithReceipts(bills, receipts) {
  // Sort receipts chronologically
  const sortedReceipts = [...receipts].sort((a, b) => new Date(a.date) - new Date(b.date));

  const norm = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const simBills = new Map();
  const billsByNormParty = new Map();

  for (const b of bills) {
    const key = norm(b.clientName);
    if (!billsByNormParty.has(key)) billsByNormParty.set(key, []);

    const sim = {
      ...b,
      paidAmount: 0,
      payments: [],
      status: 'unpaid',
    };
    simBills.set(b.id, sim);
    billsByNormParty.get(key).push(sim);
  }

  // Sort each customer's bills chronologically (oldest first for FIFO)
  for (const list of billsByNormParty.values()) {
    list.sort((a, b) => new Date(a.invoiceDate) - new Date(b.invoiceDate));
  }

  const receiptRecords = [];
  let reconciledAmount = 0;

  for (const r of sortedReceipts) {
    const rKey = norm(r.partyName);
    let customerBills = billsByNormParty.get(rKey);

    if (!customerBills) {
      for (const [cKey, list] of billsByNormParty.entries()) {
        if (cKey.includes(rKey) || rKey.includes(cKey)) {
          customerBills = list;
          break;
        }
      }
    }

    let remainingAmt = r.amount;
    let linkedInvoice = '';

    if (customerBills && customerBills.length > 0) {
      // 1. Try exact amount match first on unpaid bills
      for (const b of customerBills) {
        const due = Math.max(0, (b.totalAmount || 0) - (b.paidAmount || 0));
        if (due > 0 && Math.abs(due - remainingAmt) < 1.0) {
          b.paidAmount = Math.round((b.paidAmount + due) * 100) / 100;
          b.payments.push({
            id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            date: r.date,
            amount: due,
            mode: 'bank-transfer',
            bank: r.bank,
            accountType: r.accountType,
            receiptNo: r.receiptNo,
            note: `${r.bank} (${r.accountType}) · Ref ${r.receiptNo}`,
            recordedAt: new Date().toISOString(),
          });
          reconciledAmount += due;
          remainingAmt -= due;
          linkedInvoice = b.invoiceNumber;
          break;
        }
      }

      // 2. FIFO matching for remaining unpaid bills
      if (remainingAmt > 0) {
        for (const b of customerBills) {
          if (remainingAmt <= 0) break;
          const due = Math.max(0, (b.totalAmount || 0) - (b.paidAmount || 0));
          if (due <= 0) continue;

          const payAmt = Math.round(Math.min(due, remainingAmt) * 100) / 100;
          b.paidAmount = Math.round((b.paidAmount + payAmt) * 100) / 100;
          b.payments.push({
            id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            date: r.date,
            amount: payAmt,
            mode: 'bank-transfer',
            bank: r.bank,
            accountType: r.accountType,
            receiptNo: r.receiptNo,
            note: `${r.bank} (${r.accountType}) · Ref ${r.receiptNo}`,
            recordedAt: new Date().toISOString(),
          });
          reconciledAmount += payAmt;
          remainingAmt -= payAmt;
          if (!linkedInvoice) linkedInvoice = b.invoiceNumber;
        }
      }
    }

    receiptRecords.push({
      id: r.id,
      receiptNo: r.receiptNo,
      date: r.date,
      clientName: r.partyName,
      amount: r.amount,
      paymentMode: 'Bank Transfer',
      bankName: r.bank,
      accountType: r.accountType,
      againstInvoice: linkedInvoice,
      notes: `Tally Bank Receipt (${r.bank} - ${r.accountType})`,
      ownerName: 'Galaxy Enterprises',
      ownerGstin: '27CPPJPP4540J1ZI',
    });
  }

  // Update status for all bills
  let paidCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;

  for (const b of simBills.values()) {
    const tot = b.totalAmount || 0;
    if (tot > 0 && b.paidAmount >= tot - 0.5) {
      b.status = 'paid';
      paidCount++;
    } else if (b.paidAmount > 0) {
      b.status = 'partial';
      partialCount++;
    } else {
      b.status = 'unpaid';
      unpaidCount++;
    }
  }

  return {
    updatedBills: Array.from(simBills.values()),
    receiptRecords,
    stats: {
      totalBills: bills.length,
      paidCount,
      partialCount,
      unpaidCount,
      reconciledAmount: Math.round(reconciledAmount),
      totalReceipts: receiptRecords.length,
    },
  };
}

// Self-run when executed directly
if (process.argv[1] && process.argv[1].endsWith('reconcile-bank-receipts.mjs')) {
  console.log('[v1.10.85] Running bank receipt reconciliation...');
  const axisPath = 'C:/Users/Forum/.gemini/antigravity/brain/7950ca98-e1f6-459d-a49d-deefa7ec3556/.user_uploaded/media_1793273740659_67bea03e.xml';
  const fedPath = 'C:/Users/Forum/.gemini/antigravity/brain/7950ca98-e1f6-459d-a49d-deefa7ec3556/.user_uploaded/media_1793273740690_b2beaabb.xml';

  const axisRcpts = parseBankXml(readXml(axisPath), 'Axis Bank', 'Current Account');
  const fedRcpts = parseBankXml(readXml(fedPath), 'Federal Bank', 'Savings Account');

  console.log(`Parsed ${axisRcpts.length} Axis receipts and ${fedRcpts.length} Federal receipts.`);

  const billsRes = await fetch('https://billing.ecozen.in/api/bills');
  const bills = await billsRes.json();
  console.log(`Loaded ${bills.length} bills from live server.`);

  const { updatedBills, receiptRecords, stats } = reconcileBillsWithReceipts(bills, [...axisRcpts, ...fedRcpts]);
  console.log('Reconciliation Stats:', stats);

  // Write temporary payload directory to upload to server
  const outDir = './data-reconciled';
  fs.mkdirSync(`${outDir}/bills`, { recursive: true });
  fs.mkdirSync(`${outDir}/receipts`, { recursive: true });

  for (const b of updatedBills) {
    const filename = String(b.id).replace(/[/\\:*?"<>|]/g, '_') + '.json';
    fs.writeFileSync(`${outDir}/bills/${filename}`, JSON.stringify(b, null, 2), 'utf8');
  }

  for (const r of receiptRecords) {
    const filename = String(r.id).replace(/[/\\:*?"<>|]/g, '_') + '.json';
    fs.writeFileSync(`${outDir}/receipts/${filename}`, JSON.stringify(r, null, 2), 'utf8');
  }

  console.log(`Saved ${updatedBills.length} bill JSONs and ${receiptRecords.length} receipt JSONs to ${outDir}`);
}
