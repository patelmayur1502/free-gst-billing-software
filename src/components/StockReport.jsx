// v1.10.81 - Enhanced Stock Report: Closing stock, Movement Ledger (Opening + In - Out = Closing) & Party Drilldown
import { useEffect, useState } from 'react';
import { Package, ArrowRightLeft, ChevronRight, ChevronDown, Users } from 'lucide-react';
import { getAllBills, getAllProducts, getAllPurchases } from '../store';
import { localToday } from '../utils';
import { closingStock, stockValueOf, stockMovementLedger, productPartySalesBreakdown } from '../utils/products';
import { toast } from './Toast';
import TableExport from './TableExport';

const amt = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const monthEnd = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const last = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const today = localToday();
  return last > today ? today : last;
};

export default function StockReport({ businessName }) {
  const [data, setData] = useState(null);
  const [reportType, setReportType] = useState('closing'); // 'closing' | 'movement'
  const [month, setMonth] = useState(localToday().slice(0, 7));
  const [selectedProductForParty, setSelectedProductForParty] = useState(null);

  useEffect(() => {
    Promise.all([getAllProducts(), getAllBills(), getAllPurchases()])
      .then(([products, bills, purchases]) => setData({
        products: products || [],
        bills: bills || [],
        purchases: purchases || [],
      }))
      .catch(() => toast('Failed to load stock', 'error'));
  }, []);

  if (!data) return <div className="glass-panel" style={{ padding: '1.25rem' }}>Loading stock…</div>;

  const asOf = monthEnd(month);
  const startDate = `${month}-01`;
  const asOfLabel = new Date(`${asOf}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const num = { textAlign: 'right', whiteSpace: 'nowrap' };

  const lastMonths = Array.from({ length: 36 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })];
  });

  // 1. Closing Stock Data
  const qty = closingStock(data.products, data.bills, data.purchases, asOf);
  const closingRows = data.products
    .map((p) => ({ p, q: qty.get(p.id) ?? 0, ...stockValueOf(p, qty.get(p.id)) }))
    .sort((a, b) => String(a.p.name || '').localeCompare(String(b.p.name || '')));
  const closingTotal = closingRows.reduce((s, r) => s + (r.q > 0 ? r.value : 0), 0);

  const closingExportRows = [
    ...closingRows.map((r) => [r.p.name, r.p.hsn || '', r.p.unit || 'Nos', r.q, r.price, r.q > 0 ? r.value : 0]),
    ['Total', '', '', '', '', Math.round(closingTotal * 100) / 100],
  ];

  // 2. Movement Ledger Data
  const movementRows = stockMovementLedger(data.products, data.bills, data.purchases, startDate, asOf)
    .sort((a, b) => String(a.product.name || '').localeCompare(String(b.product.name || '')));
  const movementTotal = movementRows.reduce((s, r) => s + (r.closing > 0 ? r.valuation : 0), 0);

  const movementExportRows = [
    ...movementRows.map((r) => [
      r.product.name, r.product.hsn || '', r.product.unit || 'Nos',
      r.opening, r.inward, r.outward, r.closing, r.rate, r.closing > 0 ? r.valuation : 0,
    ]),
    ['Total', '', '', '', '', '', '', '', Math.round(movementTotal * 100) / 100],
  ];

  // Party breakdown for selected item
  const partyBreakdown = selectedProductForParty
    ? productPartySalesBreakdown(selectedProductForParty, data.bills, startDate, asOf)
    : [];

  return (
    <div className="glass-panel">
      {/* Sub-nav toggle */}
      <div style={{ display: 'flex', gap: 8, padding: '1rem 1.25rem 0.5rem', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
        <button
          type="button"
          className={reportType === 'closing' ? 'btn btn-primary' : 'btn btn-secondary'}
          onClick={() => { setReportType('closing'); setSelectedProductForParty(null); }}
          style={{ fontSize: '0.82rem' }}>
          <Package size={14} /> Closing Stock Valuation
        </button>
        <button
          type="button"
          className={reportType === 'movement' ? 'btn btn-primary' : 'btn btn-secondary'}
          onClick={() => setReportType('movement')}
          style={{ fontSize: '0.82rem' }}>
          <ArrowRightLeft size={14} /> Item Movement Ledger (In/Out)
        </button>
      </div>

      <div className="table-header" style={{ flexWrap: 'wrap', gap: '0.75rem', padding: '1rem 1.25rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>
            {reportType === 'closing' ? `Closing stock as on ${asOfLabel}` : `Item Movement Ledger (${startDate} to ${asOf})`}
          </h3>
          <small style={{ color: 'var(--text-muted)' }}>
            {reportType === 'closing'
              ? 'Valued at purchase price / cost'
              : 'Opening Stock + Inward Purchases - Outward Sales = Closing Stock'}
          </small>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-input" style={{ width: 'auto' }} value={month} aria-label="Month" onChange={(e) => setMonth(e.target.value)}>
            {lastMonths.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
          {reportType === 'closing' ? (
            <TableExport title={`Closing stock ${asOfLabel}`} filename={`Closing-stock-${asOf}`}
              subtitle={`${businessName ? `${businessName}, ` : ''}closing stock as on ${asOfLabel}, valued at purchase price`}
              headers={['Product', 'HSN/SAC', 'Unit', 'Closing qty', 'Rate', 'Value']} rows={closingRows.length ? closingExportRows : []} />
          ) : (
            <TableExport title={`Stock Movement ${startDate} to ${asOf}`} filename={`Stock-Movement-${asOf}`}
              subtitle={`${businessName ? `${businessName}, ` : ''}movement ledger (${startDate} to ${asOf})`}
              headers={['Product', 'HSN/SAC', 'Unit', 'Opening', 'Inward (Pur)', 'Outward (Sale)', 'Closing', 'Rate', 'Value']}
              rows={movementRows.length ? movementExportRows : []} />
          )}
        </div>
      </div>

      {reportType === 'closing' ? (
        closingRows.length === 0 ? (
          <div className="empty-state">
            <Package size={48} />
            <p>No products yet. Add them under Products.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table" style={{ minWidth: 640 }}>
              <thead>
                <tr><th>Product</th><th>HSN/SAC</th><th>Unit</th><th style={num}>Closing qty</th><th style={num}>Rate</th><th style={num}>Value</th></tr>
              </thead>
              <tbody>
                {closingRows.map((r) => (
                  <tr key={r.p.id}>
                    <td className="font-medium">{r.p.name}</td>
                    <td>{r.p.hsn || '-'}</td>
                    <td>{r.p.unit || 'Nos'}</td>
                    <td style={{ ...num, color: r.q < 0 ? 'var(--danger)' : undefined }}>{r.q}</td>
                    <td style={num} title={r.atCost ? 'Purchase price' : 'No purchase price, so selling price'}>{amt(r.price)}{r.atCost ? '' : ' *'}</td>
                    <td style={num}>{r.q > 0 ? amt(r.value) : '-'}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: 'var(--bg-secondary)' }}>
                  <td colSpan={5}>Total stock value</td>
                  <td style={num}>{amt(closingTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Movement Ledger View */
        <div>
          <div className="table-scroll">
            <table className="data-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit</th>
                  <th style={num}>Opening</th>
                  <th style={{ ...num, color: '#059669' }}>+ Inward (Pur)</th>
                  <th style={{ ...num, color: 'var(--primary)' }}>- Outward (Sales)</th>
                  <th style={{ ...num, fontWeight: 700 }}>= Closing</th>
                  <th style={num}>Rate</th>
                  <th style={num}>Value</th>
                  <th style={{ textAlign: 'center' }}>Party Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {movementRows.map((r) => {
                  const isSelected = selectedProductForParty?.id === r.product.id;
                  return (
                    <tr key={r.product.id} style={isSelected ? { background: 'rgba(37,99,235,0.06)' } : undefined}>
                      <td className="font-medium">{r.product.name}</td>
                      <td>{r.product.unit || 'Nos'}</td>
                      <td style={num}>{r.opening}</td>
                      <td style={{ ...num, color: '#059669' }}>{r.inward > 0 ? `+${r.inward}` : '—'}</td>
                      <td style={{ ...num, color: 'var(--primary)' }}>{r.outward > 0 ? `-${r.outward}` : '—'}</td>
                      <td style={{ ...num, fontWeight: 700, color: r.closing < 0 ? 'var(--danger)' : undefined }}>{r.closing}</td>
                      <td style={num}>{amt(r.rate)}</td>
                      <td style={num}>{r.closing > 0 ? amt(r.valuation) : '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-sm"
                          onClick={() => setSelectedProductForParty(isSelected ? null : r.product)}
                          style={{ fontSize: '0.72rem', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <Users size={12} /> {isSelected ? 'Hide' : 'Parties'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ fontWeight: 700, background: 'var(--bg-secondary)' }}>
                  <td colSpan={7}>Total closing stock value</td>
                  <td style={num}>{amt(movementTotal)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Party Breakdown Drawer / Sub-panel */}
          {selectedProductForParty && (
            <div style={{ margin: '1rem 1.25rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={16} style={{ color: 'var(--primary)' }} />
                  Party Sales Breakdown for &ldquo;{selectedProductForParty.name}&rdquo; ({startDate} to {asOf})
                </h4>
                <button type="button" className="icon-btn" onClick={() => setSelectedProductForParty(null)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
              </div>

              {partyBreakdown.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>No sales recorded for this item in this period.</p>
              ) : (
                <table className="data-table" style={{ fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      <th>Customer / Party Name</th>
                      <th style={num}>Quantity Sold</th>
                      <th style={num}>Average Rate</th>
                      <th style={num}>Total Revenue</th>
                      <th style={num}>Invoices</th>
                      <th style={{ textAlign: 'right' }}>Last Sold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partyBreakdown.map((p, idx) => (
                      <tr key={idx}>
                        <td className="font-medium">{p.clientName}</td>
                        <td style={num}>{p.quantity}</td>
                        <td style={num}>₹{amt(p.avgRate)}</td>
                        <td style={num}>₹{amt(p.totalAmount)}</td>
                        <td style={num}>{p.txns}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{p.lastDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0 1.25rem 1rem', margin: 0 }}>
        Worked back from today&apos;s stock using the dates of your invoices and purchase bills. Stock you typed in by hand on the Products screen has no date, so it counts as if it changed today.
        Value is at purchase price; * means no purchase price is saved, so the selling price is used. Negative stock is shown in red and not counted in the total.
      </p>
    </div>
  );
}
