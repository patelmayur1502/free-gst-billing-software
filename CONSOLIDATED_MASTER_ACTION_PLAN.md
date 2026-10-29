# CONSOLIDATED MASTER ACTION PLAN: REMEDIATION & HARDENING ROADMAP

> [!IMPORTANT]
> This master action plan provides a prioritized, phased implementation roadmap for Free GST Billing Software (v1.10.80).
> Every phase contains concrete architectural fixes, exact code modifications, security mitigations, and verification commands.

---

## EXECUTIVE SUMMARY OF AUDIT FINDINGS

| Category | Severity | Finding | Impact |
|---|---|---|---|
| **Security** | **HIGH** | Unauthenticated Localhost REST API | Local processes on other ports can exfiltrate financial data via `/api/export` |
| **Security** | **MEDIUM** | PIN Lock UI-Only Enforcement | REST API does not validate PIN token when lock is active |
| **Data Integrity** | **HIGH** | Product Stock Mutation Race Condition | Concurrent sales overwrite stock rather than executing atomic decrements |
| **Data Integrity** | **MEDIUM** | Multi-Tab Sequence Counter Races | Concurrent tabs with `peek: true` collision on save (HTTP 409) |
| **Performance** | **MEDIUM** | Directory Heap Ingestion at Scale | `readAllFromDir('bills')` reads full JSONs into V8 memory on every cache miss |
| **Compliance** | **LOW** | Odd-Paisa Tax Head Rounding Discrepancy | CGST + SGST can diverge from total tax by 1 paisa on odd paise |
| **Code Hygiene** | **LOW** | ESLint Warnings under React 19 / Hooks 7.x | 796 lint warnings regarding state-in-effect and hoisted declarations |

---

## PHASE 1: CRITICAL SECURITY & AUTHORIZATION LOCKDOWN

### 1.1 Secure CORS & Local Cross-Port Origin Isolation
**Objective**: Prevent arbitrary web applications running on other local ports (e.g. `localhost:3000`, `localhost:8080`) from reading customer records or exfiltrating data via `GET /api/export`.

**Implementation Target (`server.js`)**:
Restrict allowable origins to the server's own port and the designated Vite dev server port:
```javascript
// server.js - Strict Origin Allowlist
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const activePort = activeServer ? activeServer.address().port : STARTING_PORT;
  const allowedOrigins = [
    `http://localhost:${activePort}`,
    `http://127.0.0.1:${activePort}`,
    `http://localhost:5173`, // Default Vite Dev Server
    `http://127.0.0.1:5173`
  ];

  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Cross-origin request refused: unauthorized origin', code: 'forbidden' });
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Lock-Token');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
```

### 1.2 Enforce PIN-Token Verification on Sensitive Server Endpoints
**Objective**: Ensure that when a PIN lock is configured, direct HTTP requests to `/api/export`, `/api/import`, `/api/bills`, and `/api/control-panel/*` cannot access data without an active unlock session token.

**Implementation Target (`server.js`)**:
```javascript
// server.js - PIN Lock Guard Middleware
const activeSessions = new Set();

function requireUnlocked(req, res, next) {
  const lock = currentLock();
  if (!lock) return next(); // No PIN configured

  const token = req.headers['x-app-lock-token'];
  if (!token || !activeSessions.has(token)) {
    return res.status(401).json({ error: 'Application is locked. Provide valid unlock token.', code: 'locked' });
  }
  next();
}

// Issue session token upon successful verification
app.post('/api/lock/verify', (req, res) => {
  const lock = currentLock();
  if (!lock) return res.json({ ok: true, token: null });
  if (checkPin(res, lock, req.body?.pin)) {
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.add(token);
    // Expire session after 4 hours of inactivity
    setTimeout(() => activeSessions.delete(token), 4 * 60 * 60 * 1000);
    return res.json({ ok: true, token });
  }
});
```

---

## PHASE 2: DATA INTEGRITY & ATOMIC CONCURRENCY

### 2.1 Atomic Server-Side Stock Adjustment Endpoint
**Objective**: Eliminate the race condition where `applyStockChanges` in the browser reads all products, recalculates stock, and overwrites existing records, causing lost updates.

**Implementation Target (`server.js`)**:
```javascript
// server.js - Atomic Stock Adjustment
app.post('/api/products/adjust-stock', (req, res) => {
  const adjustments = req.body?.adjustments; // { [productId]: deltaNumber }
  if (!adjustments || typeof adjustments !== 'object') {
    return errRes(res, 400, 'bad-request');
  }

  const productsDir = path.join(DATA_DIR, 'products');
  const updated = [];

  for (const [id, delta] of Object.entries(adjustments)) {
    const change = Number(delta) || 0;
    if (change === 0) continue;
    const filePath = path.join(productsDir, safeFileName(id) + '.json');
    if (!fs.existsSync(filePath)) continue;

    try {
      const product = readJSON(filePath);
      if (product) {
        product.stock = Math.round(((Number(product.stock) || 0) + change) * 1000) / 1000;
        writeJSON(filePath, product);
        updated.push(product);
      }
    } catch (e) {
      logFatal(e, 'adjust-stock');
    }
  }

  invalidateCache('products');
  res.json({ success: true, updated });
});
```

### 2.2 Wire `applyStockChanges` in `src/store.js`
Replace sequential client writes with a single atomic call to `/api/products/adjust-stock`.

---

## PHASE 3: BUSINESS LOGIC & TAX ENGINE HARDENING

### 3.1 Statutory Rounding Balance
**Objective**: Prevent 1-paisa discrepancies between `totalTaxAmount` and the sum of `cgst + sgst`.
In `src/utils.js`:
```javascript
// When splitting intra-state tax into equal halves:
const half = r2(taxTotal / 2);
const cgst = isIndia && !isInterstate ? half : 0;
// Absorb odd paise into SGST / UTGST to guarantee exact summation:
const sgst = isIndia && !isInterstate && !isIntraUT ? r2(taxTotal - cgst) : 0;
const utgst = isIndia && isIntraUT ? r2(taxTotal - cgst) : 0;
```

### 3.2 Indian Statutory Notice in UI
Add a contextual disclaimer in `InvoiceGenerator.jsx` for Section 52 TCS, notifying users that Section 52 applies to e-commerce marketplaces and Section 206C(1H) applies to goods suppliers.

---

## PHASE 4: PERFORMANCE & SCALABILITY ENHANCEMENTS

### 4.1 Lightweight Invoices Index (`bills-index.json`)
**Problem**: For businesses with 5,000+ invoices, reading every JSON file (with logo blobs, signatures, terms) on `GET /api/bills` creates high memory overhead.
**Solution**:
1. Maintain a fast header index `./data/bills-index.json` containing `{ id, invoiceNumber, invoiceDate, clientName, totalAmount, status }`.
2. Update the index atomically whenever a bill is saved, trashed, or restored.
3. Serve `GET /api/bills` from the index; fetch full detail via `GET /api/bills/:id` only when an invoice is opened for editing or viewing.

---

## PHASE 5: CODE HYGIENE & ESLINT REACT 19 MODERNIZATION

### 5.1 Fix Syntax Escapes in `src/utils.js`
Remove unnecessary escape characters:
- Line 1846: Replace `\-` with `-` in date regular expressions.
- Line 2310: Replace `\-` with `-`.

### 5.2 Fix Declaration Hoisting in `SettingsView.jsx`
Move function definitions (`loadTemplates`, `loadBusinessProfiles`) above the `useEffect` hooks in which they are invoked.

---

## PHASE 6: VERIFICATION & AUDIT VALIDATION GATES

Execute the following commands sequentially to validate the codebase:

```powershell
# Step 1: Prepend Node v25 to PATH
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH;

# Step 2: Verify Unit Tests (Must pass 345+ assertions with 0 failures)
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npm run test:unit

# Step 3: Verify Production Vite Bundle & PWA Service Worker
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npm run build

# Step 4: Run Code Linter
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npm run lint
```
