# PROJECT DETAILS — MASTER ARCHITECTURAL INDEX

> [!IMPORTANT]
> This master document indexes the definitive three-part modular documentation for Free GST Billing Software (v1.10.82).
> To prevent instruction truncation, all project documentation is partitioned across three files, strictly respecting the **Antigravity 11,999-character ceiling** (< 9,500 safe limit).

---

## MODULAR DOCUMENTATION INDEX

### 1. [Part 1: System Vision, Architecture & Tech Stack](file:///c:/Users/Forum/Documents/Antigravuty%20apps/free-gst-billing-software/PROJECT_DETAILS_PART1.md)
*Mirrored in: [`.agents/rules/projectdetail.md`](file:///c:/Users/Forum/Documents/Antigravuty%20apps/free-gst-billing-software/.agents/rules/projectdetail.md)*
- **System Vision & Purpose**: Open-source, offline-first billing & Indian GST compliance suite.
- **Canonical Upstream Repository**: [IamRamgarhia/Free-GST-Billing-Software](https://github.com/IamRamgarhia/Free-GST-Billing-Software)
- **Upstream Version Tracking**: Protocol for comparing `package.json` vs. upstream releases and backporting statutory updates.
- **Core Business Model**: 7 document types (Tax Invoice, Bill of Supply, Proforma, Quotation, Delivery Challan, Credit Note, Receipt Voucher).
- **Tax Determination Matrix**: CGST/SGST/UTGST/IGST, RCM, and Section 194Q / 206C(1H) ₹50 Lakh threshold.
- **Architecture Diagram**: End-to-end flowchart from desktop launchers to local Express 5 and file persistence.
- **Technology Stack**: React 19, Vite 7, Vanilla CSS, Express 5, Tesseract.js 7.0, PDF-lib, Lucide.
- **Hosting Topologies**: Local Desktop (default), Railway/Render/Fly.io, and Vercel + Supabase roadmap.

### 2. [Part 2: Security, Storage Schemas & Concurrency](file:///c:/Users/Forum/Documents/Antigravuty%20apps/free-gst-billing-software/PROJECT_DETAILS_PART2.md)
*Mirrored in: [`.agents/rules/projectdetail2.md`](file:///c:/Users/Forum/Documents/Antigravuty%20apps/free-gst-billing-software/.agents/rules/projectdetail2.md)*
- **Security Matrix & Attack Vectors**: Analysis of unauthenticated localhost REST API, cross-port script exfiltration, and UI-only PIN lock limitations.
- **Path Traversal Defenses**: `safePathSegment()` and boundary validation with `isPathInside()`.
- **Storage Architecture & Schemas**: Directory mapping and TypeScript interfaces for `bills`, `products`, `clients`, `purchases`, and `meta.json`.
- **Concurrency & Atomic Operations**: `writeFileAtomic` crash resilience, multi-tab invoice counter races, and product stock mutation race conditions.
- **Storage Quota & Memory/IOwait Protection**: In-memory directory cache (5s TTL), 30-day backup pruning, dual-folder backups (D: drive mirror), 30-day trash emptying, and 200KB log rotation.

### 3. [Part 3: APIs, Engines, Crons & Tooling](file:///c:/Users/Forum/Documents/Antigravuty%20apps/free-gst-billing-software/PROJECT_DETAILS_PART3.md)
*Mirrored in: [`.agents/rules/projectdetail3.md`](file:///c:/Users/Forum/Documents/Antigravuty%20apps/free-gst-billing-software/.agents/rules/projectdetail3.md)*
- **Backend API Endpoints Inventory**: Complete table of all Express routes in `server.js` with HTTP methods, parameters, and limits.
- **Tax Engine & Statutory Logic**: `computeInvoiceTotals()`, `formatDocNumber()`, Indian currency words (`numberToWords`), and CSV injection escaping (`toCsvCell()`).
- **Income Tax Engine**: Section 87A new-regime marginal relief, surcharge relief, Section 234A/B/C interest, and presumptive taxation (44AD / 44ADA).
- **Scheduled Timers & Background Jobs**: Daily backup engine, recurring invoice generator with event-loop yield, trash bin cleanup, and error log rotation.
- **Frontend Architecture**: 41 modular React components, client store facade (`store.js`), and route-level lazy loading.
- **Tooling & Test Harness**: 345+ unit tests, 115 Playwright smoke tests, and release verification runner.

---

## QUICK DEVELOPER REFERENCE

```powershell
# 1. Environment: Always prepend Node v25 binary on Windows
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH;

# 2. Run unit tests (345 passed, 0 failed)
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npm run test:unit

# 3. Build production bundle (Vite + PWA)
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npm run build

# 4. Start local development server
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npm run dev
```
