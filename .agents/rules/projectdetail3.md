# PROJECT DETAILS — PART 3: APIS, ENGINES, CRONS & TOOLING

> [!NOTE]
> Modular documentation partition 3 of 3. Safe character ceiling: < 9,500 characters.
> Indexed by [PROJECT_DETAILS.md](file:///c:/Users/Forum/Documents/Antigravuty%20apps/free-gst-billing-software/PROJECT_DETAILS.md).

---

## 1. BACKEND API ENDPOINTS INVENTORY (`server.js`)

`server.js` provides REST endpoints serving JSON data and managing desktop filesystem operations:

| Method | Endpoint | Purpose | Security & Limits |
|---|---|---|---|
| `GET` | `/api/bills` | List all invoices, sorted desc by invoice date | Cached (5s TTL) |
| `POST` | `/api/bills` | Save or update invoice (`?overwrite=1`) | Dupe check; 409 on collision |
| `DELETE` | `/api/bills/:id` | Move invoice to trash & clear cache | Safe ID file lookup |
| `GET/POST` | `/api/profile` | Read/write active default business profile | Atomically written to `profile.json` |
| `GET/POST/DEL`| `/api/clients[/:id]` | CRUD operations for client directory | Stored in `data/clients/{id}.json` |
| `GET/POST/DEL`| `/api/products[/:id]` | CRUD operations for product inventory | Stored in `data/products/{id}.json` |
| `GET/POST/DEL`| `/api/expenses[/:id]` | CRUD operations for expense vouchers | Stored in `data/expenses/{id}.json` |
| `GET/POST/DEL`| `/api/purchases[/:id]`| CRUD operations for inward purchase bills | Stored in `data/purchases/{id}.json` |
| `GET/POST/DEL`| `/api/recurring[/:id]`| CRUD operations for recurring schedules | Stored in `data/recurring/{id}.json` |
| `POST` | `/api/recurring/:id/generate` | Immediate one-off invoice generation | Uses shared `templateTotals()` |
| `GET/POST/DEL`| `/api/receipts[/:id]` | CRUD operations for payment receipts | Stored in `data/receipts/{id}.json` |
| `GET/POST/DEL`| `/api/profiles[/:id]` | CRUD operations for multi-firm profiles | Stored in `data/profiles/{id}.json` |
| `GET/POST` | `/api/meta/:key` | Read/write application metadata/settings | Stored in `data/meta.json` |
| `POST` | `/api/meta/:key/increment` | Atomic increment for invoice counters | Safe against power loss |
| `GET/POST` | `/api/lock[/verify\|/set]` | App PIN lock status, verify, and set/reset | Salted crypto hash in `meta.json` |
| `GET` | `/api/export` | Full database export bundle | JSON bundle of server + local data |
| `GET` | `/api/gstin-lookup/:gstin` | GSTIN taxpayer lookup & offline resolution | Local cache + offline fallback |
| `POST` | `/api/import` | Selective database import & restore | 500MB payload limit |
| `GET` | `/api/backups` | List rolling 30-day backups & D: mirrors | Reads timestamps from disk |
| `POST` | `/api/backups/now` | Trigger on-demand backup snapshot | Rate-limited: max 1 per 5s |
| `POST` | `/api/backups/:date/restore` | Safe transactional rollback restore | Creates `pre-restore` snapshot first |
| `DELETE` | `/api/backups/:date` | Manually delete a specific backup | Path containment validation |
| `GET/POST` | `/api/backup-folder` | Get/set secondary backup folder (e.g. D:) | Write-test probed before acceptance |
| `GET` | `/api/trash` | List soft-deleted invoices with `_trashedAt` | 30-day retention |
| `POST` | `/api/trash/:id/restore` | Restore invoice from trash to bills | Refuses if invoice number reused |
| `DELETE` | `/api/trash/:id` | Permanently purge trashed invoice | Hard deletion from disk |
| `POST` | `/api/save-pdf` | Save generated PDF to `Saved Invoices/` | Path-traversal safe |
| `POST` | `/api/trash-pdf` | Move saved PDF to Trash | Follows invoice deletion |
| `POST` | `/api/control-panel/launch-script` | Execute update, restore, move, or stop | Whitelist: `update`, `restore`, `move`, `stop` |
| `GET` | `/api/health` | Process uptime, PID, and last 4KB errors | Error tail bounded to 4KB |

---

## 2. TAX ENGINE & STATUTORY BUSINESS LOGIC

### 1. Pure Calculation Engine (`src/utils.js`)
- **`computeInvoiceTotals(opts)`**: The single source of truth for invoice math:
  * Computes line item discounts across `percent`, `net`, `unit`, and `with-tax` modes.
  * Splits taxable values and taxes across CGST, SGST, UTGST, and IGST.
  * Handles tax-inclusive back-calculation (`rate / (1 + taxRate/100)`).
  * Automatically respects Bill of Supply (`showGST = false`), zeroing tax lines.
  * Enforces Section 194Q / 206C(1H) annual ₹50 Lakh threshold and statutory base rules.
- **`formatDocNumber(opts)`**: Consistent sequential numbering with India's financial year (e.g., `INV/2026-27/0001` or short `INV/26-27/0001`).
- **`numberToWords(amount)`**: Generates Indian format strings up to and exceeding 100 Crore with paise handling.
- **`toCsvCell(value)`**: Sanitizes CSV outputs to prevent CSV injection (DDE formula execution on `=, +, -, @`).

### 2. Income Tax Engine (`src/utils/itr.js`)
- Full tax liability calculator covering Old vs. New Tax Regimes (FY 2024-25, 2025-26, 2026-27).
- Implements Section 87A rebate and new-regime marginal relief (tax capped at income exceeding ₹12 Lakh).
- Surcharge marginal relief at ₹50 Lakh, ₹1 Crore, and ₹2 Crore thresholds.
- Advance tax interest computation under Sections 234A, 234B, and 234C.
- Presumptive taxation computations under Section 44AD (8%/6% for business) and Section 44ADA (50% for professionals).

---

## 3. SCHEDULED TIMERS & BACKGROUND JOBS

1. **Daily Backup Engine (`runDailyBackup`)**:
   - Executes 5 seconds after server boot, then checks hourly via `setInterval(..., 3600000)`.
   - Copies all active directories to `./data/backups/YYYY-MM-DD/`.
   - Mirrors snapshot to secondary user-selected folder (e.g. `D:\FreeGSTBill Backups`) if configured.
   - Automatically purges backups older than 30 days.
2. **Recurring Invoice Auto-Fire (`processDueRecurring`)**:
   - Executes 3 seconds after boot, then checks hourly via `setInterval(..., 3600000)`.
   - Yields to the event loop on each iteration (`await yieldToLoop()`) to prevent HTTP handler starvation.
   - Advances template schedule using calendar-aware `advanceDate` (preserving anchor day across Feb 28/29).
3. **Trash Bin Purge (`purgeOldTrash`)**:
   - Executes 10 seconds after boot and every 24 hours. Purges records older than 30 days.
4. **Log Rotation (`rotateErrorsIfLarge`)**:
   - Opportunistically rotates `./data/errors.log` when size exceeds 200KB, rewriting the tail atomically.

---

## 4. FRONTEND MODULES & VIEW ARCHITECTURE

```
src/
├── App.jsx                   # Root router, dark mode, notification bell, update checks
├── main.jsx                  # React 19 mount point & PWA update registration
├── index.css                 # 119KB pure Vanilla CSS design system (zero Tailwind)
├── store.js                  # Client storage facade communicating with Express API
├── utils.js                  # Core GST calculation engine & formatting utilities
├── components/
│   ├── Dashboard.jsx         # Summary metrics, recent bills, quick actions, lock button
│   ├── InvoiceGenerator.jsx  # Full invoice editor (items, taxes, discounts, TDS/TCS)
│   ├── InvoicePreview.jsx    # Real-time A4 and thermal print preview with UPI QR
│   ├── GSTReturns.jsx        # GSTR-1 & 3B JSON exports, GSTR-2B reconciliation
│   ├── IncomeTax.jsx         # Tax regime comparison, presumptive tax, advance tax
│   ├── ClientsView.jsx       # Client database, ledger statements, outstanding balances
│   ├── InventoryView.jsx     # Product catalog, stock adjustments, low-stock warnings
│   ├── PurchaseBills.jsx     # Inward supplier invoices for ITC tracking
│   ├── ExpenseTracker.jsx    # Business expense tracking by category
│   ├── ReceiptVoucher.jsx    # Payment receipts linked to sales invoices
│   ├── RecurringInvoices.jsx # Subscription & retainer billing schedules
│   ├── ReportsView.jsx       # Sales, tax, profit/loss, and client aging reports
│   ├── SettingsView.jsx      # Multi-firm profiles, bank accounts, numbering series
│   ├── GstApiSettingsPanel.jsx # GST API Key gateway (Sandbox/MastersIndia) & 30-day portal sync
│   ├── PrintSettings.jsx     # Typography, paper dimensions (A4, thermal 80mm/58mm)
│   ├── BillOCR.jsx           # Tesseract.js scanner for supplier bills
│   ├── BulkCsvImport.jsx     # Bulk import/export for sales & purchase invoices
│   ├── Dashboard.jsx         # Invoices list, quick filters, bulk actions (Export XML, Export JSON, Bulk PDF)
│   ├── TallySyncModal.jsx    # Tally XML export for CA & import with duplicate resolution (keep-both, replace, skip)
│   ├── StockReport.jsx       # Closing stock valuation & item movement ledger (In/Out)
│   ├── ControlPanel.jsx      # Embedded desktop server management
│   ├── AppLock.jsx           # PIN lock screen overlay
│   └── SetupWizard.jsx       # First-run onboarding wizard
```

---

## 5. TOOLING & TEST SUITES

- **Unit Tests (`scripts/*-test.mjs`)**:
  * 350+ comprehensive assertions across 8 test suites (Tax, Discounts, CSV, Item History, GSTIN Lookup, Tally Export, Tally Import, Products Movement Ledger).
  * Executed via: `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npm run test:unit`.
- **Smoke Suite (`tests/smoke.mjs`)**:
  * 115+ automated browser scenarios run in Playwright Firefox against real server instances.
- **Release Verification (`scripts/verify-release.mjs`)**:
  * Extracts generated release ZIP, installs production deps, starts server, and tests the real package.
