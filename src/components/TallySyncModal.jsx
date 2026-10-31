// v1.10.87 - Tally Sync Modal: 1-Click Export to Tally XML (for CA) & Import Masters / Sales with HSN code auto-detection
import { useState } from 'react';
import { X, Download, Upload, CheckCircle, Layers, AlertTriangle, RefreshCw } from 'lucide-react';
import { exportToTallyXml } from '../utils/tallyExport.js';
import { parseTallyXml, detectDuplicateInvoices, resolveDuplicateBill, normalizeItemKey } from '../utils/tallyImport.js';
import {
  saveClient, saveProduct, saveBill, getAllClients, getAllProducts,
  getAllBills, getAllPurchases, getAllReceipts, getProfile,
} from '../store';
import { localToday, belongsToProfile } from '../utils';
import { toast } from './Toast';

export default function TallySyncModal({ show, onClose }) {
  const [activeTab, setActiveTab] = useState('export'); // 'export' | 'import'
  const [period, setPeriod] = useState('month'); // 'month' | 'last-month' | 'fy'
  const [includeSales, setIncludeSales] = useState(true);
  const [includePurchases, setIncludePurchases] = useState(true);
  const [includeReceipts, setIncludeReceipts] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Import state
  const [parsedData, setParsedData] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncingHsn, setIsSyncingHsn] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [duplicateStrategy, setDuplicateStrategy] = useState('keep-both'); // 'keep-both' | 'replace' | 'skip'
  const [duplicateInfo, setDuplicateInfo] = useState(null);

  if (!show) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const [profile, bills, purchases, receipts] = await Promise.all([
        getProfile().catch(() => ({})),
        getAllBills().catch(() => []),
        getAllPurchases().catch(() => []),
        getAllReceipts().catch(() => []),
      ]);

      const activeProfile = profile || {};
      const compName = activeProfile.businessName || 'Business';

      const today = localToday();
      const currentYear = parseInt(today.slice(0, 4), 10);
      const currentMonth = today.slice(0, 7);

      const filterByDate = (dateStr) => {
        if (!dateStr) return false;
        if (period === 'month') return dateStr.startsWith(currentMonth);
        if (period === 'last-month') {
          const d = new Date();
          d.setMonth(d.getMonth() - 1);
          const lm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          return dateStr.startsWith(lm);
        }
        if (period === 'fy') {
          const monthNum = parseInt(today.slice(5, 7), 10);
          const fyStartYear = monthNum >= 4 ? currentYear : currentYear - 1;
          const fyStart = `${fyStartYear}-04-01`;
          const fyEnd = `${fyStartYear + 1}-03-31`;
          return dateStr >= fyStart && dateStr <= fyEnd;
        }
        return true;
      };

      const selectedBills = includeSales
        ? (bills || []).filter((b) => belongsToProfile(b, activeProfile) && filterByDate(b.data?.details?.invoiceDate || b.invoiceDate))
        : [];

      const selectedPurchases = includePurchases
        ? (purchases || []).filter((p) => belongsToProfile(p, activeProfile) && filterByDate(p.date))
        : [];

      const selectedReceipts = includeReceipts
        ? (receipts || []).filter((r) => belongsToProfile(r, activeProfile) && filterByDate(r.date))
        : [];

      if (!selectedBills.length && !selectedPurchases.length && !selectedReceipts.length) {
        toast('No transactions found for the selected period', 'warning');
        setIsExporting(false);
        return;
      }

      const xml = exportToTallyXml({
        companyName: compName,
        bills: selectedBills,
        purchases: selectedPurchases,
        receipts: selectedReceipts,
      });

      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tally-Vouchers-${compName.replace(/[^a-zA-Z0-9]/g, '_')}-${today}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast(`Exported ${selectedBills.length} sales, ${selectedPurchases.length} purchases, ${selectedReceipts.length} receipts for Tally!`, 'success', 6000);
      onClose();
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target.result;
        const bytes = new Uint8Array(buffer);
        let text = '';

        if (bytes[0] === 0xff && bytes[1] === 0xfe) {
          text = new TextDecoder('utf-16le').decode(buffer);
        } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
          text = new TextDecoder('utf-16be').decode(buffer);
        } else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
          text = new TextDecoder('utf-8').decode(buffer);
        } else if (bytes.length > 4 && bytes[1] === 0x00 && bytes[3] === 0x00) {
          text = new TextDecoder('utf-16le').decode(buffer);
        } else {
          try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
          } catch {
            text = new TextDecoder('utf-16le').decode(buffer);
          }
        }

        const existingProducts = await getAllProducts().catch(() => []);
        const res = parseTallyXml(text, { products: existingProducts });
        setParsedData(res);
        setProgressText('');

        if (res.bills?.length) {
          getAllBills().then((existing) => {
            const dupInfo = detectDuplicateInvoices(res.bills, existing || []);
            setDuplicateInfo(dupInfo);
          }).catch(() => {
            const dupInfo = detectDuplicateInvoices(res.bills, []);
            setDuplicateInfo(dupInfo);
          });
        } else {
          setDuplicateInfo(null);
        }

        const totalItems = (res.clients?.length || 0) + (res.products?.length || 0) + (res.bills?.length || 0);
        if (totalItems === 0 && res.errors?.length) {
          toast(res.errors[0], 'error');
        }
      } catch (err) {
        toast('Failed to read file: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleRunImport = async () => {
    if (!parsedData) return;

    if (duplicateInfo?.hasDuplicates && duplicateStrategy === 'replace') {
      const ok = window.confirm(
        'Warning: Replace is selected. This will overwrite existing bills in your database with matching invoice numbers. Are you sure you want to proceed?'
      );
      if (!ok) return;
    }

    setIsImporting(true);

    try {
      let clientsCount = 0;
      let productsCount = 0;
      let billsCount = 0;
      let skippedBills = 0;
      let replacedBills = 0;
      let suffixedBills = 0;

      // 1. Import Masters if present
      if (parsedData.clients?.length || parsedData.products?.length) {
        setProgressText('Importing masters…');
        const [existingClients, existingProducts] = await Promise.all([
          getAllClients().catch(() => []),
          getAllProducts().catch(() => []),
        ]);

        const clientNames = new Set(existingClients.map((c) => (c.name || '').trim().toLowerCase()));
        const productNames = new Set(existingProducts.map((p) => (p.name || '').trim().toLowerCase()));

        for (const c of parsedData.clients || []) {
          if (!clientNames.has((c.name || '').trim().toLowerCase())) {
            await saveClient(c);
            clientsCount++;
          }
        }

        for (const p of parsedData.products || []) {
          if (!productNames.has((p.name || '').trim().toLowerCase())) {
            await saveProduct(p);
            productsCount++;
          }
        }
      }

      // 2. Import Sales Invoices if present
      if (parsedData.bills?.length) {
        const [existingBills, products, profile] = await Promise.all([
          getAllBills().catch(() => []),
          getAllProducts().catch(() => []),
          getProfile().catch(() => ({})),
        ]);

        const existingBillsMap = new Map();
        const usedInvNos = new Set();
        for (const b of existingBills) {
          const key = (b.invoiceNumber || b.id || '').trim().toLowerCase();
          if (key) {
            existingBillsMap.set(key, b);
            usedInvNos.add(key);
          }
        }

        const seenInSession = new Map();
        const allKnownProducts = [...(products || []), ...(parsedData.products || [])];
        const productHsnMap = new Map();
        for (const p of allKnownProducts) {
          if (p && p.name && p.hsn) {
            const code = String(p.hsn).trim();
            if (code) {
              productHsnMap.set(p.name.trim().toLowerCase(), code);
              productHsnMap.set(normalizeItemKey(p.name), code);
            }
          }
        }
        const totalBills = parsedData.bills.length;

        for (let i = 0; i < totalBills; i++) {
          const bill = parsedData.bills[i];
          const res = resolveDuplicateBill(bill, {
            strategy: duplicateStrategy,
            existingBillsMap,
            usedInvNos,
            seenInSession,
          });

          if (res.skip) {
            skippedBills++;
            continue;
          }

          if (res.actionTaken === 'replaced') {
            replacedBills++;
          } else if (res.actionTaken === 'suffixed') {
            suffixedBills++;
          }

          // Backfill line item HSN from inventory if missing and assign profile cleanly without mutating state
          const updatedItems = (res.billToSave.data?.items || []).map((it) => {
            const rawName = (it.name || '').trim();
            const fallbackHsn = productHsnMap.get(rawName.toLowerCase()) ||
                                productHsnMap.get(normalizeItemKey(rawName)) || '';
            return {
              ...it,
              hsn: it.hsn || fallbackHsn,
            };
          });

          const billToSave = {
            ...res.billToSave,
            data: {
              ...res.billToSave.data,
              items: updatedItems,
              ...(profile ? { profile } : {}),
            },
          };

          await saveBill(billToSave, { overwrite: res.shouldOverwrite });
          billsCount++;

          if (i % 25 === 0 || i === totalBills - 1) {
            setProgressText(`Importing invoices (${i + 1}/${totalBills})…`);
          }
        }
      }

      const summaries = [];
      if (billsCount > 0) {
        let detail = `${billsCount} invoices imported`;
        if (suffixedBills > 0) detail += ` (${suffixedBills} duplicates auto-suffixed)`;
        if (replacedBills > 0) detail += ` (${replacedBills} duplicates replaced)`;
        if (skippedBills > 0) detail += ` (${skippedBills} duplicates skipped)`;
        summaries.push(detail);
      }
      if (clientsCount > 0) summaries.push(`${clientsCount} parties`);
      if (productsCount > 0) summaries.push(`${productsCount} products`);

      toast(`Successfully imported ${summaries.join(', ') || 'records'} from Tally!`, 'success', 6000);
      setParsedData(null);
      setDuplicateInfo(null);
      setProgressText('');
      onClose();
    } catch (err) {
      toast('Import failed: ' + err.message, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleSyncExistingHsn = async () => {
    setIsSyncingHsn(true);
    setProgressText('Scanning saved bills for missing HSN codes…');
    try {
      const [bills, products] = await Promise.all([
        getAllBills().catch(() => []),
        getAllProducts().catch(() => []),
      ]);

      if (!bills.length) {
        toast('No saved bills found in database', 'info');
        setIsSyncingHsn(false);
        setProgressText('');
        return;
      }

      if (!products.length) {
        toast('No products found with HSN codes in product catalog', 'warning');
        setIsSyncingHsn(false);
        setProgressText('');
        return;
      }

      const productHsnMap = new Map();
      for (const p of products) {
        if (p && p.name && p.hsn) {
          const code = String(p.hsn).trim();
          if (code) {
            productHsnMap.set(p.name.trim().toLowerCase(), code);
            productHsnMap.set(normalizeItemKey(p.name), code);
          }
        }
      }

      let updatedCount = 0;
      let itemsFilled = 0;

      for (let i = 0; i < bills.length; i++) {
        const b = bills[i];
        const items = b.data?.items || b.items || [];
        let billModified = false;

        const newItems = items.map((it) => {
          if (!it.hsn || !String(it.hsn).trim()) {
            const rawName = (it.name || '').trim();
            const matched = productHsnMap.get(rawName.toLowerCase()) ||
                            productHsnMap.get(normalizeItemKey(rawName));
            if (matched) {
              billModified = true;
              itemsFilled++;
              return { ...it, hsn: matched };
            }
          }
          return it;
        });

        if (billModified) {
          const updatedBill = {
            ...b,
            data: {
              ...(b.data || {}),
              items: newItems,
            },
          };
          await saveBill(updatedBill, { overwrite: true });
          updatedCount++;
        }

        if (i % 25 === 0 || i === bills.length - 1) {
          setProgressText(`Syncing HSN codes (${i + 1}/${bills.length})…`);
        }
      }

      if (updatedCount > 0) {
        toast(`Synced HSN codes! Updated ${itemsFilled} item(s) across ${updatedCount} bill(s).`, 'success', 6000);
      } else {
        toast('All bills already have matching HSN codes or no unmatched items found.', 'info');
      }
    } catch (err) {
      toast('Failed to sync HSN: ' + err.message, 'error');
    } finally {
      setIsSyncingHsn(false);
      setProgressText('');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '640px', padding: '1.5rem' }}>
        <div className="flex justify-between items-center mb-4 pb-2" style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={22} style={{ color: 'var(--primary)' }} />
            <h3 className="section-title" style={{ margin: 0 }}>Tally ERP & Prime Synchronization</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Close"><X size={18} /></button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color, #e5e7eb)', paddingBottom: '0.5rem' }}>
          <button
            type="button"
            className={activeTab === 'export' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setActiveTab('export')}
            style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export for CA (Tally XML)
          </button>
          <button
            type="button"
            className={activeTab === 'import' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setActiveTab('import')}
            style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Upload size={14} /> Import Tally XML (Masters / Sales)
          </button>
        </div>

        {activeTab === 'export' ? (
          <div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.45 }}>
              Generate standard Tally-compatible XML vouchers. Your CA can import this file directly in <strong>Tally Prime / Tally ERP 9</strong> via <em>Import &gt; Transactions</em> without re-punching bills or receipts.
            </p>

            <div className="form-group mb-4">
              <label className="form-label">Period</label>
              <select className="form-input" value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="month">Current Month</option>
                <option value="last-month">Last Month</option>
                <option value="fy">Entire Financial Year</option>
              </select>
            </div>

            <div className="form-group mb-4">
              <label className="form-label" style={{ marginBottom: '0.5rem' }}>Include Vouchers</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.85rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeSales} onChange={(e) => setIncludeSales(e.target.checked)} />
                  <span><strong>Sales Invoices & Credit Notes</strong> (with GST breakdown & inventory items)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={includePurchases} onChange={(e) => setIncludePurchases(e.target.checked)} />
                  <span><strong>Purchase Bills</strong> (inward supplier invoices for ITC)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeReceipts} onChange={(e) => setIncludeReceipts(e.target.checked)} />
                  <span><strong>Payment Receipts</strong> (with <em>Agst Ref</em> invoice settlement)</span>
                </label>
              </div>
            </div>

            <div style={{ background: 'rgba(37,99,235,0.06)', borderRadius: 6, padding: '0.75rem', marginBottom: '1.25rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <strong>How your CA imports this into Tally:</strong>
              <ol style={{ paddingLeft: '1.2rem', margin: '0.3rem 0 0 0' }}>
                <li>Open Tally Prime and select company.</li>
                <li>Click <strong>Import</strong> (Alt+O) &gt; <strong>Transactions</strong>.</li>
                <li>Choose File Format: <strong>XML</strong> and select this downloaded file.</li>
              </ol>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExport}
                disabled={isExporting}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Download size={15} /> {isExporting ? 'Generating XML…' : 'Download Tally XML'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.45 }}>
              Import your existing Tally data into Free GST Billing Software. Supports <strong>Master XML</strong> (parties & products) and <strong>Sales XML</strong> (invoices with line items & GST tax breakup).
            </p>

            <div style={{ background: 'var(--bg-secondary, #f9fafb)', border: '1px dashed var(--border-color, #d1d5db)', borderRadius: 8, padding: '1.25rem', textAlign: 'center', marginBottom: '1rem' }}>
              <Upload size={28} style={{ color: 'var(--primary)', margin: '0 auto 0.5rem auto' }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Select Tally XML File (Masters or Sales)</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Supports <code>Master.xml</code>, <code>Sales.xml</code>, or <code>DayBook.xml</code> exported from Tally ERP 9 / Prime
              </div>
              <input type="file" accept=".xml" onChange={handleFileChange} style={{ fontSize: '0.8rem' }} />
            </div>

            <div style={{
              background: 'rgba(59, 130, 246, 0.05)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: 6,
              padding: '0.65rem 0.85rem',
              marginBottom: '1rem',
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}>
              <div>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>HSN Code Auto-Detection</span>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                  Extracts HSN from XML tags and automatically backfills from your product catalog.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSyncExistingHsn}
                disabled={isSyncingHsn || isImporting}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}
                title="Scan all existing saved bills and auto-fill missing HSN codes from matching products in your inventory">
                <RefreshCw size={12} className={isSyncingHsn ? 'spin' : ''} />
                {isSyncingHsn ? 'Syncing…' : 'Sync HSN to Saved Bills'}
              </button>
            </div>

            {parsedData && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '0.75rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#065f46' }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={14} /> File analyzed successfully!
                </div>
                <div style={{ marginTop: 4, lineHeight: 1.6 }}>
                  {parsedData.bills?.length > 0 && (
                    <div>
                      • <strong>{parsedData.bills.length}</strong> Sales Invoices found (Date range: <strong>{parsedData.bills[0].invoiceDate}</strong> to <strong>{parsedData.bills[parsedData.bills.length - 1].invoiceDate}</strong>).
                    </div>
                  )}
                  {parsedData.clients?.length > 0 && (
                    <div>
                      • <strong>{parsedData.clients.length}</strong> parties (customers & suppliers) found.
                    </div>
                  )}
                  {parsedData.products?.length > 0 && (
                    <div>
                      • <strong>{parsedData.products.length}</strong> stock items with opening quantities found.
                    </div>
                  )}
                </div>
              </div>
            )}

            {duplicateInfo?.hasDuplicates && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: 8,
                padding: '0.85rem',
                marginBottom: '1rem',
                fontSize: '0.82rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b45309', fontWeight: 600, marginBottom: 4 }}>
                  <AlertTriangle size={16} />
                  <span>Duplicate Invoice Numbers Detected ({duplicateInfo.totalDuplicates})</span>
                </div>
                <p style={{ margin: '0 0 0.65rem 0', color: 'var(--text-secondary)', lineHeight: 1.45, fontSize: '0.78rem' }}>
                  Some invoice numbers appear multiple times or match existing bills in your system (e.g. <strong>#{duplicateInfo.duplicateSample.join(', #')}</strong>). Please choose how you want to handle duplicates:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    cursor: 'pointer',
                    background: duplicateStrategy === 'keep-both' ? 'rgba(245, 158, 11, 0.14)' : 'transparent',
                    border: duplicateStrategy === 'keep-both' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                    padding: '6px 8px',
                    borderRadius: 6,
                  }}>
                    <input
                      type="radio"
                      name="dupAction"
                      value="keep-both"
                      checked={duplicateStrategy === 'keep-both'}
                      onChange={() => setDuplicateStrategy('keep-both')}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>Keep Both (Recommended)</strong>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Imports all invoices. Duplicate invoice numbers will be given a suffix (e.g., <code>1723-1</code>, <code>1723-2</code>) so no transactions or totals are lost.
                      </div>
                    </div>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    cursor: 'pointer',
                    background: duplicateStrategy === 'replace' ? 'rgba(245, 158, 11, 0.14)' : 'transparent',
                    border: duplicateStrategy === 'replace' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                    padding: '6px 8px',
                    borderRadius: 6,
                  }}>
                    <input
                      type="radio"
                      name="dupAction"
                      value="replace"
                      checked={duplicateStrategy === 'replace'}
                      onChange={() => setDuplicateStrategy('replace')}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>Replace Existing</strong>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Overwrites existing bills in your database with the incoming records from this Tally file.
                      </div>
                    </div>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    cursor: 'pointer',
                    background: duplicateStrategy === 'skip' ? 'rgba(245, 158, 11, 0.14)' : 'transparent',
                    border: duplicateStrategy === 'skip' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                    padding: '6px 8px',
                    borderRadius: 6,
                  }}>
                    <input
                      type="radio"
                      name="dupAction"
                      value="skip"
                      checked={duplicateStrategy === 'skip'}
                      onChange={() => setDuplicateStrategy('skip')}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>Skip Duplicates</strong>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Keeps existing records intact and ignores any invoice numbers that already exist.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {progressText}
              </span>
              <div className="flex gap-3">
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isImporting}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleRunImport}
                  disabled={!parsedData || isImporting}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle size={15} /> {isImporting ? (progressText || 'Importing…') : 'Import into Database'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
