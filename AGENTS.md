# AGENTS.MD: OPERATING DIRECTIVES FOR ALL AGENTS & SESSIONS

This file contains ground-truth operational rules for any AI agent or contributor working in this repository.

---

### RULE 1: READ PROJECT DETAILS & RULES FIRST
- Before inspecting files or proposing any plan, architecture, or code modification, you MUST inspect the Three-Part Project Details (`PROJECT_DETAILS.md` referencing `PROJECT_DETAILS_PART1.md`, `PART2.md`, and `PART3.md`) and `.agents/rules/rules.md`.
- No assumptions based on file names. Ground every decision in audited codebase facts.

---

### RULE 2: MANDATORY DOCUMENTATION SYNCHRONIZATION
- Whenever any schema, API route, tax rule, script, or configuration is added, removed, or altered, you MUST immediately update:
  1. Root documentation: `PROJECT_DETAILS_PART1.md`, `PART2.md`, or `PART3.md` (and index `PROJECT_DETAILS.md`).
  2. Mirrored agent rules: `.agents/rules/projectdetail.md`, `projectdetail2.md`, or `projectdetail3.md`.
  3. Operating directives: `AGENTS.md` and `.agents/rules/rules.md`.
- Never leave documentation stale across sessions.

---

### RULE 3: WINDOWS NODE ENVIRONMENT CONSTRAINT
- Operating System: Windows. PowerShell is the primary shell.
- Node.js Runtime: Node v25 binary is located at `C:\Program Files\nodejs`.
- **Mandatory Command Protocol**: In every PowerShell terminal command, you MUST prepend the Node v25 path:
  ```powershell
  $env:PATH = "C:\Program Files\nodejs;" + $env:PATH; <command>
  ```
- Examples:
  * Run unit tests: `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npm run test:unit`
  * Run build: `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npm run build`
  * Run linter: `$env:PATH = "C:\Program Files\nodejs;" + $env:PATH; npm run lint`

---

### RULE 4: ANTIGRAVITY 11,999-CHARACTER CEILING & THREE-PART PARTITIONING
- Antigravity IDE enforces a strict ceiling of **11,999 characters** for rules and system-read markdown files. Exceeding this truncates critical instructions.
- Target a safe operating threshold of **< 9,500 characters** per file.
- All extensive documentation must be split across the 3-part modular architecture:
  * Part 1: System Vision, Core Business/GST Model, Architecture, Tech Stack, Hosting.
  * Part 2: Security Matrix, API Lockdown, Storage Architecture, Concurrency, Quota & IO.
  * Part 3: Backend Routes, Business/Tax Engines, Tooling, Crons, Frontend Modules.

---

### RULE 5: VERSION NUMBER INCREMENT & BUILD HYGIENE
- Package version in `package.json` must be strictly incremented following semver (`x.y.z`).
- Synchronize version references in `server.js`, launcher scripts, and release metadata.
- Verification Gate before any merge:
  1. `npm run test:unit` (All 345+ unit tests must pass with 0 failures).
  2. `npm run build` (Vite production bundle and PWA service worker must build cleanly).
  3. `npm run lint` (No syntax or fatal runtime errors).

---

### RULE 6: DATA INTEGRITY, ATOMIC WRITES & BACKUP PROTECTION
- Storage is file-based JSON in `./data/`. All disk writes MUST use atomic write-then-rename (`writeFileAtomic` via `.tmp` file) to prevent truncated files on power loss.
- Path traversal prevention: Every dynamic file path must use `safePathSegment()` and verify boundary containment with `isPathInside()`. Never join unsanitized user inputs.
- 30-Day Trash Soft-Delete: Invoices must move to `data/trash/` with metadata before hard deletion. Restore must refuse if the invoice number was reissued.
- Dual Daily Backups: Automatic snapshots are saved to `data/backups/YYYY-MM-DD` and copied to the secondary user-selected drive/folder (e.g., `D:\FreeGSTBill Backups`).

---

### RULE 7: SECURITY & CREDENTIAL HYGIENE (ZERO SECRETS IN GIT)
- Localhost Binding: `server.js` MUST strictly bind to `127.0.0.1` (never `0.0.0.0`) to avoid LAN exposure.
- Strict Origin Validation: Disallow arbitrary cross-origin requests. Reject requests from foreign origins.
- PIN Lock Defense: PIN verification must be enforced on security-critical server endpoints (`/api/export`, `/api/import`, `/api/bills`, `/api/control-panel/*`) to prevent unauthorized local processes from exfiltrating customer financial data.
- Zero Hardcoded Credentials: Never commit passwords, tokens, or Google Drive secrets.

---

### RULE 8: HOSTING & BROWSER COMPATIBILITY OPERATING RULES
- Target Browser Support: Test in both **Firefox** and **Chrome/Edge**.
- CSP Integrity: Any sink consuming `URL.createObjectURL(blob)` (e.g. PDF generation, OCR workers) MUST have `blob:` explicitly whitelisted in `frame-src`, `worker-src`, and `img-src`.
- Launcher Scripts: Windows launcher scripts (`.ps1`, `.bat`, `.cmd`) in `release-templates/` must be **100% pure ASCII** to avoid cp1252 parsing crashes in Windows PowerShell 5.1.
- Release Packaging: Build ZIPs using `tar.exe -a` (forward slashes only) and verify via `scripts/verify-release.mjs`.

---

### RULE 9: CLEAN REPOSITORY HYGIENE
- Never commit test databases, scratch dumps, `.tmp` files, or release archives to Git.
- Keep the root and `data/` directories clean and well-structured.

---

### RULE 10: UPSTREAM REPOSITORY TRACKING & VERSION COMPARISON PROTOCOL
- **Upstream Source Repository**: `https://github.com/IamRamgarhia/Free-GST-Billing-Software`
- **Mandatory Version Comparison**: In every planning, auditing, or feature development session, the agent MUST compare the local version (`package.json`) against upstream latest releases:
  * Check latest upstream release/tags via GitHub API (`https://api.github.com/repos/IamRamgarhia/Free-GST-Billing-Software/releases/latest`) or GitHub repository.
  * Evaluate release notes, commit logs, and bug fixes for Indian GST statutory amendments, CBIC tax notifications, or stability patches.
  * If upstream has newer capabilities or fixes relevant to this project, evaluate and selectively backport them while preserving local architectural customizations.

