// v1.10.81 - Tally Sync Modal: 1-Click Export to Tally XML (for CA) & Import from Tally
import { useState } from 'react';
import { X, Download, Upload, CheckCircle, FileText, ArrowRight, Layers, ShieldCheck } from 'lucide-react';
import { exportToTallyXml } from '../utils/tallyExport.js';
import { parseTallyMasterXml } from '../utils/tallyImport.js';
import { saveClient, saveProduct, getAllClients, getAllProducts, getAllBills, getAllPurchases, getAllReceipts, getProfile } from '../store';
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

      // Filter by profile & date period
      const today = localToday();
      const currentYear = parseInt(today.slice(0, 4), 10);
      const currentMonth = today.slice(0, 7); // YYYY-MM
      
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
          // Indian FY starts Apr 1
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
    reader.onload = (evt) => {
      try {
        const buffer = evt.target.result;
        const bytes = new Uint8Array(buffer);
        let text = '';

        // Tally ERP 9 / Prime XML encoding detection (UTF-16LE with or without BOM, UTF-16BE, UTF-8)
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

        const res = parseTallyMasterXml(text);
        setParsedData(res);
        if (res.clients.length === 0 && res.products.length === 0 && res.errors?.length) {
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
    setIsImporting(true);
    let clientsCount = 0;
    let productsCount = 0;

    try {
      const [existingClients, existingProducts] = await Promise.all([
        getAllClients().catch(() => []),
        getAllProducts().catch(() => []),
      ]);

      const clientNames = new Set(existingClients.map((c) => (c.name || '').trim().toLowerCase()));
      const productNames = new Set(existingProducts.map((p) => (p.name || '').trim().toLowerCase()));

      for (const c of parsedData.clients) {
        if (!clientNames.has((c.name || '').trim().toLowerCase())) {
          await saveClient(c);
          clientsCount++;
        }
      }

      for (const p of parsedData.products) {
        if (!productNames.has((p.name || '').trim().toLowerCase())) {
          await saveProduct(p);
          productsCount++;
        }
      }

      toast(`Imported ${clientsCount} new parties and ${productsCount} products from Tally!`, 'success', 6000);
      setParsedData(null);
      onClose();
    } catch (err) {
      toast('Import failed: ' + err.message, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '620px', padding: '1.5rem' }}>
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
            <Upload size={14} /> Import Tally Masters
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
              Migrate your existing Tally customers (Sundry Debtors & Creditors) and stock items into Free GST Billing Software.
            </p>

            <div style={{ background: 'var(--bg-secondary, #f9fafb)', border: '1px dashed var(--border-color, #d1d5db)', borderRadius: 8, padding: '1.25rem', textAlign: 'center', marginBottom: '1rem' }}>
              <Upload size={28} style={{ color: 'var(--primary)', margin: '0 auto 0.5rem auto' }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Select Tally Master XML File</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                In Tally: <em>Display &gt; List of Accounts &gt; Export (Alt+E) &gt; XML Format</em>
              </div>
              <input type="file" accept=".xml" onChange={handleFileChange} style={{ fontSize: '0.8rem' }} />
            </div>

            {parsedData && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '0.75rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#065f46' }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={14} /> File analyzed successfully!
                </div>
                <div style={{ marginTop: 4 }}>
                  • <strong>{parsedData.clients.length}</strong> parties (customers & suppliers) found.<br />
                  • <strong>{parsedData.products.length}</strong> stock items with opening quantities found.
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleRunImport}
                disabled={!parsedData || isImporting}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle size={15} /> {isImporting ? 'Importing…' : 'Import into Database'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
