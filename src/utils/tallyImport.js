// v1.10.85 - Tally Prime & Tally ERP 9 XML Data Importer
// Robust parsing for Masters (Ledgers & Stock) and Vouchers (Sales Invoices).
// Handles UTF-16LE, control codes (&#4;), XML entities, duplicate detection & resolution (keep-both, replace, skip).
import { getStateCode, stateNameForCode } from '../utils.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Unescapes standard XML entities.
 */
export function unescapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Sanitizes XML text by stripping BOM, null bytes, and illegal XML 1.0 control codes.
 * Tally ERP 9 frequently includes &#4; and control entities that break strict XML parsers.
 */
export function sanitizeTallyXml(str) {
  if (!str) return '';
  return str
    .replace(/^\uFEFF/, '')
    .replace(/\0/g, '')
    .replace(/&#(?:[0-8]|1[1-2]|1[4-9]|2[0-9]|3[0-1]);/g, '');
}

/**
 * Parses XML text into a DOM Document.
 */
function parseXmlDocument(xmlText) {
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    return parser.parseFromString(xmlText, 'text/xml');
  }
  return null;
}

/**
 * Extracts text content of first tag with given name.
 */
function getTagText(element, tagName) {
  if (!element) return '';
  const el = element.getElementsByTagName(tagName)[0];
  return el ? (el.textContent || '').trim() : '';
}

/**
 * Parses Tally Masters XML (Ledgers & Stock Items).
 *
 * @param {string} xmlText
 * @returns {Object} { clients: Array, products: Array, errors: Array }
 */
export function parseTallyMasterXml(xmlText) {
  const cleanXml = sanitizeTallyXml(xmlText);
  const clients = [];
  const products = [];
  const errors = [];

  let doc = null;
  try {
    doc = parseXmlDocument(cleanXml);
  } catch {
    doc = null;
  }

  const parserError = doc ? doc.getElementsByTagName('parsererror')[0] : null;
  if (!doc || parserError) {
    return parseTallyMasterRegex(cleanXml);
  }

  // 1. Parse Ledgers (Sundry Debtors & Sundry Creditors)
  const ledgers = doc.getElementsByTagName('LEDGER');
  for (let i = 0; i < ledgers.length; i++) {
    const l = ledgers[i];
    const name = unescapeXml(l.getAttribute('NAME') || getTagText(l, 'NAME'));
    const parent = getTagText(l, 'PARENT').toLowerCase();

    if (parent.includes('debtor') || parent.includes('creditor') || parent.includes('client') || parent.includes('customer')) {
      const gstin = (getTagText(l, 'PARTYGSTIN') || getTagText(l, 'GSTIN')).toUpperCase();
      let state = getTagText(l, 'STATENAME') || getTagText(l, 'STATE');
      if (!state && gstin && gstin.length >= 2) {
        state = stateNameForCode(getStateCode(gstin)) || '';
      }
      const pin = getTagText(l, 'PINCODE');
      const phone = getTagText(l, 'LEDGERMOBILE') || getTagText(l, 'LEDGERPHONE') || getTagText(l, 'PHONE');
      const email = getTagText(l, 'EMAIL');

      const addressNodes = l.getElementsByTagName('ADDRESS');
      const addrLines = [];
      for (let j = 0; j < addressNodes.length; j++) {
        const line = (addressNodes[j].textContent || '').trim();
        if (line) addrLines.push(unescapeXml(line));
      }

      if (name) {
        clients.push({
          id: 'cli_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          name,
          gstin,
          state: state || '',
          country: 'India',
          address: addrLines.join(', '),
          city: '',
          pin: pin || '',
          phone: phone || '',
          email: email || '',
          isSupplier: parent.includes('creditor'),
        });
      }
    }
  }

  // 2. Parse Stock Items
  const stockItems = doc.getElementsByTagName('STOCKITEM');
  for (let i = 0; i < stockItems.length; i++) {
    const s = stockItems[i];
    const name = unescapeXml(s.getAttribute('NAME') || getTagText(s, 'NAME'));
    const unit = getTagText(s, 'BASEUNITS') || getTagText(s, 'BASEUNIT') || 'Nos';
    const hsn = getTagText(s, 'HSNCODE') || getTagText(s, 'HSN');
    const openingBalStr = getTagText(s, 'OPENINGBALANCE');
    const openingRateStr = getTagText(s, 'OPENINGRATE');

    const openingQty = parseFloat(openingBalStr) || 0;
    const rate = parseFloat(openingRateStr) || 0;

    if (name) {
      products.push({
        id: 'prd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name,
        hsn: hsn || '',
        unit: unit || 'Nos',
        rate,
        stock: openingQty,
        taxPercent: 18,
      });
    }
  }

  if (clients.length === 0 && products.length === 0 && cleanXml.includes('<LEDGER')) {
    return parseTallyMasterRegex(cleanXml);
  }

  return { clients, products, errors };
}

/**
 * Regex-based parser for Tally Masters.
 */
export function parseTallyMasterRegex(xmlText) {
  const cleanXml = sanitizeTallyXml(xmlText);
  const clients = [];
  const products = [];
  const errors = [];

  const ledgerMatches = cleanXml.matchAll(/<LEDGER\b[^>]*>([\s\S]*?)<\/LEDGER>/gi);
  for (const match of ledgerMatches) {
    const fullTag = match[0];
    const body = match[1];

    const nameM = fullTag.match(/NAME="([^"]+)"/i) || body.match(/<NAME>([^<]+)<\/NAME>/i);
    const parentM = body.match(/<PARENT>([^<]+)<\/PARENT>/i);
    if (!parentM) continue;
    const parent = parentM[1].toLowerCase();

    if (parent.includes('debtor') || parent.includes('creditor') || parent.includes('client') || parent.includes('customer')) {
      const gstinMatch = body.match(/<(?:PARTYGSTIN|GSTIN)>([^<]+)<\/(?:PARTYGSTIN|GSTIN)>/i);
      const stateMatch = body.match(/<(?:STATENAME|STATE)>([^<]+)<\/(?:STATENAME|STATE)>/i);
      const pinMatch = body.match(/<PINCODE>([^<]+)<\/PINCODE>/i);
      const phoneMatch = body.match(/<(?:LEDGERMOBILE|LEDGERPHONE|PHONE)>([^<]+)<\/(?:LEDGERMOBILE|LEDGERPHONE|PHONE)>/i);
      const emailMatch = body.match(/<EMAIL>([^<]+)<\/EMAIL>/i);

      const addrLines = [...body.matchAll(/<ADDRESS>([^<]+)<\/ADDRESS>/gi)]
        .map((m) => (m[1] || '').trim())
        .filter(Boolean);

      const gstin = gstinMatch ? gstinMatch[1].trim().toUpperCase() : '';
      let state = stateMatch ? stateMatch[1].trim() : '';
      if (!state && gstin && gstin.length >= 2) {
        state = stateNameForCode(getStateCode(gstin)) || '';
      }

      const rawName = nameM ? nameM[1].trim() : '';
      if (rawName) {
        clients.push({
          id: 'cli_' + Math.random().toString(36).slice(2, 9),
          name: unescapeXml(rawName),
          gstin,
          state: state || '',
          country: 'India',
          address: addrLines.map(unescapeXml).join(', '),
          city: '',
          pin: pinMatch ? pinMatch[1].trim() : '',
          phone: phoneMatch ? phoneMatch[1].trim() : '',
          email: emailMatch ? emailMatch[1].trim() : '',
          isSupplier: parent.includes('creditor'),
        });
      }
    }
  }

  const stockMatches = cleanXml.matchAll(/<STOCKITEM\b[^>]*>([\s\S]*?)<\/STOCKITEM>/gi);
  for (const match of stockMatches) {
    const fullTag = match[0];
    const body = match[1];

    const nameM = fullTag.match(/NAME="([^"]+)"/i) || body.match(/<NAME>([^<]+)<\/NAME>/i);
    const unitM = body.match(/<(?:BASEUNITS|BASEUNIT)>([^<]+)<\/(?:BASEUNITS|BASEUNIT)>/i);
    const hsnM = body.match(/<(?:HSNCODE|HSN)>([^<]+)<\/(?:HSNCODE|HSN)>/i);
    const balM = body.match(/<OPENINGBALANCE>([^<]+)<\/OPENINGBALANCE>/i);
    const rateM = body.match(/<OPENINGRATE>([^<]+)<\/OPENINGRATE>/i);

    const rawName = nameM ? nameM[1].trim() : '';
    if (rawName) {
      products.push({
        id: 'prd_' + Math.random().toString(36).slice(2, 9),
        name: unescapeXml(rawName),
        hsn: hsnM ? hsnM[1].trim() : '',
        unit: unitM ? unitM[1].trim() : 'Nos',
        rate: rateM ? parseFloat(rateM[1]) || 0 : 0,
        stock: balM ? parseFloat(balM[1]) || 0 : 0,
        taxPercent: 18,
      });
    }
  }

  return { clients, products, errors };
}

/**
 * Parses Tally Sales Vouchers XML (DayBook / Sales Register exports).
 * Tracks raw voucher numbers and duplicate occurrences for user-guided resolution.
 *
 * @param {string} xmlText
 * @param {Object} [options]
 * @param {boolean} [options.autoSuffix=false] - If true, auto-suffixes duplicates during parse.
 * @returns {Object} { bills: Array, errors: Array }
 */
export function parseTallySalesVouchersXml(xmlText, { autoSuffix = false } = {}) {
  const cleanXml = sanitizeTallyXml(xmlText);
  const bills = [];
  const errors = [];
  const seenNumbers = new Map();

  const vchMatches = cleanXml.matchAll(/<VOUCHER\b[^>]*>([\s\S]*?)<\/VOUCHER>/gi);
  for (const match of vchMatches) {
    const fullTag = match[0];
    const body = match[1];

    const typeM = fullTag.match(/VCHTYPE="([^"]+)"/i) || body.match(/<VOUCHERTYPENAME>([^<]+)<\/VOUCHERTYPENAME>/i);
    const vchType = typeM ? typeM[1].trim() : 'Sales';
    const isCreditNote = vchType.toLowerCase().includes('credit');
    const isSales = vchType.toLowerCase().includes('sale') || vchType.toLowerCase().includes('invoice');

    if (!isSales && !isCreditNote) continue;

    // Check if cancelled in Tally
    const isCancelledM = body.match(/<ISCANCELLED>([^<]+)<\/ISCANCELLED>/i);
    const isCancelled = isCancelledM && isCancelledM[1].trim().toLowerCase() === 'yes';

    // Date YYYYMMDD -> YYYY-MM-DD
    const dateM = body.match(/<DATE>(\d{4})(\d{2})(\d{2})<\/DATE>/i);
    const invoiceDate = dateM ? `${dateM[1]}-${dateM[2]}-${dateM[3]}` : '';

    // Invoice number
    const invNoM = body.match(/<VOUCHERNUMBER>([^<]+)<\/VOUCHERNUMBER>/i) || body.match(/<REFERENCE>([^<]+)<\/REFERENCE>/i);
    const rawInvNo = invNoM ? unescapeXml(invNoM[1].trim()) : '';

    if (!rawInvNo || !invoiceDate) continue;

    // Track duplicate occurrences within the file
    const lowerKey = rawInvNo.toLowerCase();
    const prevCount = seenNumbers.get(lowerKey) || 0;
    const duplicateIndex = prevCount;
    seenNumbers.set(lowerKey, prevCount + 1);

    const invoiceNumber = (autoSuffix && duplicateIndex > 0)
      ? `${rawInvNo}-${duplicateIndex}`
      : rawInvNo;

    // Party details
    const partyNameM = body.match(/<PARTYNAME>([^<]+)<\/PARTYNAME>/i) ||
                       body.match(/<PARTYLEDGERNAME>([^<]+)<\/PARTYLEDGERNAME>/i) ||
                       body.match(/<BASICBUYERNAME>([^<]+)<\/BASICBUYERNAME>/i);
    const partyName = partyNameM ? unescapeXml(partyNameM[1].trim()) : 'Cash Customer';

    const gstinM = body.match(/<PARTYGSTIN>([^<]+)<\/PARTYGSTIN>/i) || body.match(/<CONSIGNEEGSTIN>([^<]+)<\/CONSIGNEEGSTIN>/i);
    const gstin = gstinM ? gstinM[1].trim().toUpperCase() : '';

    const stateM = body.match(/<STATENAME>([^<]+)<\/STATENAME>/i) ||
                   body.match(/<CONSIGNEESTATENAME>([^<]+)<\/CONSIGNEESTATENAME>/i) ||
                   body.match(/<PLACEOFSUPPLY>([^<]+)<\/PLACEOFSUPPLY>/i);
    let state = stateM ? unescapeXml(stateM[1].trim()) : '';
    if (!state && gstin && gstin.length >= 2) {
      state = stateNameForCode(getStateCode(gstin)) || '';
    }

    const posM = body.match(/<PLACEOFSUPPLY>([^<]+)<\/PLACEOFSUPPLY>/i);
    const placeOfSupply = posM ? unescapeXml(posM[1].trim()) : (state || '');

    const addrLines = [...body.matchAll(/<ADDRESS>([^<]+)<\/ADDRESS>/gi)]
      .map((m) => unescapeXml((m[1] || '').trim()))
      .filter(Boolean);

    const narrationM = body.match(/<NARRATION>([^<]+)<\/NARRATION>/i);
    const narration = narrationM ? unescapeXml(narrationM[1].trim()) : '';

    // Ledger tax & total breakdown
    const ledgerEntries = [...body.matchAll(/<(?:LEDGERENTRIES|ALLLEDGERENTRIES)\.LIST>([\s\S]*?)<\/(?:LEDGERENTRIES|ALLLEDGERENTRIES)\.LIST>/gi)];
    let totalTaxPercent = 0;
    let cgst = 0, sgst = 0, igst = 0, cess = 0, roundOff = 0, partyTotal = 0;

    for (const le of ledgerEntries) {
      const lNameM = le[1].match(/<LEDGERNAME>([^<]+)<\/LEDGERNAME>/i);
      const lAmtM = le[1].match(/<AMOUNT>([^<]+)<\/AMOUNT>/i);
      const lName = lNameM ? unescapeXml(lNameM[1].trim()) : '';
      const lAmt = lAmtM ? parseFloat(lAmtM[1]) || 0 : 0;

      const rateFromLedger = lName.match(/(\d+(?:\.\d+)?)\s*%/);
      const rateFromTag = le[1].match(/<BASICRATEOFINVOICETAX>\s*([\d.]+)/i);
      const detectedRate = rateFromTag ? parseFloat(rateFromTag[1]) : (rateFromLedger ? parseFloat(rateFromLedger[1]) : 0);

      const upper = lName.toUpperCase();
      if (upper.includes('CGST')) {
        cgst += Math.abs(lAmt);
        if (detectedRate) totalTaxPercent = Math.max(totalTaxPercent, detectedRate * 2);
      } else if (upper.includes('SGST') || upper.includes('UTGST')) {
        sgst += Math.abs(lAmt);
        if (detectedRate) totalTaxPercent = Math.max(totalTaxPercent, detectedRate * 2);
      } else if (upper.includes('IGST')) {
        igst += Math.abs(lAmt);
        if (detectedRate) totalTaxPercent = Math.max(totalTaxPercent, detectedRate);
      } else if (upper.includes('CESS')) {
        cess += Math.abs(lAmt);
      } else if (upper.includes('ROUND')) {
        roundOff += lAmt;
      } else if (upper === partyName.toUpperCase() || le[1].includes('<ISPARTYLEDGER>Yes</ISPARTYLEDGER>')) {
        partyTotal = Math.abs(lAmt);
      }
    }

    if (!totalTaxPercent) {
      totalTaxPercent = (cgst + sgst > 0 || igst > 0) ? 18 : 0;
    }

    // Inventory line items
    const items = [];
    const invMatches = [...body.matchAll(/<(?:INVENTORYENTRIES|ALLINVENTORYENTRIES)\.LIST>([\s\S]*?)<\/(?:INVENTORYENTRIES|ALLINVENTORYENTRIES)\.LIST>/gi)];

    for (const ie of invMatches) {
      const stockItemM = ie[1].match(/<STOCKITEMNAME>([^<]+)<\/STOCKITEMNAME>/i);
      const rateM = ie[1].match(/<RATE>([^<]+)<\/RATE>/i);
      const billedQtyM = ie[1].match(/<BILLEDQTY>([^<]+)<\/BILLEDQTY>/i) || ie[1].match(/<ACTUALQTY>([^<]+)<\/ACTUALQTY>/i);
      const amtM = ie[1].match(/<AMOUNT>([^<]+)<\/AMOUNT>/i);
      const discountM = ie[1].match(/<DISCOUNT>([^<]+)<\/DISCOUNT>/i);
      const hsnM = ie[1].match(/<HSNCODE>([^<]+)<\/HSNCODE>/i) || ie[1].match(/<HSN>([^<]+)<\/HSN>/i);

      let quantity = 1;
      let unit = 'Nos';
      if (billedQtyM) {
        const qm = billedQtyM[1].match(/([\d.-]+)\s*([a-zA-Z]*)/);
        if (qm) {
          quantity = parseFloat(qm[1]) || 1;
          unit = qm[2]?.trim() || 'Nos';
        }
      }

      let rate = 0;
      if (rateM) {
        const rm = rateM[1].match(/([\d.-]+)/);
        if (rm) rate = parseFloat(rm[1]) || 0;
      }

      const lineAmt = amtM ? Math.abs(parseFloat(amtM[1]) || 0) : quantity * rate;
      const discount = discountM ? parseFloat(discountM[1]) || 0 : 0;

      items.push({
        id: 'item_' + Math.random().toString(36).slice(2, 7),
        name: stockItemM ? unescapeXml(stockItemM[1].trim()) : 'Item',
        hsn: hsnM ? hsnM[1].trim() : '',
        quantity,
        unit,
        rate: rate || (quantity > 0 ? r2(lineAmt / quantity) : 0),
        discount,
        taxPercent: totalTaxPercent,
        cessPercent: 0,
      });
    }

    // Fallback if no inventory entries (service / lumpsum invoice)
    if (items.length === 0) {
      const taxable = partyTotal > 0 ? (partyTotal - (cgst + sgst + igst + cess + roundOff)) : 0;
      items.push({
        id: 'item_srv_1',
        name: 'Sales / Service',
        hsn: '',
        quantity: 1,
        unit: 'Nos',
        rate: r2(taxable),
        discount: 0,
        taxPercent: totalTaxPercent,
        cessPercent: 0,
      });
    }

    const subtotal = items.reduce((acc, it) => acc + (it.quantity * it.rate), 0);
    const computedTotal = partyTotal || r2(subtotal + cgst + sgst + igst + cess + roundOff);
    const docType = isCreditNote ? 'credit-note' : 'tax-invoice';

    bills.push({
      id: invoiceNumber,
      clientName: partyName,
      invoiceNumber,
      rawInvoiceNumber: rawInvNo,
      duplicateIndex,
      isDuplicateInFile: duplicateIndex > 0,
      invoiceDate,
      invoiceType: docType,
      currency: 'INR',
      totalAmount: r2(computedTotal),
      totalTaxAmount: r2(cgst + sgst + igst + cess),
      status: isCancelled ? 'cancelled' : 'unpaid',
      paidAmount: 0,
      payments: [],
      originalTallyNumber: rawInvNo,
      importedFrom: 'tally-xml',
      importedAt: new Date().toISOString(),
      data: {
        details: {
          invoiceNumber,
          invoiceDate,
          dueDate: '',
          placeOfSupply,
        },
        client: {
          name: partyName,
          gstin,
          state,
          country: 'India',
          address: addrLines.join(', '),
          pin: '',
          phone: '',
          email: '',
        },
        items,
        totals: {
          subtotal: r2(subtotal),
          totalTaxAmount: r2(cgst + sgst + igst + cess),
          cgst: r2(cgst),
          sgst: r2(sgst),
          igst: r2(igst),
          cess: r2(cess),
          roundOff: r2(roundOff),
          total: r2(computedTotal),
        },
        invoiceType: docType,
        customTerms: '',
        customNotes: narration,
        extraSections: [],
        invoiceOptions: { showGST: true },
        taxInclusive: false,
      },
    });
  }

  return { bills, errors };
}

/**
 * Master parser for any Tally XML file.
 * Auto-detects whether the file contains Masters, Vouchers, or both.
 *
 * @param {string} xmlText
 * @param {Object} [options]
 * @returns {Object} { isMaster: boolean, isVoucher: boolean, clients: Array, products: Array, bills: Array, errors: Array }
 */
export function parseTallyXml(xmlText, options = {}) {
  const cleanXml = sanitizeTallyXml(xmlText);
  const isMaster = cleanXml.includes('<LEDGER') || cleanXml.includes('<STOCKITEM');
  const isVoucher = cleanXml.includes('<VOUCHER');

  let masters = { clients: [], products: [], errors: [] };
  let vouchers = { bills: [], errors: [] };

  if (isMaster) {
    masters = parseTallyMasterXml(cleanXml);
  }
  if (isVoucher) {
    vouchers = parseTallySalesVouchersXml(cleanXml, options);
  }

  return {
    isMaster,
    isVoucher,
    clients: masters.clients,
    products: masters.products,
    bills: vouchers.bills,
    errors: [...masters.errors, ...vouchers.errors],
  };
}

/**
 * Analyzes incoming bills for duplicate invoice numbers within the file and against existing bills in DB.
 *
 * @param {Array} incomingBills - Parsed bills from XML
 * @param {Array} existingBills - Bills currently saved in DB
 * @returns {Object} Duplicate analysis report
 */
export function detectDuplicateInvoices(incomingBills = [], existingBills = []) {
  const existingMap = new Map();
  for (const b of existingBills) {
    const key = (b.invoiceNumber || b.id || '').trim().toLowerCase();
    if (key) existingMap.set(key, b);
  }

  const seenInFile = new Map();
  let duplicatesInFileCount = 0;
  let duplicatesInDbCount = 0;
  const duplicateNumbers = new Set();

  for (const b of incomingBills) {
    const rawNo = (b.rawInvoiceNumber || b.invoiceNumber || b.id || '').trim();
    const key = rawNo.toLowerCase();
    if (!key) continue;

    const countInFile = seenInFile.get(key) || 0;
    if (countInFile > 0) {
      duplicatesInFileCount++;
      duplicateNumbers.add(rawNo);
    }
    seenInFile.set(key, countInFile + 1);

    if (existingMap.has(key)) {
      duplicatesInDbCount++;
      duplicateNumbers.add(rawNo);
    }
  }

  const totalDuplicates = duplicatesInFileCount + duplicatesInDbCount;
  return {
    hasDuplicates: totalDuplicates > 0,
    duplicatesInFileCount,
    duplicatesInDbCount,
    totalDuplicates,
    duplicateSample: Array.from(duplicateNumbers).slice(0, 5),
  };
}

/**
 * Resolves an individual bill's invoice number and overwrite status based on chosen strategy.
 *
 * @param {Object} bill - Incoming bill
 * @param {Object} context - { strategy: 'keep-both'|'replace'|'skip', existingBillsMap: Map, usedInvNos: Set, seenInSession: Map }
 * @returns {Object} { skip?: boolean, billToSave?: Object, shouldOverwrite?: boolean, actionTaken: 'new'|'suffixed'|'replaced'|'skipped' }
 */
export function resolveDuplicateBill(bill, context) {
  const { strategy = 'keep-both', existingBillsMap = new Map(), usedInvNos = new Set(), seenInSession = new Map() } = context;

  const rawNo = (bill.rawInvoiceNumber || bill.invoiceNumber || bill.id || '').trim();
  const rawKey = rawNo.toLowerCase();

  const isDuplicate = usedInvNos.has(rawKey) || (seenInSession.get(rawKey) || 0) > 0;
  seenInSession.set(rawKey, (seenInSession.get(rawKey) || 0) + 1);

  if (!isDuplicate) {
    usedInvNos.add(rawKey);
    return {
      billToSave: {
        ...bill,
        id: rawNo,
        invoiceNumber: rawNo,
        data: {
          ...bill.data,
          details: {
            ...(bill.data?.details || {}),
            invoiceNumber: rawNo,
          },
        },
      },
      shouldOverwrite: false,
      actionTaken: 'new',
    };
  }

  // Duplicate resolution
  if (strategy === 'skip') {
    return { skip: true, actionTaken: 'skipped' };
  }

  if (strategy === 'replace') {
    const existing = existingBillsMap.get(rawKey);
    const targetId = existing?.id || rawNo;
    const targetInvNo = existing?.invoiceNumber || rawNo;
    return {
      billToSave: {
        ...bill,
        id: targetId,
        invoiceNumber: targetInvNo,
        data: {
          ...bill.data,
          details: {
            ...(bill.data?.details || {}),
            invoiceNumber: targetInvNo,
          },
        },
      },
      shouldOverwrite: true,
      actionTaken: 'replaced',
    };
  }

  // Default: 'keep-both' -> find unique suffix
  let suffix = 1;
  let candidate = `${rawNo}-${suffix}`;
  while (usedInvNos.has(candidate.toLowerCase())) {
    suffix++;
    candidate = `${rawNo}-${suffix}`;
  }
  usedInvNos.add(candidate.toLowerCase());

  return {
    billToSave: {
      ...bill,
      id: candidate,
      invoiceNumber: candidate,
      data: {
        ...bill.data,
        details: {
          ...(bill.data?.details || {}),
          invoiceNumber: candidate,
        },
      },
    },
    shouldOverwrite: false,
    actionTaken: 'suffixed',
  };
}
