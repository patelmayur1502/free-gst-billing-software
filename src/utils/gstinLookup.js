// v1.10.82 - GSTIN Taxpayer Lookup Engine & Official GSTN Schema Parser
// Supports local database cache, external GSP API query,
// official GSTN schema parsing (lgnm, tradeNam, pradr), and portal handshake.

import { decodeGstin } from '../utils.js';

/**
 * Parses official GSTN taxpayer payload into standard Client fields.
 * Handles official parameters: lgnm, tradeNam, sts, dty, rgdt, einvoiceStatus, pradr (addr, bno, bnm, st, loc, stcd, pncd)
 *
 * @param {Object} data
 * @returns {Object|null}
 */
export function parseOfficialGstnPayload(data) {
  if (!data) return null;
  const tp = data.taxpayer || data.data || data;
  const pradr = tp.pradr || {};
  const addr = pradr.addr || {};

  // Build clean full address line
  const addressParts = [
    addr.bno ? `Door ${addr.bno}` : '',
    addr.flno ? `Floor ${addr.flno}` : '',
    addr.bnm,
    addr.st,
    addr.loc,
  ].filter(Boolean);

  const fullAddress = addressParts.join(', ') || tp.address || '';
  const legalName = tp.lgnm || tp.legalName || tp.name || '';
  const tradeName = tp.tradeNam || tp.tradeName || legalName;
  const state = addr.stcd || tp.stcd || tp.state || '';
  const pin = String(addr.pncd || tp.pncd || tp.pin || '').trim();
  const city = addr.loc || tp.city || '';
  const status = tp.sts || tp.status || 'Active';
  const taxpayerType = tp.dty || tp.taxpayerType || 'Regular';

  return {
    source: 'gstn_api',
    gstin: tp.gstin || '',
    name: legalName || tradeName,
    tradeName,
    address: fullAddress,
    city,
    pin,
    state,
    status: `${status} (${taxpayerType})`,
    isActive: String(status).toLowerCase().includes('active'),
    taxpayerType,
    einvoiceEnabled: String(tp.einvoiceStatus || '').toLowerCase() === 'yes',
  };
}

/**
 * Searches local clients and previous invoices for matching GSTIN.
 *
 * @param {string} gstin
 * @param {Object} data
 * @param {Array} [data.clients]
 * @param {Array} [data.bills]
 * @returns {Object|null}
 */
export function lookupGstinLocal(gstin, { clients = [], bills = [] } = {}) {
  const target = String(gstin || '').trim().toUpperCase();
  if (target.length !== 15) return null;

  // 1. Search clients
  for (const c of clients) {
    if (String(c.gstin || '').trim().toUpperCase() === target) {
      return {
        source: 'local_client',
        name: c.name || '',
        tradeName: c.tradeName || c.name || '',
        address: c.address || '',
        city: c.city || '',
        pin: c.pin || '',
        state: c.state || '',
        pan: target.slice(2, 12),
        status: 'Active (from database)',
      };
    }
  }

  // 2. Search past bills
  for (const b of bills) {
    const bg = String(b.data?.client?.gstin || b.clientGstin || '').trim().toUpperCase();
    if (bg === target) {
      const bc = b.data?.client || {};
      return {
        source: 'local_bill',
        name: bc.name || b.clientName || '',
        tradeName: bc.tradeName || bc.name || '',
        address: bc.address || '',
        city: bc.city || '',
        pin: bc.pin || '',
        state: bc.state || '',
        pan: target.slice(2, 12),
        status: 'Active (from past bill)',
      };
    }
  }

  return null;
}

/**
 * Resolves GSTIN taxpayer info via backend proxy or configured provider.
 *
 * @param {string} gstin
 * @returns {Promise<Object>}
 */
export async function lookupGstinOnline(gstin) {
  const target = String(gstin || '').trim().toUpperCase();
  const decoded = decodeGstin(target);
  if (!decoded) {
    throw new Error('Invalid 15-character GSTIN format');
  }

  try {
    const res = await fetch(`/api/gstin-lookup/${encodeURIComponent(target)}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.ok && data.taxpayer) {
        return parseOfficialGstnPayload(data.taxpayer);
      }
    }
  } catch {
    // Network or server endpoint unavailable - fall back to offline decoder
  }

  // Offline decode fallback
  return {
    source: 'offline_decode',
    gstin: target,
    name: '',
    state: decoded.state || '',
    stateCode: decoded.stateCode,
    pan: decoded.pan,
    entityType: decoded.entityType,
    status: decoded.checksumOk ? 'Valid GSTIN format' : 'Checksum mismatch',
  };
}

/**
 * Copies GSTIN to clipboard and opens the official GST portal search.
 *
 * @param {string} gstin
 */
export function openGstPortalVerification(gstin) {
  const target = String(gstin || '').trim().toUpperCase();
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(target).catch(() => {});
  }
  const url = `https://services.gst.gov.in/services/searchtp`;
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
