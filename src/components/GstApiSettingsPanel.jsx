// v1.10.82 - GST API Gateway & Portal Session Settings Panel
import { useState, useEffect } from 'react';
import { Globe, Key, ShieldCheck, CheckCircle, ExternalLink, RefreshCw, AlertCircle, Save } from 'lucide-react';
import { getGstApiConfig, saveGstApiConfig } from '../store';
import { toast } from './Toast';

export default function GstApiSettingsPanel() {
  const [config, setConfig] = useState({
    provider: 'sandbox',
    apiKey: '',
    apiSecret: '',
    customEndpoint: '',
    portalAccess: {
      enabled: false,
      username: '',
      durationDays: 30,
      lastAuthorizedAt: '',
    },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testGstin, setTestGstin] = useState('27AAACS1234A1Z5');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getGstApiConfig()
      .then((cfg) => {
        if (cfg) setConfig((prev) => ({ ...prev, ...cfg, portalAccess: { ...prev.portalAccess, ...(cfg.portalAccess || {}) } }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await saveGstApiConfig(config);
      toast('GST API settings saved successfully!', 'success');
    } catch (err) {
      toast('Failed to save settings: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestApi = async () => {
    if (!testGstin || testGstin.length < 15) {
      toast('Please enter a valid 15-character GSTIN to test', 'warning');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      // First save current config so backend server uses it
      await saveGstApiConfig(config);
      const res = await fetch(`/api/gstin-lookup/${encodeURIComponent(testGstin.trim().toUpperCase())}`);
      const data = await res.json();
      if (data && data.ok) {
        setTestResult({
          ok: true,
          source: data.source,
          taxpayer: data.taxpayer,
        });
        toast('GSTIN lookup test succeeded!', 'success');
      } else {
        setTestResult({ ok: false, error: data?.error || 'Lookup returned no data' });
      }
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
      toast('Test request failed: ' + err.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div>Loading GST API settings…</div>;

  return (
    <div className="glass-panel p-6 mb-6">
      <div className="flex justify-between items-center mb-4 pb-2" style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Globe size={20} style={{ color: 'var(--primary)' }} />
          <div>
            <h3 className="section-title" style={{ margin: 0 }}>GST Portal & Live API Configuration</h3>
            <p className="section-subtitle" style={{ margin: 0 }}>
              Live party auto-fill by GSTIN and direct business portal connection
            </p>
          </div>
        </div>
      </div>

      {/* Part 1: GSP / Provider Configuration */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Key size={16} style={{ color: 'var(--primary)' }} /> Live GSTIN Party Lookup (GSP API Gateway)
        </h4>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.45 }}>
          Auto-populates customer legal name, trade name, address, pincode, and active status directly when typing a GSTIN.
          You can use a free developer key from any empanelled provider.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="form-group">
            <label className="form-label">API Gateway Provider</label>
            <select
              className="form-input"
              value={config.provider}
              onChange={(e) => setConfig((prev) => ({ ...prev, provider: e.target.value }))}>
              <option value="sandbox">Sandbox.co.in (500 free lookups/mo)</option>
              <option value="mastersindia">Masters India GSP</option>
              <option value="rapidapi">RapidAPI Indian GST</option>
              <option value="custom">Custom Webhook / GSP Proxy</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">
              API Key / Access Token
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                (Bearer Token or API Key)
              </span>
            </label>
            <input
              type="password"
              className="form-input"
              value={config.apiKey}
              onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder="e.g. key_live_xxxxxxxxxxxxxxxx"
            />
          </div>

          {config.provider === 'sandbox' && (
            <div className="form-group">
              <label className="form-label">API Secret (x-api-key)</label>
              <input
                type="password"
                className="form-input"
                value={config.apiSecret}
                onChange={(e) => setConfig((prev) => ({ ...prev, apiSecret: e.target.value }))}
                placeholder="Optional API Secret"
              />
            </div>
          )}

          {config.provider === 'custom' && (
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">Custom Endpoint URL</label>
              <input
                type="text"
                className="form-input"
                value={config.customEndpoint}
                onChange={(e) => setConfig((prev) => ({ ...prev, customEndpoint: e.target.value }))}
                placeholder="https://your-api.com/lookup?gstin={gstin}"
              />
            </div>
          )}
        </div>

        <div style={{ background: 'rgba(37,99,235,0.06)', borderRadius: 6, padding: '0.75rem', marginBottom: '1rem', fontSize: '0.78rem' }}>
          <strong>Where to get a free API Key:</strong>
          <ul style={{ paddingLeft: '1.2rem', margin: '0.25rem 0 0 0', lineHeight: 1.5 }}>
            <li>
              Sign up at <a href="https://sandbox.co.in" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sandbox.co.in <ExternalLink size={11} style={{ display: 'inline' }} /></a> for 500 free monthly GST searches.
            </li>
            <li>Copy your key and paste it above. It enables instant live taxpayer auto-fill on all bills.</li>
          </ul>
        </div>

        {/* Test Tool */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.75rem' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Test Lookup:</span>
            <input
              type="text"
              className="form-input"
              value={testGstin}
              onChange={(e) => setTestGstin(e.target.value.toUpperCase())}
              style={{ width: 180, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
              placeholder="15-digit GSTIN"
              maxLength={15}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTestApi}
              disabled={testing}
              style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={12} className={testing ? 'animate-spin' : ''} /> {testing ? 'Testing…' : 'Test Lookup'}
            </button>
          </div>

          {testResult && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', padding: '0.5rem', borderRadius: 4, background: testResult.ok ? '#ecfdf5' : '#fef2f2', border: `1px solid ${testResult.ok ? '#a7f3d0' : '#fecaca'}`, color: testResult.ok ? '#065f46' : '#991b1b' }}>
              {testResult.ok ? (
                <div>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle size={13} /> Source: {testResult.source}
                  </div>
                  <div>Name: <strong>{testResult.taxpayer?.lgnm || testResult.taxpayer?.name || testResult.taxpayer?.tradeNam || 'Parsed'}</strong></div>
                  <div>State: {testResult.taxpayer?.state || testResult.taxpayer?.stcd || testResult.taxpayer?.stateCode || '—'}</div>
                  <div>Status: {testResult.taxpayer?.sts || testResult.taxpayer?.status || 'Active'}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={13} /> Error: {testResult.error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Part 2: Official GST Portal Business Sync */}
      <div style={{ borderTop: '1px solid var(--border-color, #e5e7eb)', paddingTop: '1.25rem', marginBottom: '1.25rem' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={16} style={{ color: '#059669' }} /> Own Business Portal Access (services.gst.gov.in)
        </h4>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.45 }}>
          Connect directly to your own company&apos;s GSTIN profile to pull inward GSTR-2B ITC statements and push GSTR-1 returns.
        </p>

        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, padding: '0.75rem', fontSize: '0.78rem', color: '#334155', marginBottom: '1rem' }}>
          <strong>How to activate 30-Day API Access on the GST Portal:</strong>
          <ol style={{ paddingLeft: '1.2rem', margin: '0.25rem 0 0 0', lineHeight: 1.5 }}>
            <li>Log in to <a href="https://services.gst.gov.in" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>services.gst.gov.in <ExternalLink size={11} style={{ display: 'inline' }} /></a>.</li>
            <li>Go to <strong>My Profile &gt; Manage API Access</strong>.</li>
            <li>Set <strong>Enable API Access</strong> to <strong>Yes</strong> and select duration: <strong>30 days</strong>.</li>
            <li>Enter your GST Portal Username below.</li>
          </ol>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-group">
            <label className="form-label">GST Portal Username</label>
            <input
              type="text"
              className="form-input"
              value={config.portalAccess?.username || ''}
              onChange={(e) => setConfig((prev) => ({
                ...prev,
                portalAccess: { ...prev.portalAccess, username: e.target.value },
              }))}
              placeholder="e.g. taxpayer_username"
            />
          </div>

          <div className="form-group flex items-end">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer', paddingBottom: 8 }}>
              <input
                type="checkbox"
                checked={!!config.portalAccess?.enabled}
                onChange={(e) => setConfig((prev) => ({
                  ...prev,
                  portalAccess: { ...prev.portalAccess, enabled: e.target.checked },
                }))}
                style={{ width: 16, height: 16, accentColor: 'var(--primary)' }}
              />
              <span><strong>Enable Portal Handshake</strong> (30-day session)</span>
            </label>
          </div>
        </div>

        {config.portalAccess?.enabled && (
          <div style={{ marginTop: '0.5rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 4, padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle size={14} />
            <span>Portal Sync Enabled. 30-Day access is active for GSTR-1 and GSTR-2B transactions.</span>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3" style={{ borderTop: '1px solid var(--border-color, #e5e7eb)', paddingTop: '1rem' }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Save size={15} /> {saving ? 'Saving…' : 'Save GST Settings'}
        </button>
      </div>
    </div>
  );
}

