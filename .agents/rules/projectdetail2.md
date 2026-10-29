# PROJECT DETAILS — PART 2: SECURITY, STORAGE SCHEMAS & CONCURRENCY

> [!NOTE]
> Modular documentation partition 2 of 3. Safe character ceiling: < 9,500 characters.
> Indexed by [PROJECT_DETAILS.md](file:///c:/Users/Forum/Documents/Antigravuty%20apps/free-gst-billing-software/PROJECT_DETAILS.md).

---

## 1. SECURITY MATRIX & ATTACK VECTOR AUDIT

### 1. Direct Mutation Vectors & Unauthenticated REST API
- **Vulnerability**: While `server.js` binds to `127.0.0.1`, HTTP routes (`/api/bills`, `/api/clients`, `/api/export`, `/api/import`) require **zero authorization headers, bearer tokens, or session cookies**.
- **Cross-Port Exfiltration Risk**: The CORS policy allows any origin matching `/^https?:\/\/localhost(:\d+)?$/i` or missing `Origin` headers (`!origin`). Any untrusted script running on another local development port (e.g., `localhost:3000`) can execute `fetch('http://localhost:47371/api/export')` and exfiltrate financial records, client lists, and banking details.
- **PIN Lock Bypass**: The PIN lock (`/api/lock/verify`) only gates the React UI overlay (`AppLock.jsx`). HTTP requests bypass the lock entirely unless an API auth token or session lock is enforced on the server.

### 2. Path Traversal & File Sanitization
- `safePathSegment()` sanitizes input by removing control characters, reserving length to 120 chars, and stripping `..`.
- `isPathInside(resolved, root)` verifies that target files reside strictly within permitted directories (`BACKUPS_DIR`, `DATA_DIR`).
- Windows-specific path folding converts paths to lowercase on `win32` to prevent case-sensitivity bypasses.

---

## 2. STORAGE ARCHITECTURE & ENTITY SCHEMAS

Data resides in flat JSON files inside `./data/`. The directory structure and primary entity models are:

### Directory Mapping
- `./data/bills/{id}.json`: Sales invoices, credit notes, proformas, delivery challans.
- `./data/clients/{id}.json`: Client directory and GSTIN records.
- `./data/products/{id}.json`: Product catalogue, stock quantities, and HSN codes.
- `./data/expenses/{id}.json`: Operating expense vouchers.
- `./data/purchases/{id}.json`: Inward supplier bills for Input Tax Credit (ITC).
- `./data/receipts/{id}.json`: Payment receipt vouchers.
- `./data/recurring/{id}.json`: Recurring schedule templates.
- `./data/profiles/{id}.json`: Multi-firm business profiles.
- `./data/trash/{id}.json`: Soft-deleted invoices with `_trashedAt` timestamp.
- `./data/backups/YYYY-MM-DD/`: 30-day rolling daily snapshots.
- `./data/meta.json`: Invoice counters, custom series maps, and salt/hash for PIN lock.

### Core Schemas

#### 1. Bill Entity (`./data/bills/{id}.json`)
```typescript
interface Bill {
  id: string;                      // Invoice number (e.g. "INV/2026-27/0001")
  invoiceNumber: string;
  invoiceDate: string;            // ISO local date: YYYY-MM-DD
  invoiceType: 'tax-invoice' | 'bill-of-supply' | 'proforma' | 'quotation' | 'delivery-challan' | 'credit-note';
  clientName: string;
  currency: string;               // e.g. "INR", "USD"
  totalAmount: number;            // Grand total receivable
  totalTaxAmount: number;         // Total GST + Cess
  status: 'unpaid' | 'paid' | 'partial' | 'cancelled';
  paidAmount: number;
  payments: Array<{ id: string; date: string; amount: number; mode: string; reference?: string }>;
  data: {
    profile: BusinessProfile;
    client: ClientRecord;
    details: { invoiceNumber: string; invoiceDate: string; dueDate?: string; placeOfSupply: string };
    items: Array<{
      name: string; hsn: string; quantity: number; unit: string; rate: number;
      discount: number; discountType: 'fixed' | 'percent'; discountBase: 'net' | 'unit' | 'with-tax';
      taxPercent: number; cessPercent: number;
    }>;
    totals: InvoiceTotals;
    customTerms?: string;
    customNotes?: string;
  };
}
```

#### 2. Product Entity (`./data/products/{id}.json`)
```typescript
interface Product {
  id: string;                     // Unique generated ID or slug
  name: string;
  hsn: string;                    // HSN / SAC code
  rate: number;                   // Selling price
  purchasePrice?: number;         // Inward cost price for stock valuation
  taxPercent: number;             // 0, 5, 12, 18, 28
  cessPercent: number;
  stock: number;                  // Current balance (allows negative)
  unit: string;                   // UQC (e.g. "NOS", "KGS", "BOX")
}
```

#### 3. Client Entity (`./data/clients/{id}.json`)
```typescript
interface Client {
  id: string;
  name: string;
  gstin?: string;
  state: string;                  // e.g. "07-Delhi" or "Delhi"
  country: string;                // Default: "India"
  address?: string;
  city?: string;
  pin?: string;
  phone?: string;
  email?: string;
  isSEZ?: boolean;                // Special Economic Zone flag
}
```

---

## 3. CONCURRENCY, ATOMIC WRITES & RACE CONDITIONS

### 1. Atomic Disk Writes (`writeFileAtomic`)
- All JSON writes execute via a temporary file: `<filePath>.tmp` followed by synchronous `fs.renameSync()`.
- **Guarantee**: A sudden power failure, OS reboot, or process kill cannot leave a half-written or empty JSON file. This guarantees `meta.json` counters never corrupt or reset to zero.

### 2. Multi-Tab Sequence Counter Races
- Counters are reserved via `POST /api/meta/:key/increment`.
- `peek: true` in `getNextInvoiceNumber` allows UI forms to inspect the next sequence without reserving it.
- **Race Condition Vulnerability**: If two browser tabs open the invoice editor concurrently, both preview the same invoice number. When Tab A saves, Tab B's auto-save will collide and fail with HTTP 409 (Conflict).

### 3. Inventory Stock Mutation Race Condition
- `applyStockChanges()` in `src/store.js` fetches `getAllProducts()`, calculates stock deltas in the browser, and iterates `saveProduct()` calls.
- **Race Condition Vulnerability**: In high-frequency cashier environments or concurrent recurring auto-fire, simultaneous sales overwrite each other's stock balance rather than performing atomic decrements.

---

## 4. STORAGE QUOTA, MEMORY & I/O-WAIT PROTECTION

### 1. In-Memory Directory Cache (`dirCache`)
- All reads to `./data/{dir}` are cached in memory with a 5-second TTL (`DIR_CACHE_TTL_MS = 5000`).
- Cache invalidation triggers automatically on any write or delete within that collection.
- **Memory Scaling**: In instances with 20,000+ invoices, reading all JSON records into V8 heap can consume > 150MB of RAM. Pagination and lightweight index metadata files are recommended for enterprise scale.

### 2. Automated Bloat & Retention Management
- **30-Day Daily Backup Pruning**: `runDailyBackup()` preserves only the last 30 daily backup folders in `./data/backups/`. Older snapshots are purged automatically.
- **Pre-Restore Snapshot Pruning**: Restore operations maintain rollback snapshots (`pre-restore-{timestamp}`), pruned to keep only the newest 5 instances.
- **30-Day Trash Emptying**: `purgeOldTrash()` executes on startup and every 24 hours to delete soft-deleted records older than 30 days.
- **200KB Log Rotation**: `rotateErrorsIfLarge()` caps `./data/errors.log` at 200KB, atomically keeping the tail.
