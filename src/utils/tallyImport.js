// v1.10.81 - Tally Prime & Tally ERP 9 XML Data Importer
// Parses Tally Master.xml (Ledgers & Stock Items) and DayBook.xml
// into clients, products, and invoices.

/**
 * Parses XML text into a DOM Document.
 */
function parseXmlDocument(xmlText) {
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    return parser.parseFromString(xmlText, 'text/xml');
  }
  // In Node.js environment without DOMParser, simple fallback or mock
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
  const clients = [];
  const products = [];
  const errors = [];

  const doc = parseXmlDocument(xmlText);
  if (!doc) {
    // Regex-based lightweight parser for Node/headless
    return parseTallyMasterRegex(xmlText);
  }

  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    errors.push('Malformed XML: ' + (parserError.textContent || 'Unknown error'));
    return { clients, products, errors };
  }

  // 1. Parse Ledgers (Sundry Debtors & Sundry Creditors)
  const ledgers = doc.getElementsByTagName('LEDGER');
  for (let i = 0; i < ledgers.length; i++) {
    const l = ledgers[i];
    const name = l.getAttribute('NAME') || getTagText(l, 'NAME');
    const parent = getTagText(l, 'PARENT').toLowerCase();

    // Include Sundry Debtors (customers) and Sundry Creditors (vendors)
    if (parent.includes('debtor') || parent.includes('creditor') || parent.includes('client') || parent.includes('customer')) {
      const gstin = getTagText(l, 'PARTYGSTIN') || getTagText(l, 'GSTIN');
      const state = getTagText(l, 'STATENAME') || getTagText(l, 'STATE');
      const pin = getTagText(l, 'PINCODE');
      const phone = getTagText(l, 'LEDGERMOBILE') || getTagText(l, 'LEDGERPHONE');
      const email = getTagText(l, 'EMAIL');

      // Address list
      const addressNodes = l.getElementsByTagName('ADDRESS');
      const addrLines = [];
      for (let j = 0; j < addressNodes.length; j++) {
        const line = (addressNodes[j].textContent || '').trim();
        if (line) addrLines.push(line);
      }

      if (name) {
        clients.push({
          id: 'cli_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          name,
          gstin: gstin.toUpperCase(),
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
    const name = s.getAttribute('NAME') || getTagText(s, 'NAME');
    const unit = getTagText(s, 'BASEUNITS') || 'Nos';
    const hsn = getTagText(s, 'HSNCODE') || getTagText(s, 'HSN');
    const openingBalStr = getTagText(s, 'OPENINGBALANCE');
    const openingRateStr = getTagText(s, 'OPENINGRATE');

    // Parse opening balance numbers (e.g., "100 Nos" -> 100)
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
        taxPercent: 18, // Default GST rate
      });
    }
  }

  return { clients, products, errors };
}

/**
 * Regex-based parser for Tally Masters when DOMParser is unavailable.
 */
export function parseTallyMasterRegex(xmlText) {
  const clients = [];
  const products = [];
  const errors = [];

  const ledgerMatches = xmlText.matchAll(/<LEDGER\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/LEDGER>/gi);
  for (const match of ledgerMatches) {
    const name = match[1];
    const body = match[2];
    const parentMatch = body.match(/<PARENT>([^<]+)<\/PARENT>/i);
    const parent = parentMatch ? parentMatch[1].toLowerCase() : '';

    if (parent.includes('debtor') || parent.includes('creditor')) {
      const gstinMatch = body.match(/<(?:PARTYGSTIN|GSTIN)>([^<]+)<\/(?:PARTYGSTIN|GSTIN)>/i);
      const stateMatch = body.match(/<(?:STATENAME|STATE)>([^<]+)<\/(?:STATENAME|STATE)>/i);
      const pinMatch = body.match(/<PINCODE>([^<]+)<\/PINCODE>/i);

      clients.push({
        id: 'cli_' + Math.random().toString(36).slice(2, 9),
        name: name.trim(),
        gstin: gstinMatch ? gstinMatch[1].trim().toUpperCase() : '',
        state: stateMatch ? stateMatch[1].trim() : '',
        country: 'India',
        address: '',
        pin: pinMatch ? pinMatch[1].trim() : '',
        isSupplier: parent.includes('creditor'),
      });
    }
  }

  const stockMatches = xmlText.matchAll(/<STOCKITEM\s+NAME="([^"]+)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi);
  for (const match of stockMatches) {
    const name = match[1];
    const body = match[2];
    const unitMatch = body.match(/<BASEUNITS>([^<]+)<\/BASEUNITS>/i);
    const hsnMatch = body.match(/<HSNCODE>([^<]+)<\/HSNCODE>/i);
    const balMatch = body.match(/<OPENINGBALANCE>([^<]+)<\/OPENINGBALANCE>/i);

    products.push({
      id: 'prd_' + Math.random().toString(36).slice(2, 9),
      name: name.trim(),
      hsn: hsnMatch ? hsnMatch[1].trim() : '',
      unit: unitMatch ? unitMatch[1].trim() : 'Nos',
      rate: 0,
      stock: balMatch ? parseFloat(balMatch[1]) || 0 : 0,
      taxPercent: 18,
    });
  }

  return { clients, products, errors };
}
