// v1.10.83 - Tally Prime & Tally ERP 9 XML Data Importer
// Robust parsing for UTF-16LE, control codes (&#4;), XML entities, and address lists.
import { getStateCode, stateNameForCode } from '../utils.js';

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
 * Handles both DOMParser (when available) and robust regex fallback.
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
  // If DOMParser is unavailable or fails due to quirky/massive Tally XML, fallback to regex
  if (!doc || parserError) {
    return parseTallyMasterRegex(cleanXml);
  }

  // 1. Parse Ledgers (Sundry Debtors & Sundry Creditors)
  const ledgers = doc.getElementsByTagName('LEDGER');
  for (let i = 0; i < ledgers.length; i++) {
    const l = ledgers[i];
    const name = unescapeXml(l.getAttribute('NAME') || getTagText(l, 'NAME'));
    const parent = getTagText(l, 'PARENT').toLowerCase();

    // Include Sundry Debtors (customers) and Sundry Creditors (vendors)
    if (parent.includes('debtor') || parent.includes('creditor') || parent.includes('client') || parent.includes('customer')) {
      const gstin = (getTagText(l, 'PARTYGSTIN') || getTagText(l, 'GSTIN')).toUpperCase();
      let state = getTagText(l, 'STATENAME') || getTagText(l, 'STATE');
      if (!state && gstin && gstin.length >= 2) {
        state = stateNameForCode(getStateCode(gstin)) || '';
      }
      const pin = getTagText(l, 'PINCODE');
      const phone = getTagText(l, 'LEDGERMOBILE') || getTagText(l, 'LEDGERPHONE') || getTagText(l, 'PHONE');
      const email = getTagText(l, 'EMAIL');

      // Address list
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

  // If DOMParser somehow extracted 0 items from a non-empty document, attempt regex parsing
  if (clients.length === 0 && products.length === 0 && cleanXml.includes('<LEDGER')) {
    return parseTallyMasterRegex(cleanXml);
  }

  return { clients, products, errors };
}

/**
 * Regex-based parser for Tally Masters.
 * Robust against malformed XML, large XML dumps, and unescaped entities.
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
