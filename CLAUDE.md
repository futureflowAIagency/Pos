# CLAUDE.md — Shop ERP / POS SaaS — Project Log & Phase Roadmap

> **Purpose of this file:** A persistent record of everything Claude works on for this
> project. If the chat context is ever lost, read this file to understand what has been
> done, what remains, decisions made, and where each feature lives in the code.
> **Update this file after every completed phase / meaningful change.**

Last updated: **2026-09-06** — Phase 28 (session-3 fixes) complete; **Phase 29 (Admin Panel data visibility: per-shop branch/data-usage view + a full data browser)**, **Phase 30 ("Scan with Phone" — remote camera barcode scanning, no app install)**, **Phase 31 (thermal receipt right-edge clipping — real root cause, in 3 rounds)**, and **Phase 32 (Stock Transfer between branches)** all complete; plus a same-day hotfix (Pay Salary threw a validation error because Phase 25's now-required `Expense.branch` was never added to the salary-payment code) that also added split-tender + advance-vs-salary payment types. See §3 for each and §5 for the full narrative. Previously: all 10 original phases complete; Phase 11–14 complete; Phase 15 (Scan IMEI with AI) was built then fully removed at client request; a real Products-search bug fix landed; Low Stock Alert pagination fix complete; Phase 16 (Migration Excel template + existing-vs-new IMEI logic + accept/decline review) complete; Phase 17 (keyboard-only POS for Pharmacy — name-search suggestions + Enter chain) complete; Phase 18 (POS quantity step + Shift+Enter to customer + optional customer name/phone) complete; Phase 19 (expired stock warned + blocked from sale) complete; Phase 20 (Smart Stock Import: name-only files now import; template columns no longer silently dropped) complete; Phase 21 (Smart Import bulk-DB rewrite — 550-row uploads no longer time out) complete; Phase 22 (supplier due directly editable) complete; Phase 23 (business type renamed + admin-panel user deletion) complete; Phase 24 (Products search price panel) complete; Phase 25 (Multi-Branch Support) complete; Phase 26 (customer due-date reminders + a real notification system) complete — shipped with a hotfix (dead `useRef` reference crashed every logged-in page, caught via the client's browser console and fixed same-day); Phase 27 (Sidebar app-version indicator + "Relaunch to update" prompt) complete.

> **Note on continuity (2026-09-06):** Phases 29–32 below and their §5 entries were written up retroactively while fixing the Pay Salary bug — a prior session did the actual work (visible in `git log`) but never updated this file, so the phase numbers/dates here are reconstructed from commit messages, not live at the time. Also: this file's own §0 "Working dir" path (`...Desktop\Important Files\shop-erp-saas-updated`) is stale — the real working directory for the last several sessions has been `C:\Users\MIHI\Desktop\shop-erp-saas-updated` (no "Important Files"); left uncorrected since it's a pre-existing note, not something this update was asked to fix.

---

## 0. Project Layout (important — nested folders)

- **Working dir / repo root:** `C:\Users\MIHI\Desktop\Important Files\shop-erp-saas-updated`
  - `next promt.txt` — the client's update requirements (Bangla), 15 numbered feature requests.
  - `reference images/` — 14 annotated screenshots of the **current live app** (pos-saas.futureflowaiagency.com) highlighting bugs/gaps to fix. These are NOT new UI mockups.
  - `CLAUDE.md` — this file.
- **Actual app code (double-nested):**
  `shop-erp-saas\shop-erp-saas\` → `client/` (React 18 + Vite + Tailwind) and `server/` (Express + Mongoose + MongoDB).
- **Stack:** MERN, multi-tenant (every row scoped by `businessId` from JWT). Roles: `superadmin`, `owner`, `staff`. Business types: `general | pharmacy | mobile` (this client is a **mobile phone shop** → `type === 'mobile'` gates mobile-only modules).
- **Run:** from app root `npm run dev` (concurrently runs server:5000 + client:5173). Seed: `npm run seed`.
- **Demo creds:** superadmin `admin@futureflow.ai`/`admin123`; mobile owner `mobile@demo.com`/`owner123`.

### Current live shop context (from screenshots)
Shop "Alif Mobile House", owner "Ariful Islam Alif", Dhaka. Products are iPhones with IMEI tracking. This is the real deployment the client is asking to improve.

---

## 1. Current Architecture Snapshot (as of project start)

### Server models (`server/src/models/`)
- **Product** — `business, name, imageUrl, sku, category, unit, purchasePrice, sellingPrice, discountPercent (+virtual discountedPrice), stock, lowStockAlert`; pharmacy: `expiryDate, batchNo`; mobile: `trackSerial, brand, color, storage, warrantyBrandMonths, warrantyShopMonths`. **No `barcode` field.**
- **Sale** — items: `product, name, qty, purchasePrice, mrp, discountPercent, sellingPrice, unit(→PhoneUnit), imei1, imei2, serial, warranty*`. Sale: `invoiceNo, customer, customerName, customerNid, subTotal, discount, total, paid, due, profit, paymentMethod, soldBy`. **`paymentMethod` enum = `['cash','bkash','nagad','card','due','emi']`** (no `bank`, no `rocket`). Create-only (no edit/void/return).
- **Customer** — `name, phone, email, address, nid, totalDue, isActive`.
- **Supplier** — `name, phone, address, note, totalPurchase, totalPaid, +virtual due`. **Purchase** — supplier stock-in / payment entries.
- **Business** — `name, owner, type, address, phone, email, logoUrl, currency, settings.printMode, customPlan, subscription*`. **No fund/balance fields.**
- **Expense** — `title, category, amount, note, date`. No fund-source link.
- **Installment (EMI)** — `customer, sale, productName, totalAmount, downPayment, months, schedule[], status, +virtual balance`. Minimal customer info.
- **ServiceJob** — `jobNo, customer, deviceModel, imei, problem, budget, technician, status, serviceFee, partsCost, total, paid, statusHistory[]`. No parts-cost/technician-cost profit split stored distinctly for dashboard.
- **PhoneUnit** — one row per physical device: `product, imei1, imei2, serial, status(in_stock|sold), sale, soldAt, soldPrice, customer, warranty*`.
- **Payment** — subscription/platform payments only (`method` enum `['bkash','nagad','manual']`), NOT POS.
- **Employee** — `employeeId, photo, name, phone, ..., monthlySalary, salaryHistory[]`.
- Others: User, ActivityLog, Notification, Subscription, MarketingSettings, Campaign, CRM (Company/Contact/Lead/Deal/CrmNote/CrmTask).

### Controllers / routes
Routes mounted in `server/src/routes/index.js` under `/api/*`:
`auth, business, products, sales, customers, employees, expenses, dashboard, payments, admin, notifications, activity-logs, suppliers, units, installments, services, upload, marketing, crm, health`.
**Missing (clean-slate for this project): `/funds`, `/returns`, `/import`, `/export`/backup, barcode/label endpoints.**

### Client pages (`client/src/pages/`)
Dashboard, POS, Products, Customers, Suppliers, Employees, Finance, Installments, Services, Warranty, CRM, Marketing, Subscription, ActivityLogs, Settings, Login, admin/AdminPanel.

### Key shared components
- `components/print/` — `InvoiceA4, ThermalReceipt, PurchaseReceipt, DueReceipt, SalarySlip, ServiceInvoice, ServiceThermal, PrintWrapper` (shared header/logo).
- `components/charts/` — `PaymentPie` (COLORS map for cash/bkash/nagad/card/due/emi — **no rocket/bank**), `RevenueChart`.
- `components/ui/` — `DataTable, Modal, StatCard, Spinner`. `context/ConfirmContext` (promise dialog).
- Image upload: shared `POST /api/upload` (multer → Cloudinary, local-disk fallback). Used by Products, Employees, Settings(logo). Client helper `api/upload.js`.

### What does NOT exist yet (build from scratch)
Real **barcode** generation/scanning/label printing (only a lucide `Barcode` icon opening the IMEI modal). **Fund/capital** management. **Return/Exchange**. **Import/Export/backup**. **Bank/Rocket** payment methods. Cash/Bank/bKash/Nagad/Rocket **balance tracking**.

---

## 2. Requirements → Phase Mapping

Source: `next promt.txt` (15 requests). Grouped into phases by dependency (build foundation first).

| # | Requirement (Bangla doc) | Phase |
|---|--------------------------|-------|
| 5 | Remove "Card EMI Installment" option; add **Bank** payment method | P1 |
| 7 | **Fund Management** (Add Fund from outside capital; not an expense; own history) | P1 |
| 6 | **Dashboard Financial Summary** — Cash/Bank/bKash/Nagad/Rocket balances, Card Collection, Expense, Income, Profit; salary folded into Expense; filters Daily/Weekly/Monthly/Half-Yearly/Yearly/Custom | P2 |
| 2 | **No image upload** on Product Add | P3 |
| 1 | **Barcode-based Product Add** — scan → autofill; existing product not duplicated, only new IMEI added | P3 |
| 15 | **Barcode Generator & Label Printing** (A4 label sheet, bulk, preview, reprint; QR-ready) | P3 |
| 3 | **Recent Orders** — open full order details, edit invoice, reprint, update | P4 |
| 4 | **Due real-time update** — fully-paid due disappears from Recent Orders + reports instantly | P4 |
| 11 | **Due Payment Invoice** — full field set | P4 |
| 9 | **Service & Repair Profit** — customer sees only service charge; dashboard computes revenue/parts/tech/net profit; payment updates balances | P5 |
| 10 | **EMI/Installment** — full customer info (NID, parents, guarantor, addresses), barcode autofill, IMEI, schedule, per-payment invoice, stock deduct, dashboard EMI receivable | P6 |
| 12 | **Supplier Dashboard** — total purchase/paid/due, supplier-wise due, recent purchase, history, real-time | P7 |
| 8 | **Advanced Reports & Print** — full metric report + PDF export | P8 |
| 14 | **Return & Exchange** — full/partial return, exchange with price diff/store credit, stock reversal, reasons, audit, window rules | P9 |
| 13 | **Data Import & Export** — XLSX/CSV/JSON, validation, backup/restore, history | P10 |

### Reference-image cross-check (bugs the screenshots flag)
- Dashboard Recent Orders: `DUE` badge on INV-...23 → must be clickable for details (P4) and clear when paid (P4).
- Customers "Due" column shows ৳0 → verify due tracking (P4).
- Products page: empty box top-right + product image thumbnails circled → remove image (P3), add barcode/label + import-export controls (P3/P10).
- POS Cart payment dropdown shows "EMI/Installment" → remove it, add Bank (P1).
- Dashboard KPI cards → expand into full financial summary w/ balances (P2/P6).
- Finance page: empty box near Print Report → Add Fund / Export controls (P1/P8/P10).
- Sales Report print, Service invoice, Due receipt, Suppliers, EMI modal → all referenced by P4/P5/P7/P8/P10.

---

## 3. Phase Plan (detailed) & Status

Legend: ⬜ not started · 🟡 in progress · ✅ done · ⏭️ deferred

### ✅ Phase 1 — Payment methods + Fund foundation  *(done 2026-07-13)*
- ✅ `Sale.paymentMethod` enum → added `bank`, `rocket` (`emi` kept for back-compat). `server/src/models/Sale.js:41`.
- ✅ POS payment `<select>` (`client/src/pages/POS.jsx:~376`): Cash, Bank, bKash, Nagad, Rocket, Card. Removed "EMI / Installment" option.
- ✅ `PaymentPie` COLORS: added `bank` (#0d9488), `rocket` (#7c3aed). `client/src/components/charts/PaymentPie.jsx`.
- ✅ New **Fund** model `server/src/models/Fund.js` `{business, source(cash|bank|bkash|nagad|rocket|card), amount, note, date, addedBy}`; controller `fundController.js` (get/create/delete, logs ADD_FUND); routes `fundRoutes.js` mounted at **`/api/funds`** in `routes/index.js`. NOT income/expense.
- ✅ `Expense.source` field added (cash|bank|bkash|nagad|rocket|card, default cash). `server/src/models/Expense.js`.
- ✅ Finance page (`client/src/pages/Finance.jsx`): **Add Fund** button + modal, **Fund History** table (with delete), expense modal now has "Paid From" source select, expenses table shows "From" column. Loads `/funds`.
- Verified: server `node --check` on all touched files ✓; client `vite build` ✓.
- **NOT yet built (moved to Phase 2):** the balance *engine* that aggregates per-method balances (Σ sales-in + funds − expenses − …) and the dashboard balance cards. Phase 1 only lays the data foundation.

### ✅ Phase 2 — Dashboard Financial Summary + balance engine + date filters  *(done 2026-07-13)*
- ✅ **Balance engine** `server/src/services/balanceService.js` → `computeBalances(businessId)` returns cumulative per-method balance `{cash,bank,bkash,nagad,rocket,card}` = Σ(sale `paid` by `paidVia`) + Σ(fund by source) − Σ(expense by source). Exposes `METHODS`. *(Due-collections not yet method-tagged → fold in at Phase 4; refunds/supplier-payments at P7/P9.)*
- ✅ `Sale.paidVia` field added (real tender for the paid portion, kept even when `paymentMethod` becomes `'due'`). Set in `saleController.createSale`. Keeps the DUE badge working while giving the balance engine a correct source.
- ✅ **Salary → Expense**: `employeeController.paySalary` now books an Expense (category `Salary`, chosen `source`) the first time a month is marked paid (idempotent — won't double-count on edits). Salary UI (`Employees.jsx` salary modal) gained a "Paid From" select. So salary counts in expenses + balances and stays out of a separate card (req 6).
- ✅ `dashboardController.dashboardSummary` now accepts `?period=daily|weekly|monthly|half_yearly|yearly|custom&from&to` (via `resolveRange`). Returns period-scoped `periodRevenue/periodProfit/periodExpense/periodNetProfit/periodSalesCount` + cumulative `balances` + `cardCollection`. Old `month*`/`today*` fields kept for back-compat.
- ✅ `Dashboard.jsx`: date-filter dropdown (Daily…Custom w/ from-to date inputs); **Financial Summary** row (Total Income / Total Expense / Total Profit / Total Due — respects filter); **Balances** row (Cash / Bank / bKash / Nagad / Rocket / Card Collection); operational row (Today's Sales / Products / Low Stock / Employees). Removed the old fixed Month-Revenue/Net-Profit cards.
- Verified: server `node --check` + ESM import-chain resolve ✓; client `vite build` ✓.
- **Assumption logged:** partial-due sales attribute their paid amount to the selected tender (`paidVia`); pre-existing sales without `paidVia` count as `cash`.

### ✅ Phase 3 — Product no-image + Barcode system + A4 label printing  *(done 2026-07-13)*
- ✅ **Image upload removed** from Products (req 2): deleted the upload block + list thumbnail column + `onImage`/`uploadImage`/`ImageIcon` usage. `Product.imageUrl` kept in the model (back-compat) but no UI. Form now shows **Barcode** + **SKU** fields instead.
- ✅ `Product.barcode` field (indexed, per-business unique enforced in controller). `productController`: auto-generates a unique 12-digit barcode on create if blank; `updateProduct` blocks barcode clashes; new **`GET /api/products/barcode/:code`** (`getProductByBarcode`) for scan lookup; product search now also matches sku/barcode.
- ✅ **Scan-to-add (req 1)**: Products page has a "Scan barcode" input — matched IMEI-tracked product jumps straight to the Add-IMEI (`UnitsModal`) flow (no duplicate product); unknown barcode pre-fills a new-product form with that code. So re-scanning an existing model only adds a new IMEI.
- ✅ **Barcode generator + label printing (req 15)**: dependency-free **Code128-B** SVG generator `client/src/components/print/Barcode.jsx` (verified: 107-entry standard pattern table, correct checksum — scannable, no npm install). `BarcodeLabelSheet.jsx` = A4 grid of labels (name, variant, barcode, price, SKU). `LabelPrintModal.jsx` = quantity (presets 10/20/50/100 + custom, max 200) + label size (2/3/4/5 per row) + live preview + Print. Reachable from a **Print-Label (tag) action** per product row and a "Print Label" button in the edit modal. QR-ready (swap the Barcode component).
- Verified: server `node --check` + import-chain ✓; client `vite build` ✓; Code128 table integrity script ✓.
- **Note:** no barcode *scanner hardware* integration needed — USB/BT barcode scanners act as keyboards, so the scan `<input>` + Enter handler works with them directly.

### ✅ Phase 4 — Recent Orders detail/edit/reprint + real-time Due + Due invoice  *(done 2026-07-13)*
- ✅ New **DuePayment** model `server/src/models/DuePayment.js` (business, customer, sale?, amount, method, previousDue, remainingDue, date, collectedBy) — due history + balance source + req-11 receipt data.
- ✅ **Balance engine gap CLOSED** (the Phase 2 caveat): `balanceService.computeBalances` now adds `Σ DuePayment.amount by method` to inflow. Due collections now move the right balance.
- ✅ `saleController`: `getSale` returns `{sale, duePayments}`; new **`PATCH /api/sales/:id`** (`updateSale` — edits discount/paid/paymentMethod/customerName, recomputes total/due/profit, syncs `customer.totalDue` by delta); new **`POST /api/sales/:id/collect-due`** (`collectSaleDue` — per-invoice due payment → DuePayment + sale.due↓ + customer.totalDue↓ + settles `paymentMethod` when due=0 so **DUE badge clears, req 4**). Routes wired in `saleRoutes.js`.
- ✅ `customerController.collectDue` upgraded: takes `method`, allocates across the customer's unpaid invoices oldest-first (updates each `Sale.due` → real-time), records a DuePayment, returns receipt data. `customerHistory` now also returns `duePayments`.
- ✅ Frontend: `components/OrderDetailsModal.jsx` (reusable) — opens from Dashboard **Recent Orders (rows now clickable** via new `DataTable onRowClick`); shows items/IMEI/customer/totals; **Reprint**, **Edit**, **Collect Due** (prints the due invoice). New `components/print/DuePaymentInvoice.jsx` (req 11: customer, product, IMEI, purchase date, total, previous paid, current payment, remaining due, method, date). `ThermalReceipt` "Paid" now shows `total − due` (real-time). Customers page collect-due gained a **method** select; `DueReceipt` shows the method.
- ✅ Dashboard Recent Orders "Pay" column shows DUE in red; clicking refreshes summary after any change.
- Verified: server `node --check` + import-chain ✓; client `vite build` ✓.
- **Edge case logged:** `sale.paid` = at-sale payment (immutable, drives balance via `paidVia`); post-sale payments go through **Collect Due** (DuePayment), not by editing `paid`. Editing `paid` on an invoice that *already had* due collections can double-count in balances — intended path is Collect Due. Line-item edits (add/remove products) are out of scope for `updateSale` → handled by Return/Exchange (Phase 9).

### ✅ Phase 5 — Service & Repair profit  *(done 2026-07-13)*
- ✅ **Semantic fix (req 9 core bug)**: previously the customer invoice itemized "Service Fee" + "Parts Cost" as two lines, which leaked the shop's internal parts cost to the customer. Now `ServiceJob.serviceFee` is the FULL customer-facing bill; `total = serviceFee` (no longer `serviceFee + partsCost`). `server/src/models/ServiceJob.js` + `serviceController.js` (`computeTotal`/`computeProfit`).
- ✅ New **`technicianCost`** field (internal, alongside `partsCost`) + stored **`profit`** field = `serviceFee - partsCost - technicianCost`, recomputed on create/update.
- ✅ New **`paymentMethod`** field (cash|bank|bkash|nagad|rocket|card) on ServiceJob — tender for the `paid` amount.
- ✅ **Balance engine**: `balanceService.computeBalances` now adds `Σ ServiceJob.paid by paymentMethod` to inflow, so service payments move the right balance (req 9 "payment updates balances").
- ✅ **Dashboard**: `dashboardController` returns period-scoped `summary.service = {revenue, partsCost, technicianCost, netProfit, count}` (respects the existing period/from/to filter). `Dashboard.jsx` shows a **Service & Repair** stat row (only when the shop has jobs in the period).
- ✅ **Customer invoices fixed**: `ServiceThermal.jsx` and `ServiceInvoice.jsx` (A4, currently unused/no page imports it but fixed for consistency) now show a single **"Service Charge"** line — no parts-cost breakdown reaches the customer.
- ✅ `Services.jsx`: form now has a clearly-labeled **Service Charge** (customer bill) field, a boxed **internal-costs** section (Parts Cost + new Technician Cost, captioned "never shown to the customer"), a **Payment Method** select, and a live **profit preview**. Job list gained a **Due** column.
- Verified: server `node --check` + import-chain ✓; client `vite build` ✓.
- **Scope note:** no due-payment ledger for service jobs (unlike Sale/DuePayment in Phase 4) — `paid`/`paymentMethod` are simply mutable fields, matching the pre-Phase-4 Sale pattern. Adding a full ServiceDuePayment ledger was out of scope for req 9; flag if the client wants per-payment service due history later.

### ✅ Phase 6 — EMI / Installment full  *(done 2026-07-13)*
- ✅ **Full KYC on `Installment`** (`server/src/models/Installment.js`): `customerPhone`, `customerNid`, `presentAddress`, `permanentAddress`, `fatherName/Nid/Phone`, `motherName/Nid/Phone`, `guarantorName/Phone/Nid/Address` — snapshotted per plan (not on the shared Customer model, since most customers aren't EMI).
- ✅ **Product/IMEI linkage + stock deduction (req 10 core)**: `Installment.product`/`unit`/`imei1`/`imei2`/`serial`. `installmentController.createInstallment` — for serial-tracked products, validates the scanned unit is in-stock, marks it `sold`, stamps warranty (same logic as `saleController.createSale`), resyncs `Product.stock`; for plain-qty products, decrements `Product.stock` by 1. New `PhoneUnit.installment` ref (parallel to `.sale`) for traceability; `unit.sale` stays `null` for EMI-sold devices (Warranty-check page doesn't require it).
- ✅ **Barcode autofill (req 10)**: `Installments.jsx` "New EMI Plan" form has a barcode-scan input (`GET /products/barcode/:code`) that fills item name/price; if the product is serial-tracked, a second IMEI-scan input appears (`GET /units/lookup`) to pick the exact device.
- ✅ **Payment methods everywhere money moves**: `downPaymentMethod` on the plan + per-row `schedule[].method` (set via the new "Collect Instalment Payment" modal, replacing the old one-click mark-paid). `balanceService.computeBalances` now includes EMI down payments + paid schedule rows by method — EMI payments move the right balance (parity with Sale/Service).
- ✅ **Dashboard EMI Receivable, separated from regular Due (req 10)**: `dashboardController` sums the `balance` virtual across all `active` Installments → `summary.emiReceivable` + `activeEmiCount`, kept distinct from `summary.totalDue` (which stays sales-only). Shown as its own card on both the main Dashboard and a 3-card row (Receivable / Active / Completed) atop the Installments page.
- ✅ **Per-instalment payment invoice (req 10)**: new `components/print/EmiPaymentInvoice.jsx` (thermal) — customer, product, IMEI, instalment no/total, previous paid, this payment, method, remaining balance. Printed automatically after collecting a payment, and reprintable anytime from the schedule table (🖨 icon on any paid row).
- Verified: server `node --check` + import-chain ✓; client `vite build` ✓.
- **Scope note:** EMI plan creation assumes qty 1 (one financed item per plan) — matches how mobile-shop EMI is actually used (one phone per plan). Editing an existing plan's item/KYC after creation isn't supported (only instalment payments + delete) — flag if the client needs plan editing later.

### ✅ Phase 7 — Supplier dashboard  *(done 2026-07-13)*
- ✅ **Balance engine gap CLOSED** (flagged since Phase 1): `Purchase.source` field added (cash|bank|bkash|nagad|rocket|card). `recordPurchase` + `paySupplier` now accept/store it. `balanceService.computeBalances` subtracts `Σ Purchase.paid by source` as **outflow** — paying suppliers now actually reduces the shop's balance (previously supplier payments were invisible to the balance engine, silently overstating cash/bank balances).
- ✅ New **`GET /api/suppliers/dashboard/summary`** (`supplierDashboard`) — aggregate `{totalPurchase, totalPaid, totalDue}` across all suppliers, **top-8 suppliers by due**, and **8 most recent purchases** (across all suppliers, supplier-name populated). Existing per-supplier ledger/ledger-print endpoints untouched.
- ✅ `Suppliers.jsx`: new dashboard section — 3 stat cards (Total Purchase / Total Paid / Total Due) + "Top Suppliers by Due" table + "Recent Purchases" table, above the existing supplier list (which already showed per-row due). Purchase/payment modals gained a **"Paid From" / "Pay From"** select; both submit paths now call a combined `refreshAll()` so the dashboard updates **real-time** on any purchase or payment (req 12).
- Verified: server `node --check` + import-chain ✓; client `vite build` ✓.
- **Note:** existing per-supplier CRUD, purchase recording, payment, and ledger/print (from before this project started) were left as-is — only the missing dashboard aggregation + balance-engine wiring were added.

### ✅ Phase 8 — Advanced Reports & Print/PDF  *(done 2026-07-13)*
- ✅ New **`GET /api/reports/advanced?from=&to=`** (`server/src/controllers/reportController.js`, mounted at `/api/reports` in `routes/index.js`) — one date-ranged aggregation across `Sale`, `Purchase`, `Expense`, `Product`, `Customer`, `Supplier` + `balanceService.computeBalances`. Returns: `totals` (sales/purchase/profit/expense/netProfit/salesCount), `balances` (cash/bank/bkash/nagad/rocket/card — current, not date-ranged, same as Dashboard), `customerDue`, `supplierDue`, `productWise` (per-product qty/revenue/profit for the range), `stock` (totalProducts/totalQty/totalValue/lowStockCount + per-product snapshot).
- ✅ **Print/PDF (no new dependency)**: reused the existing `print-a4` CSS + `PrintWrapper` pattern (same as every other invoice/receipt) — `window.print() → Save as PDF` gives a PDF export for free, consistent with the dependency-free approach used for barcodes in Phase 3. Chose this over adding `jsPDF` since the app has zero print-related npm deps today.
- ✅ New `components/print/AdvancedReport.jsx` — A4 layout with sections: Financial Summary, Balances, Outstanding Dues (customer + supplier), Product-wise Sales & Profit (with totals row), Stock Summary (totals + per-product table, low-stock rows bolded).
- ✅ `Finance.jsx` gained a **From/To date range** + **"Advanced Report"** button (defaults to current month) that fetches `/reports/advanced` and opens the print preview. Left the existing "Print Report" (daily/monthly sales-only) button untouched — it serves a different, quicker use case.
- Verified: server `node --check` + import-chain ✓; client `vite build` ✓.
- **Note:** `balances` in this report is a **current snapshot** (money on hand today), not scoped to the from/to range — matches how the Dashboard already presents balances (Phase 2 decision), so behavior is consistent across the app.

### ✅ Phase 9 — Return & Exchange  *(done 2026-07-13)*
- ✅ New **`Return`** model (`server/src/models/Return.js`) — `sale` ref, `items[]` (qty, unitPrice, purchasePrice, unit/imei snapshot, `condition: resellable|damaged`), `reason`, `returnValue`, `dueReduction`, `cashRefund`, `storeCreditIssued`, `refundMethod`; exchange-only: `exchangeSale` ref + `priceDiff`. Full permanent audit trail.
- ✅ **Model support**: `Sale.items[].returnedQty` (prevents over-return, index-addressed) + `Sale.returned` (true once every line is fully returned); `Product.returnable` (admin can mark specific products ineligible, req 14 "Smart Business Rules"); `PhoneUnit.status` gained `'damaged'` (damaged/service stock, never resold); `Customer.storeCredit`; `Business.settings.returnWindowDays` (3/7/30, default 7).
- ✅ **`POST /api/returns`** (`createReturn`) — full/partial return against a Sale: validates per-line available qty + `product.returnable`, reverses stock (resellable → back to `in_stock`/`product.stock++`; damaged → `PhoneUnit.status='damaged'`, product NOT restocked), applies `returnValue` first against the sale's existing `due` (dueReduction), then refunds/store-credits whatever was already paid. Sale's `total/subTotal/profit/due` all reduced in place so Reports/Dashboard/Inventory reflect it automatically (req 14's "auto-reflect" rule — no separate sync needed). Wrapped in a Mongo transaction (same pattern as `createSale`).
- ✅ **`POST /api/returns/exchange`** (`createExchange`) — same return-out logic, then builds a brand-new linked `Sale` for the replacement item (reuses `createSale`'s stock-deduct/IMEI-assign/warranty-stamp logic inline), auto-computes `priceDiff = newItemTotal − exchangeCredit`: positive → customer pays the difference (by chosen method, partial `paidNow` supported); negative → refunded or store-credited per `settlementType`. `Return.exchangeSale` links old ↔ new invoice permanently.
- ✅ **Business rule enforcement**: `assertWithinWindow()` — past `returnWindowDays`, only `owner`/`superadmin` may proceed (staff gets a 403 naming the window); enforced identically for both return and exchange.
- ✅ **Balance engine**: `balanceService` now subtracts `Return.cashRefund` (by `refundMethod`) as outflow; store-credit is correctly excluded (no cash leaves the shop); the exchange's new Sale feeds the existing sales-inflow aggregation automatically (no extra code needed).
- ✅ Frontend: **`ReturnExchangeModal.jsx`** (opened via a new "Return / Exchange" button in `OrderDetailsModal`, only shown when some line still has returnable qty) — per-line checkbox + qty + condition selector, live return-value/due-applied/refund preview, tab toggle Return vs Exchange; Exchange tab reuses the barcode+IMEI-scan pattern from Products/Installments for picking the replacement item, live price-diff preview. **`Returns.jsx`** — new permanent history page (date, invoice, customer, type, items+condition, reason, value, settlement breakdown), added to Sidebar + routes. `Settings.jsx` gained the Return Window select; `Products.jsx` gained an "Eligible for Return/Exchange" checkbox; `Customers.jsx` shows a Store Credit column.
- Verified: server `node --check` (all 10 touched/new files) + import-chain ✓; client `vite build` ✓.
- **Scope decisions (flag if the client wants more later):** (1) exchange supports **one replacement item** per transaction (matches the common 1-for-1 device-swap case in a mobile shop) — multi-item exchange isn't wired up. (2) `Customer.storeCredit` is tracked, shown, and issuable, but **not yet spendable at POS checkout** — that would need a POS change to apply a customer's credit balance against a new sale; not part of req 14's literal ask but a natural follow-up. (3) No dedicated return/exchange print receipt was added (return is logged + visible in the new Returns history instead) — can add if the client wants a customer-facing return slip.

### ✅ Phase 10 — Data Import & Export + Backup  *(done 2026-07-13)*
- ✅ **Dependency-free CSV** (`server/src/utils/csv.js`) — `toCSV`/`parseCSV`, a real state-machine parser (handles quoted commas/newlines/escaped quotes), round-trip tested. Same "no new npm package" philosophy as Barcode (P3) and Advanced Report (P8) — CSV opens natively in Excel, so it satisfies the "Excel (.xlsx)" ask without a binary-xlsx dependency; JSON covers the explicit "System Backup/Migration" format.
- ✅ **Export** (`GET /api/export/:entity?from=&to=&format=csv|json`, `exportController.js`) — every entity from req 13's export list: Customers, Suppliers, Products/Stock, IMEI/Serial, Sales History, Purchase History, Expense History, EMI/Installment Records, Due List. Sales/Purchase/Expense support an optional date range. "Reports" PDF export was already solved in Phase 8 (Advanced Report → browser print-to-PDF) — not duplicated here.
- ✅ **Full Database Backup** (`GET /api/export/backup/full`) — one JSON file with every business-scoped collection (Products, Units, Customers, Suppliers, Purchases, Sales, Expenses, Installments, Employees, Funds, ServiceJobs, Returns, DuePayments) + business profile snapshot. Satisfies "সম্পূর্ণ Database Backup" + "JSON (System Backup/Migration)".
- ✅ **Import** (`importController.js`, `POST /api/import/:entity/validate` dry-run → `POST /api/import/:entity/commit`) — implemented for **Customers, Suppliers, Products (incl. stock/category/brand/barcode), Expenses, and IMEI/Serial** (against a chosen existing product). Validation runs before any write and returns a **per-row error report** (row number + message); `units` additionally checks the *database* for IMEI/serial duplicates during the dry-run, not just the file. Commit **upserts by natural key** (Customer by phone, Supplier by name, Product by barcode) so re-importing the same file is safe. `GET /api/import/:entity/template` downloads a ready-made CSV header+example row per entity.
- ✅ **Restore** (`POST /api/import/backup/restore`) — additive-only restore of the backup's Products/Customers/Suppliers/Expenses into the current business (never deletes/overwrites existing data).
- ✅ **Import/Export history** — new `ImportExportLog` model; every export/import/backup/restore action is logged (entity, format, record count, error count, who) and shown in a history table.
- ✅ Bumped the Express JSON body limit `2mb → 10mb` (`server/src/app.js`) so a full backup/restore or a sizeable CSV doesn't get rejected ("বড় আকারের Data নিরাপদ Processing").
- ✅ Frontend: new **`ImportExport.jsx`** page (Sidebar → "Import / Export") with sections for Export (per-entity buttons + optional date range), Full Backup download, Import (entity picker → template download → file → Validate → error table → Import), a dedicated IMEI/Serial import (product picker + file), Restore (file + confirm dialog), and the History table.
- Verified: server `node --check` (all new/touched files) + full app import-chain ✓ (including the `app.js` body-limit change); client `vite build` ✓; CSV parser/writer round-trip tested at the shell (quoted commas, embedded quotes, embedded newlines all preserved correctly).
- **Scope decisions (flag if the client wants more later):** (1) **Sales History, Purchase History, EMI/Installment data, Due Information, and Employees are NOT importable** in this pass (only exportable) — these are relational/computed (profit, stock deduction, schedules, linked customers) and re-deriving that correctly from a spreadsheet needs much more validation tooling than the flat entities; importing them incorrectly risks corrupting financial/inventory state, so they were deliberately left out rather than shipped half-verified. (2) **Restore only recreates the 4 non-relational entities** (Products, Customers, Suppliers, Expenses) — Sales/Purchases/Installments/Returns/Employees reference each other by ID, and restoring them would need an ID-remapping pass to stay consistent; they're still fully exportable for record-keeping/migration. (3) True binary `.xlsx` was not implemented — CSV (Excel-openable) + JSON cover every named use case (import, export, backup/migration) without adding a dependency.

---

### ✅ Phase 11 — 2nd round of client requests (`next promt.txt`, 2026-07-15)  *(done 2026-07-15)*
A second, separate `next promt.txt` (5 new numbered requests, Bangla) + 4 new reference
screenshots arrived after all 10 original phases shipped. Mapped 1:1 to work below.

1. **Split / multi-tender payment at POS** (e.g. ৳10,000 sale paid ৳2,000 bKash + ৳1,000 card + ৳3,000 cash + rest due):
   - ✅ `Sale.payments[]` array (`{method, amount}`) added alongside the existing single `paid`/`paymentMethod`/`paidVia` fields (kept for back-compat — EMI/Exchange/older clients still write a single tender). `paymentMethod` enum gained `'split'` (badge shown when >1 tender used).
   - ✅ `saleController.createSale` accepts `payments:[{method,amount}]`; synthesizes a single-line array from legacy `paymentMethod`+`paid` when `payments` isn't sent. `updateSale` (single-tender editor) collapses/rewrites `payments` to match whenever `paid`/`paymentMethod` is edited, so it never goes stale next to the balance engine.
   - ✅ `balanceService.computeBalances` sums sales-in by unwinding `payments[]` when present, falling back to legacy `paid`+`paidVia` for sales with no `payments` recorded (old data, EMI, exchange).
   - ✅ `POS.jsx` cart: single "Payment Method" dropdown replaced with repeatable payment rows (method + amount + "=" fill-remaining button + remove); defaults to full-total-via-first-method if left untouched (matches old default-paid-in-full behavior). `ThermalReceipt`, `OrderDetailsModal`, and `PaymentPie` (new `split` color) all show the per-tender breakdown when a sale used more than one method.
2. **Add Product: Supplier/Dealer field + multi-item + inline IMEI, auto-flows to Suppliers**:
   - ✅ New `POST /api/products/batch-with-supplier` (`productController.createProductsWithSupplier`) — find-or-creates the `Supplier` by name (case-insensitive), creates every submitted product (with inline `PhoneUnit` rows for serial-tracked items — no more separate "save, then add IMEIs" step), then writes **one** `Purchase` (kind:'purchase') linking all the created products to that supplier, and bumps `supplier.totalPurchase/totalPaid`. De-dupes IMEI/serial across the whole batch + against existing DB records before writing anything.
   - ✅ `Products.jsx` "Add Product" (create only — Edit is untouched) now shows a repeatable item list (`+ Add Item`) with an inline IMEI/serial textarea per serial-tracked item, plus an optional Supplier/Dealer name+phone + Paid-now/Paid-From section. **Zero regression**: a single item with no supplier name still calls the original `POST /products` (+ `POST /units` if IMEIs were typed inline) — the exact old behavior, just one click instead of two.
3. **Supplier dashboard: per-product breakdown** (e.g. "bought 10 Samsung S23 Ultra from Anik Telecom — koyta bikri holo, koyta ache"):
   - ✅ New `GET /api/suppliers/:id/products` — aggregates `Purchase.items` (kind:'purchase') for that supplier by product → purchased qty, joined with shop-wide sold qty (from `Sale.items`) and live `Product.stock`. **Scope note:** sold-qty/current-stock are shop-wide per product, not exclusively attributable to one supplier's batch, since a Sale line doesn't record which supplier a specific unit came from — only purchases that reference a real `Product` (i.e. made via the new Add-Product-with-supplier flow) show up here; the older free-text "Record Purchase" modal on the Suppliers page still records ad-hoc line items with no product link, so those don't appear in this breakdown (unchanged, pre-existing behavior).
   - ✅ `Suppliers.jsx` — new "Products" (box icon) action per supplier row opens `SupplierProductsModal` showing Product / Purchased / Sold / Current Stock.
4. **Partial Fund withdrawal** (e.g. added ৳20,000 capital, want ৳10,000 back now, rest later):
   - ✅ `Fund.type` enum `['add','withdraw']` (default `'add'`). `balanceService` nets withdrawals as an outflow (not an expense — same "not income/expense" rule as Add Fund). `fundController.createFund` accepts `type`.
   - ✅ `Finance.jsx` — "Withdraw Fund" button opens the same modal as Add Fund with an Add/Withdraw toggle; Fund History table gained a Type badge + signed (+/-) amount.
5. **Balance Transfer** (e.g. move ৳5,000 from bKash to Cash in one step):
   - ✅ New `Transfer` model + `transferController` (create/list/delete) mounted at `/api/transfers`. `balanceService` subtracts from `fromMethod`, adds to `toMethod`.
   - ✅ `Finance.jsx` — new "Transfer Balance" button/modal (From/To method selects showing current balance, amount, note) + a Balances snapshot row + a Transfer History table.
- Verified: server `node --check` on every touched/new file + full `app.js` import-chain ✓; client `vite build` ✓ (only a pre-existing unrelated `LanguageContext.jsx` duplicate-key warning, not introduced by this phase).
- **Scope decisions (flag if the client wants more later):** (1) Editing an existing invoice (`OrderDetailsModal`) still only supports a single tender — split-payment is a checkout-time feature per the client's example; if they later want to *edit* a sale into a split payment, that's a follow-up. (2) The "Record Purchase" modal on the Suppliers page (manual/ad-hoc entry, pre-existing) was left as-is and still doesn't link products, so its items don't feed the new per-product breakdown — only the new Add-Product-with-supplier flow does.

### ✅ Phase 12 — 3rd round of client requests (`next promt.txt`, 2026-07-15)  *(done 2026-07-15)*
A third, even shorter `next promt.txt` (2 new requests, Bangla) + 1 new reference screenshot
arrived right after Phase 11 was deployed and confirmed working.

1. **Category needs a "box system"** so searching by category only surfaces that section's products (mobile shop sells phones *and* accessories, mixed in one catalog):
   - ✅ **Category filter** on the Products list: new dropdown next to Search (`categoryFilter` state) wired to the existing `?category=` query param on `GET /api/products` (already supported server-side since Phase 3/base — no backend change needed here). Selecting a category shows only that section's products.
   - ✅ **Category combobox** (turns the free-text Category field into a proper "box"): both the Edit-Product form and the create-mode `ItemBlock` now use `<input list="category-options">` backed by a shared `<datalist>` of every category ever seen for the business (`categoryOptions` state — only grows, so it doesn't shrink away when the list is currently filtered). Keeps existing category values selectable (preventing "Mobile" vs "mobile" vs "Mobiles" fragmentation) while still allowing a brand-new category to be typed when genuinely needed.
2. **Product name should show its supplier/dealer** so the owner can see whose stock is whose:
   - ✅ New `Product.supplier` field (ObjectId ref `Supplier`, nullable). `productController.getProducts`/`updateProduct` populate it (`{_id, name}`); `createProductsWithSupplier` (Phase 11's batch endpoint) now stamps it automatically on every product created through the Add-Product-with-supplier flow. `updateProduct` casts an empty-string `supplier` to `null` (so clearing it via "— None —" doesn't throw a CastError).
   - ✅ `Products.jsx`: list shows the supplier name as a small subtext under the product name (for every business type, not just Mobile); the Edit form gained a Supplier/Dealer `<select>` (existing suppliers, "— None —" to clear) so a product's supplier can be set or corrected at any time, even for products added before this feature or via the plain single-item flow.
- Verified: server `node --check` + import-chain ✓; client `vite build` ✓ (same pre-existing unrelated `LanguageContext.jsx` warning).
- **Scope note:** the category dropdown is a soft "box" (combobox), not a hard-locked enum — a new category can still be typed, matching how the app already lets each business type default to its own starting categories (Mobile/Medicine/General) without a rigid fixed list.

### ✅ Phase 13 — Staff logins + module permissions, partial salary payments (2026-07-16)
Two connected asks, freeform (no `next promt.txt` this round): (1) Employees should be
able to get a dashboard login + password reset, with the owner controlling exactly which
dashboard sections each one can see (checkbox grid, editable anytime). (2) Salary payments
should support paying in parts (e.g. salary ৳20,000, pay ৳10,000 now, settle the rest
later), flowing straight into Finance without a separate manual expense entry.

1. **Staff login accounts + granular module permissions**:
   - ✅ `User.permissions: [String]` (only meaningful for `role:'staff'` — owner/superadmin always have full access regardless). `Employee.user` (ref `User`, nullable) links an HR record to its optional login.
   - ✅ New `requireModule(...keys)` middleware (`server/src/middleware/permissions.js`) — no-ops for owner/superadmin, 403s a staff user missing the module. Applied to every module's route file (`products, pos, customers, suppliers, employees, finance` [expense+fund+transfer+report], `returns, import-export, marketing, crm, activity, dashboard, installments, services, subscription`); `units` accepts any of `products/pos/installments/warranty` since it's shared across those pages. `businessRoutes` GET stays open (every page needs basic business context) and PUT stays hard owner-only as before — the `settings` permission only hides/shows the nav link for staff. Single source of truth for module keys: `server/src/config/modules.js` (mirrored in `client/src/constants/modules.js`).
   - ✅ `employeeController`: `createEmployee`/`updateEmployee` accept `{ grantLogin, permissions }` — creates/updates the linked `User` (role:'staff'), returns a freshly generated temporary password **once** (never stored/viewable — same pattern as the Phase-11-era admin owner-reset). New `POST /employees/:id/reset-password`. Deactivating (`setEmployeeStatus`) or deleting an employee also deactivates their linked login, so a let-go employee can't keep dashboard access.
   - ✅ `Employees.jsx`: Add/Edit modal gained a "Login Access" section — grant-login checkbox + a module checkbox grid (mobile-only modules hidden for non-mobile shops), a "Reset Password" action once a login exists, and a one-time password-reveal modal (copy button, closes forever once dismissed). `Sidebar.jsx` filters nav links to a staff user's granted modules (owner/superadmin see everything, unchanged) using the same module keys.
   - **Scope note:** an Employee's contact `email` field doubles as its login email when granting access (no separate field) — must be globally unique across `User` (enforced, clear error). Login can be granted but not "ungranted" from the UI (only permissions adjusted); full revocation is via deactivating/deleting the employee, which already existed as an action.
2. **Partial/due salary payments**:
   - ✅ `Employee.salaryHistory[]` entries gained `paidAmount` + a `payments[]` ledger (`{amount, method, date}`); `status` is now `due | partial | paid` (computed from `paidAmount` vs `amount`), replacing the old binary paid/due flag.
   - ✅ `paySalary` is now "collect a payment for this month" rather than "set this month's status": creates the month's record on first call (defaulting to `monthlySalary`, or an explicit `totalAmount` for a pro-rated month), clamps the payment to the remaining due, and books its own `Expense` (category "Salary") for the actual amount paid — every call is a real, discrete money movement, so no idempotency guard is needed (unlike the old single-shot version) and partial payments naturally sum correctly in the balance engine (already aggregates all Expenses by source).
   - ✅ `Employees.jsx` salary modal shows Total / Paid so far / Due for the selected month, a "Pay full due" shortcut, and lets any partial amount be recorded — reopening the same month later collects the remainder. `SalarySlip.jsx` print now shows Total Salary / This Payment / Total Paid / Remaining Due instead of a flat paid/due line.
- Verified: server `node --check` across every server file + full `app.js` import-chain ✓; client `vite build` ✓ (same pre-existing unrelated `LanguageContext.jsx` warning).

### ✅ Phase 14 — Stock Print + Smart Stock Import (`next promt.txt` + `reference data/`, 2026-07-18)
A fourth `next promt.txt` (2 requests) arrived along with a new `reference data/` folder
(replacing `reference images/`) containing 2 real legacy-software exports (`Smart Phone
.xls`, `Bar Phone.xls`, 552 + 460 items across 25 + 17 suppliers) and one new screenshot.

1. **Stock Print (Products page)**:
   - ✅ New "Stock Print" button next to Add Product. One click fetches all products for whatever category is currently selected in the existing category filter (or all, if "All Categories"), filters to `stock > 0`, and groups them by `supplier.name` (falling back to "— No Supplier —"). New `components/print/StockReport.jsx` (A4, reuses the existing `PrintWrapper` pattern — viewable on-screen immediately, Print button gives PDF via the browser same as every other report in this app) shows each supplier's section with a per-supplier product-count/qty subtotal and a grand total. No backend change needed — pure client-side aggregation of the already-available `GET /products` (category filter + `supplier` populate already existed from Phase 12).
2. **"Understand any file format" stock import** — the client uploaded 2 real files from their previous inventory software (an HTML "Itemwise Stock Report" saved with a `.xls` extension — not a real binary spreadsheet — with `Company Name : X` sections grouping items under each supplier/dealer):
   - ✅ New `server/src/utils/smartImport.js` — `parseUploadedFile(buffer, filename)` sniffs the real shape of an uploaded file regardless of its extension: (a) the legacy HTML-report shape (`Company Name :` / `Supplier :` / `Dealer :` markers followed by a table) → walks it in document order pairing each heading with its item rows; (b) a generic HTML table (no grouping) → takes the largest table; (c) real binary `.xlsx`/`.xls` → parsed via the new `xlsx` (SheetJS) dependency; (d) CSV/TXT → the existing dependency-free `parseCSV`. Paths (b)–(d) all go through **fuzzy header aliasing** (`Item Name`/`Product`/`Name` → name, `Category Name` → category, `Stock balance`/`Qty`/`Balance` → stock, `Company Name`/`Dealer`/`Supplier` → supplier, plus barcode/SKU/purchase/selling price aliases) so an exact column template is never required. Verified against both real reference files: 552/460 rows and 25/17 suppliers extracted correctly; also verified against a synthetic CSV with deliberately different header names (`Item Name`, `Dealer Name`, `Qty`, `Cost Price`, `MRP`) to confirm the fuzzy path.
   - ✅ New `POST /api/import/smart/preview` + `POST /api/import/smart/commit` (multipart file upload via a new `uploadDataFile` multer instance, 10MB limit, no mimetype filter since browsers report all sorts of things for `.xls`/`.csv`/`.txt`) — `ownerOnly`, gated by the existing `import-export` module permission (Phase 13). Commit find-or-creates a `Supplier` per distinct name and upserts each `Product` by `name+category` (no barcode/SKU exists in this kind of legacy data), setting `stock` and linking `product.supplier`. **No `Purchase`/`Expense` is booked** — this is a one-time historical-data migration, not a live purchase transaction (unlike the Phase-11 Add-Product-with-supplier flow).
   - ✅ New "Smart Stock Import" section on the Import/Export page: file picker (any of `.xlsx/.xls/.csv/.txt`) → Preview (detected format badge, supplier list, sample rows, error list, a clear amber note when the source file had no prices) → Import.
- **Scope decisions:** (1) Purchase/selling price default to ৳0 when absent from the source file (this client's legacy data has none) — the owner fills these in afterward via the normal Edit Product screen; the preview explicitly flags this rather than inventing prices. (2) Imported products are plain qty-stock (`trackSerial: false`) since the legacy data has no IMEI/serial numbers at all — converting a specific product to per-unit IMEI tracking afterward uses the existing "Manage IMEIs" feature, unchanged. (3) Upsert key for this importer is `name+category` (case-insensitive) since legacy exports have no barcode/SKU — re-running the same file is still safe (updates stock/supplier rather than duplicating).
- Verified: server `node --check` + full import-chain ✓ (including the two new dependencies, `xlsx` and `cheerio`); client `vite build` ✓; the parser was run directly against both real reference files and a synthetic non-standard CSV before wiring it into the API, confirming correct extraction in all cases.
- **2026-07-18 follow-up (client feedback after using the importer):** imported products all landed as plain qty-stock (no IMEI tracking), but this is a Mobile shop where every device should be individually IMEI-tracked — the manual Add Product form already defaults that way (`trackSerial: isMobile`), Smart Import didn't. Fixed: `smartImportCommit` now looks up the business type and sets `trackSerial` accordingly on both the create AND update path, so simply re-uploading the same file also fixes already-imported products (matched by name+category, no duplicates). Preview response gained `defaultTrackSerial` so the UI can tell the owner upfront that IMEIs will need to be added per-device afterward via "Manage IMEIs" (the source data never had real IMEIs, only aggregate counts, so there's no way around that step).

### ⏭️ Phase 15 — Scan IMEI with AI (built, then fully removed at client request, 2026-07-18)
Client asked for an option to photograph a phone/box/IMEI sticker and have AI figure out
which product it is (with confirmation before anything is saved). Built: vision AI
capability in `aiService.js` (`generateVision`/`hasVisionAI`, Gemini/Anthropic/OpenAI only),
`POST /api/products/scan-ai` (photo → extracted fields + fuzzy product match, no DB writes),
and a "Scan IMEI with AI" modal on Products.jsx. Client then clarified their actual device
is a wand-style hardware barcode/IMEI scanner (plain digits only, no photo) — added a second
path, `POST /api/products/scan-imei`, matching by IMEI TAC-prefix (first 8 digits = exact
device model) against units already entered in the shop, no external lookup or guessing.
**Client then asked to remove the whole feature entirely** — fully reverted: both endpoints,
both controller functions, the vision-AI additions in `aiService.js` (unused elsewhere, so
removed rather than left as dead code), the `DataTable` `rowClassName` prop (only used by
this feature), and all related UI/state in `Products.jsx`. Nothing from Phase 15 remains.
- **Real bug found along the way, kept:** searching the Products page by an IMEI/serial that
  belonged to an in-stock unit returned "No data found" — `getProducts`'s search only matched
  `name`/`sku`/`barcode`, never `PhoneUnit` IMEI/serial. Fixed: search now also looks up
  matching `PhoneUnit`s and includes their linked products. Search placeholder updated to
  mention IMEI.
- Verified: server `node --check` + full import-chain ✓; client `vite build` ✓ (both after the
  Phase 15 removal and after the search fix).

### ✅ Phase 16 — Migration Excel template + existing-vs-new IMEI logic (2026-07-25)
Client wants a proper downloadable Excel/CSV format so shops migrating from another system
can export their data (product name, several IMEIs per product, buy/sell price, warranty,
seller name) and upload it here. Explicit rule: **if that product model already exists in
Products, only add the IMEIs to it** (don't touch its other fields); otherwise create the
whole product from the row. Any problem must show what's wrong and let the owner Accept
(proceed anyway) or Decline (skip) — not fail silently.

- ✅ New `migration` entry in `importController.js`'s `TEMPLATES` map (reuses the existing generic `GET /api/import/:entity/template` route — `GET /api/import/migration/template`): `Product Name, Category, Brand, Storage, Color, Buy Price, Sell Price, Discount %, Brand/Shop Warranty (months), Supplier / Seller Name, IMEIs (comma separated)`. **Bug found and fixed while building this**: `downloadTemplate` joined columns/example with a plain `,` — any example value containing a comma (the multi-IMEI example) would silently split into extra columns on re-import. Now escapes/quotes any field containing a comma, matching how `parseCSV` already expects quoted fields; verified the fixed template round-trips through `parseCSV` correctly.
- ✅ `smartImport.js` — new field aliases for `brand`, `storage`, `color`, `warrantyBrandMonths`/`warrantyShopMonths`, and `imeis` (accepts "IMEI", "IMEIs", "IMEI/Serial", etc.), extended to both the tabular-file path and the legacy-HTML-report path (which always leaves these blank — that source data never had them). Verified against a synthetic CSV with a real comma-separated multi-IMEI cell.
- ✅ `importController.js`:
  - `normalizeSmartRow` splits the IMEIs cell on comma/semicolon/newline into a de-duplicated array; when a row has IMEIs, `stock` is derived from how many were actually listed (not a separate stock column) — one unit per IMEI is the source of truth.
  - New `classifyRows()` — for every valid row, looks up whether a product with that exact name+category already exists (`'existing'`), and checks every listed IMEI against `PhoneUnit`s already in this business (`'conflict'` if any collide, showing which IMEI and which product already owns it) — else `'new'`. Conflict rows default **unaccepted**; everything else defaults accepted.
  - `smartImportPreview` now returns the full classified `rows[]` (not just a 20-row sample) plus a `conflictCount`, so the frontend can render a per-row accept/decline table instead of a blind sample.
  - `smartImportCommit` takes a new `skipRows` form field (JSON array of row indices the owner left unticked) and skips those entirely. For accepted rows: if the product already exists, its own fields are **never touched** — only its IMEIs are added (a defensive duplicate re-check still applies per-IMEI, so an accepted "conflict" row only skips the specific IMEIs that are truly already taken, not the whole row); if it doesn't exist, the full product is created from the row (including brand/storage/color/warranty/supplier) and its IMEIs added, `trackSerial` set true. Response now reports `createdProducts`, `existingProductsGivenImeis`, `addedUnits`, `skippedDuplicateImeis` separately instead of a generic created/updated count.
- ✅ `ImportExport.jsx` — "Download Migration Template" button; the preview results became a full per-row table (checkbox + product/category/supplier/stock + a status badge: 🟢 New Product / 🔵 "+ IMEIs → existing product name" / 🔴 conflict with the specific IMEI and which product already owns it, hover for full list) instead of a read-only sample; Import button now imports however many rows are ticked, and the success toast breaks down created vs. existing-updated vs. units added vs. duplicates skipped.
- Verified: server `node --check` + full import-chain ✓; client `vite build` ✓; parser tested directly against a synthetic multi-IMEI CSV; template-escaping bug caught and fixed via a direct round-trip test through `parseCSV` before considering this done.

### ✅ Phase 17 — Keyboard-only POS for Pharmacy (`next promt.txt` + `reference data/`, 2026-07-25)
A fifth `next promt.txt` (1 request, Bangla) + 1 screenshot of the **Pharmacy** POS page.
Ask: on a pharmacy POS the "Scan barcode / IMEI / serial" box should not exist; typing a
product name should suggest in-stock products, ↑/↓ picks one, **Enter adds it to the cart
and clears the box** so the next product can be typed immediately; when done adding, Enter
should jump **straight to the customer fields** — i.e. *"পুরো জিনিসটা মাউস ছাড়াই যেন কাজ করে"*
(the whole thing must work without a mouse). Frontend-only — the server already supports
everything needed (`GET /products?search=` matches name/sku/barcode, Phase 3/15).
- ✅ **Scan box hidden for Pharmacy** (`client/src/pages/POS.jsx`): the IMEI/barcode card now renders only when `supportsUnits` (`business.type !== 'pharmacy'`) — completing the 2026-07-14 "pharmacy has no barcode system" decision, which had gated the unit-results grid but left the scan input visible (exactly what the screenshot flagged). Mobile/General are untouched, and `autoFocus` moves to the name-search box when the scan box is absent, so the caret is already in the right place on page load.
- ✅ **Name-search suggestion dropdown with keyboard nav**: new `suggestList` (memoized) = matching in-stock items — for unit-tracking shops the matching unique-code **units first** (each adds one exact device), then products with `stock > 0`, capped at 40. Rendered as an overlay under the search box (highlight row, price, stock, unit code). ↑/↓ cycle (wrapping), **Esc** closes, the first match is highlighted by default so a plain type-then-Enter adds the obvious item. The highlighted row auto-`scrollIntoView({block:'nearest'})`, and hovering with the mouse moves the highlight, so mouse and keyboard stay in sync. The pre-existing product-card grid is deliberately left in place (mouse users / browsing) — nothing was redesigned, per §4.
- ✅ **Enter adds → box clears → focus stays put**: `pickSuggestion()` adds the product/unit, clears `search`, closes the dropdown and re-focuses the search input, so N products can be entered back-to-back with zero clicks. Serial-tracked products picked *by name* are refused with the existing "scan the IMEI/unit code" toast **without** clearing the typed text (so the code can be scanned instead) — same rule as clicking a card, no new behavior.
- ✅ **Full mouse-free Enter chain** (the "whole thing without a mouse" part): search (nothing to add) → **Customer Phone** → Customer Name → *(NID, mobile only)* → Discount → first Payment amount → **focus lands on the Complete Sale button** (visible focus ring; Enter/Space then completes). Deliberately does *not* fire checkout straight from the payment field — one explicit confirm keystroke prevents a stray Enter from completing a sale. Leaving the payment amount blank still means "paid in full via the first method" (pre-existing default), so the fast path is: type → Enter ×N → Enter → phone → Enter → name → Enter → Enter → Enter.
- ✅ **Customer-phone suggestions are keyboard-navigable too** (previously click-only): ↑/↓ + highlight + `scrollIntoView`, Esc closes. Unlike the product list, **nothing is highlighted by default** (`custIndex = -1`) — a bare Enter just moves to the name field and never silently attaches a half-matched customer to the sale (which would mis-post a due).
- ✅ **Loop closed after checkout**: `PrintWrapper` now closes on **Esc** (shared print modal — every invoice/report preview in the app gets this), and the POS print preview's `onClose` returns focus to the search box, so the next sale starts from the keyboard without touching the mouse.
- ✅ **Stale-suggestion guard (bug prevented while building)**: the product fetch is debounced 300 ms, so a fast typist could press Enter while the dropdown still held the *previous* keystroke's results — adding the wrong medicine. `suggestList` now re-checks every entry against what is typed *right now*, against the same fields the server matches on (name/sku/barcode for products, IMEI/serial/name for units), so a stale non-matching row can never be added by Enter.
- Verified: client `vite build` ✓ (only the pre-existing unrelated `LanguageContext.jsx` duplicate-key warning). **Not exercised in a live browser**: the only configured database is the client's production Atlas cluster (`server/.env`), and there is no local MongoDB — running the app would mean logging into and transacting against live shop data, so verification stopped at the build + a review of the interaction logic.
- **Scope decisions:** (1) the keyboard flow is enabled for **all** business types (it's the same add-to-cart path as clicking, strictly additive); only the *scan-box removal* is Pharmacy-specific, since Mobile/General genuinely need it. (2) Cart-line quantity editing and the Hold/Past-Invoices modals were left mouse-driven — the client's flow is "add items → customer → pay", and quantity is normally handled by scanning/typing the same product again (Enter increments the existing line).

### ✅ Phase 18 — POS quantity step + optional customer (`next promt.txt` + `reference data/`, 2026-07-25)
Same-day follow-up after Phase 17 shipped and the client used it (3 screenshots: the cart's
qty box circled, the "Customer name and phone are required" toast circled, and the Products
list). Two asks: (1) after Enter picks a product, focus should land in an **empty quantity
box**; type the number → Enter returns to the search box; repeat for 5 items; then
**Shift + Enter** goes to the customer phone section. (2) Customer phone/name must be
**optional for every shop type**.
- ✅ **Quantity step** (`client/src/pages/POS.jsx`): `addToCart(p, blankQty)` gained a keyboard mode that adds the line with an **empty** `qty` (`''`) instead of `1`; `pickSuggestion` sets `focusQtyKey`, and an effect focuses + `select()`s that line's qty input once it has painted (`qtyRefs` map keyed by `lineKey`). Enter in the qty box (blank counts as **1**) returns focus to the search box, so 5 items go in as: name → Enter → number → Enter → name → Enter → … Picking a product that is **already in the cart** does not silently bump its quantity any more — its qty box is focused with the value selected, so the typed number replaces it (mouse card-clicks still increment exactly as before, unchanged).
- ✅ **Shift + Enter → customer section**, from both the search box and the qty box (a blank qty is still committed as 1 first). Plain Enter on an empty search box also still jumps there (Phase 17 behavior kept as a second path). Serial-tracked units skip the qty step entirely — one device is always qty 1.
- ✅ **Customer optional (req 2)** — `server/src/controllers/saleController.js`: the hard `'Customer name and phone are required'` check on `POST /api/sales` is gone (that toast in the screenshot). `Sale.customer` already defaulted to `null` and `customerName` to `'Walk-in'`, and `collectSaleDue`/`DuePayment` already tolerated a null customer, so no model change was needed. POS labels now read "Customer Phone (optional)" / "Customer Name (optional)".
- ✅ **One deliberate exception, both sides:** if the sale leaves an unpaid balance, a phone or name is still required (`due > 0 && !custDoc` → 400 server-side; a focused, explanatory toast client-side). A due with no customer record can never be collected or chased — it would silently become unrecoverable money. Fully-paid sales (the walk-in case the client actually wants) need nothing.
- **Bug caught in my own guard before shipping:** the on-screen `due` treats a blank payment amount as unpaid, while checkout treats blank as *paid in full* (long-standing default). Basing the new guard on the displayed `due` would have blocked exactly the fully-paid walk-in sale this phase is meant to enable, so the check is computed from the payment rows actually being sent (`dueNow`), not from the display value.
- Verified: server `node --check` + full `app.js` import-chain ✓; client `vite build` ✓. Same limitation as Phase 17 — not exercised in a live browser (only the client's production Atlas DB is configured, no local MongoDB).
- **Noted, not changed:** the third screenshot showed an "Expired" badge on *Hand Sanitizer* (Products list). The badge logic is correct — `expiryStatus()` only returns `'expired'` for a real past `expiryDate`, so that product genuinely has a past date stored in the data. No code bug; flagged to the client in case they want expired items warned about or blocked at POS (a separate feature, not in this round's prompt).

### ✅ Phase 19 — Expired stock: warn at POS + block the sale (2026-07-25)
Follow-up on the Phase-18 note about the "Expired" badge: client asked to **show a warning
for expired products and make them unsellable**.
- ✅ **Server-side hard block** (the authority): new shared `server/src/utils/expiry.js` → `expiredError(product)` returns a ready-to-show message or null. `saleController.createSale` rejects any line whose product is expired (400), and `returnController.createExchange` applies the same rule to the **replacement item** it hands out (an exchange is an outgoing sale too, and it builds its own Sale inline rather than calling `createSale`, so it needed the check explicitly).
- ✅ **Boundary rule** (matches the client-side `expiryStatus()` badge, so UI and server never disagree): a product whose expiry date is **today** is still sellable; only a date *before* today is expired. Verified directly by running the helper over no-expiry / yesterday / today / tomorrow / past-string / future-string cases.
- ✅ **POS warnings + client-side block** (`client/src/pages/POS.jsx`): shared `expiryBlock(p)` helper drives everything — the check sits inside `addToCart` (one choke point covering card clicks, barcode/IMEI scans and the keyboard suggestion flow) plus `pushUnit`, `pickSuggestion` (refuses without clearing the typed name, so it's obvious which item was rejected) and `checkout`.
- ✅ **Visible warnings**, not just a toast: suggestion rows show the name struck-through in red with an "Expired — cannot sell" badge; product cards get a red ring, dimmed styling and the expiry date; near-expiry items (≤30 days, the existing `'soon'` status) get an amber "Expires in Nd" badge and **stay sellable** — a heads-up, not a block. Cart lines show "Expired … — remove to continue", covering a **held bill resumed after the item expired** (a real gap: the cart was built when the item was still valid), and checkout refuses with the same message before hitting the server.
- ✅ `phoneUnitController` unit-list populate now includes `expiryDate`, so unit rows can warn too (the single-unit `lookupUnit` already populated the whole product).
- Verified: `node --check` on all touched server files + full `app.js` import-chain ✓; `expiredError` boundary-tested at the shell ✓; client `vite build` ✓. Not exercised in a live browser (only the client's production Atlas DB is configured — see Phase 17).
- **Scope note:** expired products are still **visible** at POS (badged and blocked) rather than hidden, so counter staff can see they need pulling from the shelf. Purchase/stock-in of expired items is not blocked (a shop may legitimately record what's on the shelf), and Products/Import screens are unchanged — the Products list already badged expiry since before this project.

### ✅ Phase 20 — Smart Stock Import fix: only the product name is required (2026-07-26)
Client reported Smart Stock Import wasn't importing their data at all — *"তুমি হয়তো
মেন্ডেটরি ভাবে সবকিছু রেখেছো … আমি যদি শুধু ফোনের নাম তুলতে চাই সেক্ষেত্রে উঠতেছে না"*.
Diagnosis: the **controller** never required anything but a name (`normalizeSmartRow`), but
`smartImport.js`'s header matcher was **exact-match only** (`aliases.includes(norm)`), so a
column header it didn't literally know made `extractTabularObjects` throw
`Could not find a Name/Item column`, failing the whole file. Two concrete bugs:
- **Any unlisted header killed the import.** "Phone Name", "Mobile Model", "Item Description", a Bangla heading, or a header-less single column of names all failed — exactly the client's case.
- **Our own migration template silently dropped columns.** Phase 16's template ships `Supplier / Seller Name` and `IMEIs (comma separated)`; neither string was in the alias list, so an owner filling in the template we gave them got their supplier and IMEIs thrown away (worse than an error — a silent wrong result). `Discount %` was shipped in the template but never read at all.
- ✅ **Two-pass header matching** (`server/src/utils/smartImport.js`): pass 1 exact alias hit, pass 2 "header *contains* an alias". Fields are resolved specific-first with each header claimable only once, so `supplier` takes "Supplier Name" before the generic `name` can grab it, and `sku` takes "Item Code". Added a row-index blocklist (`Sl No`, `#`, `Sr No`, …) that can never become the product name, plus more aliases (`purchase rate`, `retail price`, `model name`, `description`, `particulars`, `group`, `pcs`, …).
- ✅ **Never hard-fail on an unrecognized name column**: it falls back to the first non-index column and returns `assumedNameColumn` so the preview says so in amber. The owner already reviews/accepts every row before anything is written (Phase 16), so a transparent guess beats rejecting the file.
- ✅ **Header-less single-column files** (`extractNameOnlyGrid`): a file that is just a list of names imports as products. Only applied when every populated row has exactly one value (nothing to misread), and the first line is dropped only if it actually looks like a header. Needed a raw-grid reader — `csv.js` gained `parseCSVRows` (array-of-arrays) with `parseCSV` now built on top of it (identical behaviour, round-trip re-verified), and the XLSX path reads `{header:1}` alongside the keyed rows.
- ✅ **`discountPercent` is now read and applied** (template promise honoured), and the legacy-HTML row shape carries the field so all paths stay uniform.
- ✅ **Preview transparency** (`ImportExport.jsx`): shows `Columns read: name ← "Phone Name", stock ← "Qty"` plus which columns were ignored, an amber warning when the name column was guessed, and the section text now states plainly that only the product name is required. The failure message when a file is truly unreadable says the same instead of naming a column requirement.
- Verified with a direct parser harness over 8 shapes: names-only with a custom header, names-only with **no** header, the official migration template (all 12 columns now map, multi-IMEI cell intact), foreign headers (`Mobile Model`/`Dealer`/`Qty`/`Purchase Rate`/`MRP`), an `Sl No` first column (correctly ignored, not used as the name), an unrecognizable Bangla header (guessed + flagged), the legacy HTML-as-.xls report (**regression pass** — supplier grouping still extracted), and an empty file. Server `node --check` + full `app.js` import-chain ✓; `parseCSV` quoted-comma/embedded-newline round-trip re-verified after the refactor ✓; client `vite build` ✓.
- **Not the cause, checked anyway:** `Product.barcode` is a plain (non-unique) index, so bulk-creating products without barcodes can't trip a duplicate-key error; the frontend's accept/skip wiring correctly defaults every non-conflict row to ticked.

### ✅ Phase 21 — Smart Import: the real blocker was per-row DB round-trips (2026-07-26)
After Phase 20 the client said the upload still failed and pointed at an actual file — found
at `C:\Users\MIHI\Desktop\shop-erp-saas-updated\Smart Phone .xls` (a **second, older copy**
of the project folder on the Desktop, not the working repo). It's the same legacy
"Itemwise Stock Report" shape as Phase 14: HTML saved as `.xls`, 220 KB, `ZOBAYER SMART ZONE`,
552 items under 25 `Company Name :` sections.
- **The parser was never the problem here** — run against the real file it returns 552 rows / 25 suppliers correctly, and the file passes multer (no mimetype filter, 220 KB « 10 MB limit).
- ✅ **Root cause: Phase 16's `classifyRows` made the preview O(N) database round-trips.** Before Phase 16 the preview did zero per-row queries; Phase 16 added a `Product.findOne` with a `$regex` on `name` **per row** so the owner could see new/existing/conflict status. On this file that's 552 sequential queries to the remote Atlas cluster, each an unindexed name scan over a catalogue that already holds the earlier imports. Behind the VPS's Nginx (default `proxy_read_timeout` 60s) the request dies before finishing, and the frontend's catch fell back to `'Could not read this file'` — which made a server-side stall look like a parse failure. `smartImportCommit` was worse: per row a findOne + create, then per IMEI a findOne + create, then a `countDocuments` + `updateOne` (~1100+ round-trips for this file).
- ✅ **Everything is now bulk**, constant round-trips regardless of row count (~6 for this file vs ~1104): new shared `productKey(name, category)` + `loadProductIndex(req)` load the whole catalogue once and match in memory (name **and** category now compared case-insensitively — previously category was case-sensitive, which could create "Smart Phone" vs "smart phone" duplicates); suppliers = one read + one `insertMany`; products = one read + one `insertMany` (deduped per name+category so repeated rows collapse onto one product); IMEIs = one clash read + one `insertMany` + one aggregate + one `bulkWrite` to resync `stock`/`trackSerial`. `escapeRegex` became dead code and was removed.
- ✅ **Honest error messages** (`ImportExport.jsx`): new `uploadError()` reports a 502/504 as "the server took too long … try splitting the file", and a dropped connection as such, instead of blaming the file.
- Verified: parsed the client's actual file end-to-end — 552 rows, 0 blank names, 0 in-file duplicates, 25 suppliers, 0 IMEIs, and the batching plan resolves to 552 unique products with no key collisions. Server `node --check` + full `app.js` import-chain ✓; client `vite build` ✓. The write path itself still hasn't been exercised against a live database (only the client's production Atlas is configured, no local MongoDB — see Phase 17), so the batched commit is verified by construction + logic review, not by an actual insert.
- **Worth telling the client:** in this report only **70 of the 552 items have a stock balance above 0** (237 units total) — the rest are genuinely 0 in the source file, so they will import as products with 0 stock. That's the file's own data, not a parsing loss.

### ✅ Phase 22 — Supplier due: direct edit alongside the existing flow (2026-07-26)
Client confirmed the Smart Import now works, then asked for a way to **edit a supplier's
due directly** — *"eta jemon ache temon o kaj korbe abar due direct edit korar o option
lagbe"* — i.e. Record Purchase / Pay due keep working exactly as they do, plus a direct edit.
- ✅ **New `PATCH /api/suppliers/:id/due`** (`adjustSupplierDue`) sets the due to an exact figure. `Supplier.due` is a virtual (`totalPurchase − totalPaid`), so it can't be written to; the endpoint moves `totalPurchase` to `totalPaid + target`, which lands the due exactly on the requested number **and never touches `totalPaid`** — money that actually left the shop stays recorded as paid. Rejects a negative or non-numeric amount; a no-op edit returns early instead of writing a ledger entry.
- ✅ **Auditable, without corrupting money reports**: the signed difference is written to the ledger as a new `Purchase` kind — `'adjustment'` — with `paid: 0`. That placement was chosen deliberately after checking every aggregation over `Purchase`: `reportController` (advanced report) and `supplierDashboard`/`supplierProductBreakdown` all filter `kind: 'purchase'`, so an adjustment can't inflate purchase totals or the product breakdown; `balanceService` sums `paid`, which is 0, so Cash/Bank balances are untouched. The supplier's own ledger shows every entry, so the correction is visible where it matters.
- ✅ **UI** (`Suppliers.jsx`): new per-row "Edit due" action (PencilLine icon) opens an `EditDueModal` pre-filled with the current due, showing a live "Due increases/decreases by ৳X" hint, a Reason/Note field, Enter-to-submit, and a confirm dialog. An amber note states plainly that this records no payment and that **Pay due** is the right button when money actually changed hands — the one way an owner could otherwise mislead their own cash reporting. The ledger renders adjustments as an amber "Due correction" badge with a signed ±amount instead of a plain purchase total.
- Verified: arithmetic tested over 5 states (normal part-paid supplier → 0, opening balance on a fresh supplier, raising the due, an **over-paid** supplier whose due virtual was already clamped to 0, and a no-change edit) — the due lands exactly on the target in every case with `totalPaid` untouched, and paying the full due after an adjustment still settles to 0. Server `node --check` + full `app.js` import-chain ✓; client `vite build` ✓. Not exercised against a live database (see Phase 17).
- **Scope note:** the existing Record Purchase and Pay-due flows are completely unchanged, as asked. Customer-side dues already had an equivalent path (Phase 4's Collect Due) and were left alone.

### ✅ Phase 23 — Business-type rename + delete a user from the Admin Panel (2026-07-27)
Two small asks: rename the **"Mobile Shop Management"** business type to **"Technology
Management System"**, and add a way for the superadmin to **delete a user, via a popup**.
- ✅ **Rename**: the only user-visible occurrence was the Business Type dropdown in `AdminPanel.jsx`'s Create-Owner modal; also updated the Bangla translation key in `LanguageContext.jsx` (`'Technology Management System': 'টেকনোলজি ম্যানেজমেন্ট সিস্টেম'` — the key *is* the English string, so it had to move with it, otherwise Bangla mode would show the untranslated text) plus the two code comments that named the type. **The stored value is still `type: 'mobile'`** — only the label changed, so every existing business, all the `type === 'mobile'` module gating, and the seed data keep working untouched. The one remaining mention, in `CHANGES.md`, is a historical change-log line and was deliberately left alone.
- ✅ **Delete** — new `DELETE /api/admin/businesses/:id` (`deleteBusiness`, superadmin-only like the rest of `adminRoutes`). Removes the owner login, every staff login under that shop, the business, and all of its data.
  - The wipe is driven off **mongoose's model registry** — every model whose schema has a `business` path — rather than a hardcoded list, so a model added later is covered automatically instead of silently leaving orphaned rows. Verified against the running app: **28 models are covered** (incl. `User`, `Payment`, `Subscription`, ActivityLog, the CRM models…) and only `Business` is excluded, which is then deleted explicitly. The owner is also removed by `_id` in case an older record predates the `User.business` back-reference.
  - **Guards**: refuses if any user under that business is a `superadmin`, or if the target is the logged-in admin's own business — a platform account can never be deleted through the tenant list.
- ✅ **The popup is deliberately not a one-click confirm**: this is irreversible and takes a customer's entire dataset with it, so the modal names the owner + email, spells out what is destroyed, points at **Deactivate** as the reversible alternative, and only arms the red Delete button once the superadmin **types the business name exactly** (Enter also submits once it matches). The existing `useConfirm` dialog was not enough here — it has no text input, and a single click is too easy to hit on a destructive row action.
- Verified: server `node --check` on all touched files + full `app.js` import-chain ✓; the model-coverage list above was printed from the actual registry ✓; client `vite build` ✓. Not exercised against a live database (see Phase 17) — deliberately so, since the only configured DB is the client's production cluster and this endpoint deletes real tenants.

### ✅ Phase 24 — Products search shows the buy/sell price up front (2026-07-27)
Client: *"product er name diye search dile jeno tar buy sell price ta dekha jay"*.
The Products table **already** had Buy and Sell columns, so the request was ambiguous —
asked the client which of four readings they meant (prominent price panel / inline price
editing / price in the POS search / columns cut off on a phone) rather than guessing and
building something redundant. They picked the **price panel**.
- ✅ `Products.jsx`: when the search box has text and there are matches, a card grid appears **above** the table showing, per product, the **Buy** price, the **Sell** price (large, with the pre-discount price struck through when a discount applies), and the current **Stock** — plus a `name • variant • category • supplier` subtext. Capped at `PRICE_CARDS = 6` matches, with the count and "showing first 6" stated in the header; the full table below is unchanged, so nothing was taken away.
- ✅ Each card is clickable and opens that product's **Edit** modal — the natural next step when the price shown is wrong or missing.
- ✅ Two touches specific to this shop's data: cards where both prices are 0 (the ~552 Smart-Imported products) say **"Price not set yet — click to add it"** instead of a bare ৳0, and cards with both prices set show the **per-unit profit**, which is the number the owner actually wants when quoting at the counter.
- Verified: client `vite build` ✓. Purely additive frontend work — no API, model or table changes.

### ✅ Phase 25 — Multi-Branch Support (2026-07-29)
Client: *"পস ওয়েবসাইটে ব্রাঞ্চ এড করার সিস্টেম রাখো"* (add a branch-adding system). Before
building, asked two scope-defining questions since the answer changes the blast radius of
almost the whole codebase: (1) separate catalog per branch, or one shared catalog with a
per-branch stock count? (2) is money (Cash/Bank/Expense/Fund) tracked per-branch or shared?
Client chose **separate catalog per branch** (each branch's products/stock are their own
documents — lower risk, matches how `business` already works on every model) and **per-branch
money with an "all branches" combined view for the owner**. Went through `/plan` first given
the size — two Explore agents mapped the auth/tenant-scoping chokepoint and the Product/
PhoneUnit/Sale stock-movement path before any code was written.

- ✅ **New `Branch` model** (`server/src/models/Branch.js`): `{business, name, address, phone,
  isMainBranch, isActive}`. No hard delete in this phase (matches Phase 23's business-delete
  caution) — only deactivate, and the main branch can't be deactivated (must set another
  branch as main first).
- ✅ **`branch` field added to 11 models** — `Product, PhoneUnit, Sale, Purchase, Expense,
  Fund, Transfer, Installment, ServiceJob, Return, DuePayment` (all required, indexed).
  `ImportExportLog` gets an optional `branch` (traceability only). `User` gets an optional
  `assignedBranch` (locks a staff login to one branch, server-enforced). **Deliberately NOT
  branch-scoped** (shared across all of a business's branches): `Customer`, `Supplier`,
  `Employee`, CRM/Marketing models, `ActivityLog`, `Notification`, `Payment`/`Subscription`.
  `Supplier.totalPurchase/totalPaid` stay a combined business-wide running total (the supplier
  relationship is one external entity even if two branches both buy from them) — but each
  individual `Purchase` transaction still carries `branch`, so per-branch cash-out is still
  correctly tracked by the balance engine.
- ✅ **`server/src/middleware/tenant.js`** gained `resolveBranch` (resolves `req.branchId`:
  a branch-locked staff's `assignedBranch` always wins over the client-sent header — prevents
  spoofing; otherwise the `X-Branch-Id` header is validated against the business, falling back
  to the main branch) and `branchFilter(req, extra)` (= `tenantFilter` + `branch: req.branchId`),
  used everywhere the 11 models above are queried/created. `requireBusiness` is chained
  per-route-file (not centralized), so `resolveBranch` was added to that same chain in every
  route file for a branch-scoped resource: `product/sale/unit/supplier/expense/fund/transfer/
  installment/service/return/import/dashboard/report/export Routes.js`.
- ✅ **New `branchController.js` + `branchRoutes.js`** (`/api/branches`, owner/superadmin
  only) — list/create/update/set-main/toggle-active. Creating a branch here is the literal
  feature requested.
- ✅ **Uniqueness nuance**: `Product.barcode` clashes are now checked per-branch (separate
  catalogs). **`PhoneUnit` IMEI/serial clashes stay business-wide** everywhere (creation-time
  dedupe in `phoneUnitController`, Smart Import, POS) — a real physical device can't be in two
  branches at once, so uniqueness holds across the whole shop even though the unit *documents*
  are branch-tagged. Runtime *availability* lookups (POS scan-to-cart, `/units/lookup`,
  in-stock search) **are** branch-scoped — a scan at Branch A must never resolve a unit
  physically sitting in Branch B's stock room.
- ✅ **Because catalogs are separate per branch, return/exchange/EMI stock reversal needed no
  new logic** — a Sale's line items already reference that exact branch's Product/PhoneUnit
  documents, so reversing stock on them is correct by construction. This was the main risk the
  research flagged for the "shared catalog" option and is exactly why "separate catalog" was
  the lower-risk pick for a live production app with no local DB to test writes against.
- ✅ **Migration**: idempotent `ensureMainBranches()` (`server/src/scripts/ensureMainBranches.js`)
  creates a Main Branch for any business that doesn't have one yet and backfills the 11
  branch-scoped collections onto it — called automatically once at server boot
  (`server.js`, after `connectDB()`) since this project can't SSH into the client's VPS to run
  a one-off migration script by hand; also exposed as `npm run migrate:branches` for manual/CLI
  use, matching the existing `migrate:images` convention. `createOwnerWithBusiness`
  (admin-panel "Create Owner") now creates a business's Main Branch at signup time too, so new
  shops never depend on the startup migration.
- ✅ **Balances get an "all branches" toggle**: `balanceService.computeBalances(businessId,
  branchId)` — `branchId=null` aggregates across every branch. `dashboardController`,
  `reportController` (Advanced Report), and `exportController`'s per-entity exports all accept
  `?allBranches=true` (owner/superadmin only) to combine instead of showing just the active
  branch; `Customer`-based figures (totalDue) and Supplier due stay business-wide regardless,
  since those entities are shared. `exportController.fullBackup` stays fully business-wide on
  purpose (a backup is the whole account, not one branch) and now also includes `Branch.find`.
- ✅ **Frontend — header-based, not a per-page filter**: `client/src/api/axios.js` attaches
  `X-Branch-Id` from `localStorage.activeBranchId` on every request (a per-call header, e.g.
  Smart Import's branch picker, can override it — the interceptor only fills the header in if
  the caller hasn't already set one). `AuthContext.jsx`'s `/auth/me` call now also returns
  `branches` + the resolved `activeBranchId`; `switchBranch(id)` writes to localStorage and
  does a full page reload (simplest way to guarantee every page's already-fetched data reflects
  the new branch, without touching each page's individual fetch logic — the actual payoff of
  the header-based design: POS/Products/Finance/Suppliers/Installments/Services/Returns needed
  **zero code changes**, they transparently see the active branch's data once the header is
  set). New branch `<select>` in `Topbar.jsx` (hidden for a branch-locked staff login, and
  whenever a business only has one branch), active branch name shown under the business name
  in `Sidebar.jsx`. New **`Branches.jsx`** page (owner/superadmin, `Suppliers.jsx`-style
  list+modal CRUD) + Sidebar entry. `Employees.jsx`'s "Login Access" section gained an optional
  "Restrict to branch" select (only shown when the business has >1 branch) mapping to
  `User.assignedBranch`. `ImportExport.jsx`'s Smart Import gained a branch picker so an owner
  can import into a specific branch without switching their whole active session.
- **Explicitly out of scope, flagged for later if asked**: hard-delete of a branch (only
  deactivate, same reasoning as Phase 23), moving stock *between* branches (`Transfer.js`
  today is only an internal cash-drawer move between payment methods, not a goods-transfer
  concept — a real feature if the client wants it), CRM/Marketing branch-scoping (leads/
  campaigns aren't tied to a shelf, stay business-wide).
- Verified: `node --check` across the **entire** server source tree (not just touched files) +
  full `app.js` import-chain ✓; a standalone logic-fixture test of `resolveBranch`'s precedence
  rules (7/7 cases: header honored, invalid/foreign/inactive header falls back to main,
  assigned-branch lock overrides any header) ✓; a standalone idempotency simulation of
  `ensureMainBranches()` (first run only touches businesses lacking a branch, second run is a
  true no-op) ✓; client `vite build` ✓. Not exercised against a live database — same standing
  limitation as every prior phase (only the client's production Atlas is configured, no local
  MongoDB) — but this is by a wide margin the largest single change to this codebase, so it's
  worth being explicit: the write paths (branch creation, the migration backfill, every
  `branchFilter`-scoped query) are verified by construction and logic review, not by an actual
  insert/query against real data. **Recommend the client do a careful first pass in the live
  app** — add a second branch, confirm Products/POS/Finance genuinely separate from the
  original Main Branch — before relying on this for real multi-location operation.

### ✅ Phase 26 — Customer due-date reminders + a real notification system (2026-08-03)
Client sent an annotated screenshot of the Customers page: wants (1) a settable/editable
**due date** per customer that raises a notification when it arrives, and (2) flagged that the
notification bell has never done anything — asked for low/out-of-stock alerts there too.
Investigation confirmed the bell was fully inert: `Notification` model + `GET/PATCH
/api/notifications` already existed from an earlier phase, but **nothing anywhere in the
codebase ever created a Notification document** — a dead read-only API behind a decorative
icon with no `onClick`, no badge, no dropdown. Customers also had no edit capability at all
(only Add) despite the server's `updateCustomer` already existing.
- ✅ **`Customer.dueDate`** (optional Date) — a reminder date, independent of any specific
  invoice's due date. Cleared automatically back to `null` once `totalDue` reaches 0 via either
  due-collection path (`customerController.collectDue` and `saleController.collectSaleDue`) —
  a paid-off customer stops nagging.
- ✅ **No cron/scheduler exists anywhere in this project**, and adding one (e.g. `node-cron`)
  would be the first background process this app has ever needed — for a small shop's check-in
  pattern, a **lazily-computed, idempotent generator** is simpler and just as timely: new
  `server/src/services/notificationService.js`'s `ensureNotifications(req)` runs every time
  `GET /notifications` is called (i.e. whenever the bell is opened, plus a 3-minute client poll
  for the badge), not on a timer.
- ✅ **Idempotent via a `dedupeKey`** field added to `Notification` (`stock-<productId>` /
  `due-<customerId>-<dueDateISODate>`) — re-checking the same still-true condition never creates
  a duplicate. Low-stock notices for a product that gets restocked are actively **pruned** (only
  while still unread — read ones stay as history, same treatment as every other log in this app)
  so the unread badge never lies. A due-date reminder is keyed to the date *value*, not "today" —
  editing the reminder to a new date can raise a fresh notice, but reopening the bell on the same
  overdue date never spams a second one.
- ✅ **Branch-aware, matching Phase 25's model**: `Notification` gained an optional `branch`
  field. Low-stock checks only scan the *active* branch's products (Product is branch-scoped
  since Phase 25) and stamp `branch` on the notice; due-date reminders have `branch: null`
  (Customer is shared business-wide) and always show regardless of active branch.
  `notificationRoutes.js` gained `resolveBranch` in its chain; both `getNotifications` and
  `markRead` filter/act on `{branch: null} OR {branch: activeBranchId}` — switching branches
  never reveals or silently clears another branch's stock alerts.
- ✅ **New `client/src/components/layout/NotificationBell.jsx`** replaces the dead `<Bell>`
  button in `Topbar.jsx`: unread-count badge, a dropdown list (type-colored icon, title,
  message, timestamp), "Mark all as read", fetches on mount + a 3-minute refresh + every time
  it's opened. No new UI library — a plain fixed-backdrop dropdown, same click-outside idiom
  `Modal.jsx` already uses.
- ✅ **`Customers.jsx`**: the Add-only modal became Add/Edit (new Pencil action per row, mirrors
  every other list page in this app) with a new **Due Date** field; the Due column shows the
  reminder date under the amount, in red once it's reached.
- Verified: `node --check` across the entire server tree + full `app.js` import-chain ✓; a
  5-case logic-fixture test of the dedupe/prune rules (no duplicate on repeat check, restock
  prunes the unread notice, dropping low again raises a fresh one, same due-date never
  duplicates, an edited due-date does) ✓; client `vite build` ✓. Not exercised against a live
  database — same standing limitation as every prior phase.
- **Scope note:** only low/out-of-stock and customer due-date generate notifications in this
  pass — the client didn't ask for more, and the `ensureNotifications` pattern makes adding
  another kind (e.g. EMI instalment due, subscription expiry) a small addition later, not a
  redesign.

### ✅ Phase 27 — Sidebar app-version indicator + "Relaunch to update" (2026-08-08)
Prompted by the Phase 26 hotfix experience: client asked whether their marketing SMS
could route through a personal-SIM operator package (answered honestly: no public API for
that, the app's existing generic SMS-gateway settings in Marketing → Integrations & Keys
already covers real bulk-SMS providers like BulkSMSBD/Alpha SMS/MimSMS with zero code
needed), then asked for a bottom-left Sidebar element showing the app version, which should
turn into a "relaunch to update" prompt for any client whose browser tab is running stale
code after a deploy.
- ✅ **`server/src/utils/appVersion.js`** — `getAppVersion()` returns `{version, deployedAt}`
  computed via `git rev-parse --short HEAD` / `git log -1 --format=%cI`, run with `cwd` inside
  the server folder (git auto-discovers the repo root by walking up, so this works regardless
  of how deep the checkout is nested — no hardcoded path assumptions). Cached once per process,
  so it costs one subprocess call per deploy, not per request; a fresh value appears
  automatically after every `pm2 restart` that follows a `git pull`, with zero manual version
  bumping required anywhere. Falls back to `{version:'dev', deployedAt:null}` if `git` isn't
  available (e.g. a non-git local copy) instead of failing the route.
- ✅ **New public `GET /api/version`** (no auth — mounted next to the existing `/health` in
  `routes/index.js`) so the check works independent of session/token state.
- ✅ **`Sidebar.jsx`** gained a `useAppVersion()` hook: fetches once on mount (anchoring
  "the version this tab loaded with"), polls every 3 minutes (same cadence as
  `NotificationBell`), and flags `updateAvailable` the moment the polled version differs from
  the anchored one. The `<aside>` became a flex column (nav `flex-1 overflow-y-auto`) with a
  new footer pinned to the bottom: normally a small `v<hash>` (hover shows the deploy
  timestamp), swapping to an amber, clickable **"Relaunch to update"** the instant a newer
  commit is detected running server-side — click reloads the page.
- Verified: server `node --check` + full `app.js` import-chain ✓ (`getAppVersion()` also
  smoke-tested directly against this repo's own git history, returned the real current commit
  correctly); client `vite build` ✓; **this time, every identifier in the touched file was
  manually traced against its import/declaration line-by-line before considering it done** —
  directly because the Phase 26 hotfix (a stray `useRef` reference with no import, invisible to
  `vite build` since this project has no ESLint) crashed every logged-in page in production and
  was only caught from the client's own browser console.
- **Scope note:** the version shown is the git short-hash, not a semantic version number — this
  project has no version-bump discipline or CI, and a hash is unambiguous (it changes exactly
  when the deployed code changes) without adding either. If the client later wants a
  human-friendly label instead (e.g. "Phase 27"), that's a one-line swap in `getAppVersion()`,
  not a redesign.

### ✅ Phase 28 — Session-3 fixes: modal safety, stock button, extra money bag, invoice search, supplier returns, EMI as a real sale (2026-08-11)
Six freeform client issues (Bangla, no `next promt.txt` this round).
1. **Pop-ups closed on a stray outside click** (Admin Panel → Create Owner, Add Product, everywhere): the shared `Modal.jsx` had `onClick={onClose}` on its backdrop, so one mis-click wiped a half-filled form. Removed — every dialog now closes only via the header ✕ or its own Cancel button. Same change applied to `ConfirmContext.jsx` for consistency. One fix covers every modal in the app (Admin Panel and Products both use the shared component). Esc-to-close was deliberately **not** added — it would reintroduce the same accidental-loss problem.
2. **Manual stock quantity button** — new `PATCH /api/products/:id/stock` (`adjustProductStock`) with `mode: add | remove | set`; a per-row button on Products opens a small dialog showing current stock, +1/+5/+10/+20/+50 shortcuts, an optional note and a live "New stock: N" preview, so restocking never means retyping the stock figure. Logged to ActivityLog with before/after. **Refuses serial-tracked products** (their stock is derived from in-stock `PhoneUnit` rows, so a manual bump would be silently overwritten) and points at the existing Manage-IMEIs flow instead; the button is only shown for non-serial products.
3. **Money Back** — a ৳500 bill paid with ৳550 records `paid: 550`, so ৳50 belongs to the customer. New `Sale.moneyBacks[]` + `moneyBackReturned`, with the outstanding amount always **derived** (`paid − total − moneyBackReturned`, floored at 0) so editing the invoice can't leave it stale. New `POST /api/sales/:id/money-back`; `balanceService` subtracts the hand-backs by method (money really does leave the till). `OrderDetailsModal` shows an amber "Money Back" panel (with the history of what's already been given back) and a **Money Back** action. Deliberately **not** a Return/Exchange: no goods move, so stock, profit and the invoice total are untouched. *(First built as "Extra Money Bag" — the client corrected the name to **Money Back** before anything shipped, so the field/route/label naming was renamed throughout rather than left inconsistent.)*
4. **Invoice Search** — new sidebar page + `GET /api/sales/search?q=` matching invoice number, customer name or phone. Lookup is **business-wide** (a customer can walk into any branch with a receipt printed at another) while a branch-locked staff login stays inside its own branch; `getSale` was widened the same way. Since acting on an invoice moves money through a specific branch's till, `OrderDetailsModal` hides Edit / Collect Due / Return when the invoice belongs to another branch and says which branch it is. Results show items, IMEI, total, paid + method, due; clicking one opens the existing full invoice modal (reprint / edit / collect due / return all reused).
5. **Supplier "sold" ignored returns** — `supplierProductBreakdown` summed `items.qty`, but a return never reduces `qty` (it increments `items.returnedQty` and restocks the product). So "bought 5, sold 3, 1 returned" kept reading 3 sold while the shelf said 3 in stock. Sold is now **net of returns** (`qty − returnedQty`), with a new Returned column beside it.
6. **EMI is now a real sale, with profit** — two distinct problems:
   - *Why stock wasn't going out*: the EMI form's only way to attach a product was **scanning a barcode**. This shop's ~552 Smart-Imported products have no barcode at all, so in practice the item stayed free text, no product was linked, and nothing stocked out. Added **product search by name** (debounced, in-stock only), an **in-stock device picker** for serial-tracked items, and made the scan box universal (IMEI/serial → picks product *and* that exact device; product barcode → picks the product), matching POS. Also added **inline customer creation** (name + phone) so an EMI sale isn't blocked on visiting the Customers page first. The stock-out/IMEI-marking logic itself already existed since Phase 6 and is unchanged.
   - *EMI markup (client follow-up)*: scanning the product now brings up its own price in a **Product Price** box, and the shopkeeper adds whatever extra they charge for selling on credit in either an **Extra Profit (৳)** or an **Extra Profit (%)** box — % is calculated on the product price. The three boxes stay in step (fill any one, the others follow) and the EMI Price can still be overtyped directly, which back-fills the extra. New `Installment.basePrice` stores the normal price so the markup (`totalAmount − basePrice`, exposed as an `emiMarkup` virtual) stays visible on the plan afterwards. That markup is *not* a separate profit stream — it lands in `totalAmount`, so it flows into the plan's profit automatically.
   - *Why no profit appeared*: `Installment` had no cost basis at all, and the dashboard's profit came only from `Sale.profit`. Added `Installment.purchasePrice` (snapshotted from the product, editable) and new `services/emiService.js`, which recognises profit **as the money arrives**, exactly as the client asked: each payment (down payment included) books its share, `payment ÷ EMI price × plan profit`. Wired into the Dashboard (`periodEmiProfit`, folded into Total Profit with an "incl. ৳X from EMI" sub-line, plus a new EMI row showing collected / profit earned / receivable) and the Advanced Report. A plan with **no cost recorded recognises nothing** rather than treating the whole sale price as profit — those plans are counted and surfaced as an amber warning instead. New `PATCH /api/installments/:id/cost` + an inline "Set item cost" editor so plans created before this change can start showing profit.
- **Deliberately not done:** an EMI plan still does **not** create a `Sale` document. Its money already flows through the balance engine (down payment + instalments, since Phase 6) and its outstanding balance is EMI Receivable; minting a Sale too would double-count revenue and the receivable. EMI collections also stay out of "Total Income" (still sales-only) and are shown in their own row — only *profit* was folded in, which is what was asked.
- Verified: `node --check` across the whole server tree + full `app.js` import-chain ✓; a 13-case logic-fixture test of the EMI price/markup boxes (flat extra, percentage extra, typing the EMI price directly, no markup, an EMI price *below* the product price, and a hand-typed item with no product) — 13/13 ✓; a 24-case logic-fixture test of the EMI recognition rules (the client's own 28k/35k example, down-payment share, per-instalment share, whole-lifecycle summing to exactly the plan profit, out-of-window exclusion, missing-cost handling) and the extra-money arithmetic (overpay, partial return, full return, underpaid, invoice discounted after the fact) — 24/24 ✓; client `vite build` ✓; every identifier in each touched component traced against its import/declaration (the Phase-26 lesson). Not exercised against a live database — same standing limitation as every prior phase.

### ✅ Phase 29 — Admin Panel: per-shop branch/data visibility + a data browser (2026-08-15)
Superadmin-side asks, freeform: (1) see from the Admin Panel which shops have added
branches beyond the default one; (2) a way to see how much MongoDB storage each shop is
using, for usage-based billing; (3) a way to browse a shop's own data (products/sales/
customers/etc.) without opening MongoDB directly.
- ✅ `adminController.listBusinesses` now attaches each business's branch list + a
  `hasExtraBranches` flag (more than the one auto-created Main Branch); `adminOverview`
  gained a `shopsWithBranches` count. AdminPanel's Businesses table got a **Branches** column.
- ✅ **Per-shop data browser**: `GET /api/admin/businesses/:id/summary` (per-collection record
  counts) + `GET /api/admin/businesses/:id/records?model=X&page=` (paginated raw listing),
  both driven off the same "any model with a `business` path" registry scan `deleteBusiness`
  (Phase 23) already uses — a model added later is automatically browsable, no extra wiring.
  New `client/src/pages/admin/BusinessData.jsx` (`/admin/businesses/:id`) — collection chips
  with counts, curated columns for the common collections, a generic fallback for the rest.
- ✅ **Exact per-shop storage usage** (`GET /api/admin/storage`) — MongoDB doesn't track this
  per-tenant natively, so it's computed via a `$bsonSize` aggregation per collection, grouped by
  business in one pass (cost scales with collection count, not businesses × collections).
  Deliberately a manual "Calculate Storage Usage" button (it walks every document in the
  database), not loaded on every page view.
- Verified: server `node --check` + full import-chain ✓; client `vite build` ✓. Not exercised
  against a live database (standing limitation).

### ✅ Phase 30 — "Scan with Phone": remote camera barcode scanning, no app install (2026-08-15/16)
Client wanted their POS to stop depending on the third-party `barcodetopc.com` bridge (which
requires installing someone else's app/site to turn a phone into a scanner) and asked for an
equivalent built into this app itself. Rather than replicate a LAN-local WebSocket-bridge
architecture (which assumes a desktop app, not this app's actual shape — a hosted cloud SaaS
already reachable over the internet), built a simpler design that reuses the existing backend:
- ✅ New `ScanSession` model + `scanSessionController`/`scanSessionRoutes` (`/api/scan-sessions`).
  POS/Products create a session (authenticated) and get back a URL turned into a QR code; a
  phone scans that QR with its own camera app (no install) and lands on a public
  `client/src/pages/ScanRemote.jsx` page (no login — gated entirely by a random token in the
  URL) that reads barcodes/QR/IMEI **in-browser** via `@zxing/browser` and posts each one back.
  The connected app tab polls for new scans and runs each one through the exact same lookup
  logic a typed/hardware-scanner code already used.
- ✅ **Made persistent and app-wide** after client feedback ("connect once, no timeout, works
  for product entry too, not just POS"): connection moved into a `ScannerContext`/`ScannerProvider`
  mounted once in `Layout.jsx` (survives page navigation) with a Topbar icon/widget replacing the
  POS-only button; the server renews the session on every poll (`IDLE_TIMEOUT_MINUTES`, sliding
  window) instead of a fixed short lifetime. Both POS and Products subscribe to the shared
  connection (Products pauses its own subscription while Manage-IMEIs or Add/Edit-Product is
  open, handing the connection to whichever of those needs it, so a scanned code never gets
  misread as a plain barcode lookup mid-form).
- ✅ **Scanning-quality fixes** from live client testing: a center guide-line (only a barcode
  crossing it counts — lets the shopkeeper pick which of several close-together codes on one
  label gets read), a real "still-in-view" dedupe (was resubmitting the same code every ~1.5s
  while held in frame), faster zxing decode timing (500ms→100ms), and an automatic one-time
  retry when the very first camera start renders a black frame (a known Android WebView quirk).
- Verified: server import-chain + client build after every round; a live phone was used for
  testing this feature (client-reported issues were real and iterated on) — the only phase with
  actual device-level verification rather than just logic fixtures.

### ✅ Phase 31 — Thermal receipt right-edge clipping (2026-08-25, 3 rounds)
Client sent a photo of a printed thermal receipt with every line cut off on the right. Took
three iterations to find the real cause, each one narrowing in after live testing disproved
the previous fix:
1. **First pass**: `.print-thermal` was hardcoded `width: 80mm` — added `Business.settings.
   printWidthMm` (58/80, Settings → Receipt Paper Width) and two CSS width classes. Client
   tried both settings — still clipped either way, proving the setting itself wasn't the gap.
2. **Second pass**: found two compounding bugs neither of which the width *setting* could
   fix — (a) the browser was never told the actual print **page size** (`@page size`), only the
   printer driver's own default was used regardless of any CSS width, via a new
   `useThermalPageSize` hook that injects a live `<style>@page{size}</style>` tag while a
   thermal component is mounted; (b) a thermal printhead never reaches the paper edge (~48mm
   printable on a 58mm roll, ~72mm on 80mm — the standard ESC/POS 8-dots/mm convention), so
   content was still sized to the full nominal roll width. Still clipped after deploying.
3. **Third pass — the actual fix**: the print-preview modal is `position:fixed`, and left alone
   in `@media print` it stays the containing block for `.print-area`, so "100% width" was
   resolving against the **browser viewport**, not the printed page. Also, printing to any
   fixed mm width is inherently fragile — whether the browser's `@page size` or the printer
   driver's own paper wins varies by driver. Final fix drops fixed-mm printing entirely:
   `@media print` neutralises the fixed modal (`position:static`) so `.print-area` measures
   against the real page, and thermal content renders at `width:100%` of whatever page that
   turns out to be (cannot overflow a page it's measured against) with 8% side padding for the
   printhead's unprintable margin. The mm-width classes/setting stay for the on-screen preview
   only, so the shop still gets a rough idea of the roll size.
- Verified each round with a live-site check (confirmed the deploy was actually live before
  concluding a fix hadn't worked, measured `.print-thermal-80`'s actual computed width via
  injected JS against the live site, read the compiled CSS out of `dist/` to confirm the
  `@media print` overrides survived minification) rather than reasoning from source alone —
  worth remembering for any future print-layout bug, since two of the three rounds looked
  correct in isolation and only failed in the real print pipeline.

### ✅ Phase 32 — Stock Transfer between branches (2026-08-25)
Explicitly deferred at the end of Phase 25 ("moving stock between branches ... a real feature
if the client wants it"). Sidebar's Branches entry now expands into **All Branches** (existing
page) and **Stock Transfer** (new).
- ✅ New `StockTransfer` model — deliberately has `fromBranch`/`toBranch` instead of the usual
  single `branch` field (a transfer belongs to two branches at once). New
  `stockTransferController`: since every branch keeps its own catalog (Phase 25), the same
  physical model is two different `Product` documents, so a transfer resolves/creates the
  destination branch's own product (barcode match first, then name+category case-insensitively
  — same natural-identity keys Smart Import uses) rather than just editing a stock number.
  Serial-tracked items move device-by-device — the chosen `PhoneUnit`s are re-homed
  (branch + product both repointed) and stock is **re-derived** from in-stock unit counts on
  both sides afterward, same rule `productController`/`phoneUnitController` already follow.
  Quantity items decrement/increment directly. Whole thing runs in one transaction. Owner-only
  routes, taking both branches explicitly (not via `resolveBranch`/`X-Branch-Id`) since this
  screen deliberately reads a branch other than the one you're working in.
- ✅ New `client/src/pages/StockTransfer.jsx` — from/to branch pickers (defaults to moving out
  of the branch you're in), live search of the source branch's shelf, per-device IMEI
  selection, quantity capped at what's actually there, transfer history + detail view. Scan
  box + the Phase-30 phone scanner both tick the exact scanned device onto the transfer.
- Verified: server import-chain + client build ✓; an 18-case logic fixture over the transfer
  algorithm (destination matching precedence, quantity math, serial re-homing with stock
  re-derived on both sides, a sold unit refused, over-transfer refused leaving stock untouched,
  an A→B→A round trip restoring both branches with no duplicate products) — 18/18. Not
  exercised against a live database — recommended the client do one small real transfer first
  and confirm both branches' Products pages before moving anything valuable.

---

## 4. Cross-cutting decisions & conventions
- **Payment methods (canonical order):** `cash, bank, bkash, nagad, rocket, card, due` (POS). `emi` stays in Sale enum for back-compat/EMI-created sales but is not user-selectable in POS.
- **Currency:** BDT (৳). Numbers formatted with existing helpers.
- **Multi-tenant:** every new model/query MUST be scoped by `req.businessId`. Use existing tenant middleware pattern.
- **UI:** reuse existing `card`, `btn-*`, `input`, `Modal`, `DataTable`, `StatCard`, `useConfirm()`. Do NOT redesign existing layouts (per prior CHANGES.md policy).
- **i18n:** app supports English/Bangla global DOM translation — add new strings in a way consistent with existing pages.
- **Print:** reuse `PrintWrapper` (business header/logo/footer). Customer-facing prints never show developer branding or internal cost/profit.
- **Activity log:** log create/update/delete/status via existing `activityLogger` middleware / `ActivityLog`.

## 5. Change log (what Claude has actually done)
- **2026-07-13** — Read requirements + all 14 reference images; mapped full codebase; created this `CLAUDE.md` with phase roadmap.
- **2026-07-13** — **Phase 1 done.** Added `bank`+`rocket` payment methods (Sale enum, POS dropdown, PaymentPie). New Fund module (model/controller/routes `/api/funds`) + Add Fund UI & Fund History on Finance page. Expense gained `source`. Server syntax-checked; client build passes.
- **2026-07-13** — **Phase 2 done.** Balance engine (`balanceService.computeBalances`), `Sale.paidVia`, salary-booked-as-expense, dashboard `period`/`from`/`to` filter + per-method balances. Dashboard rebuilt with Financial Summary + Balances rows. Server import-chain + client build pass.
- **2026-07-13** — **Phase 3 done.** Removed product image upload; added `Product.barcode` (+auto-gen, `/products/barcode/:code` lookup, search); scan-to-add-IMEI on Products page; dependency-free Code128 barcode SVG + A4 label print modal (qty/size/preview). Server + client verified.
- **2026-07-13** — **Phase 4 done.** DuePayment ledger (closes Phase-2 balance gap); `PATCH /sales/:id` (edit invoice) + `POST /sales/:id/collect-due`; customer collect-due now method-aware + allocates across invoices (real-time due, badge clears). OrderDetailsModal (clickable Recent Orders → view/edit/reprint/collect) + DuePaymentInvoice (req 11). Server + client verified.
- **2026-07-13** — **Phase 5 done.** Fixed customer invoice leaking parts cost (now shows only "Service Charge"); added `technicianCost` + `paymentMethod` + stored `profit` to ServiceJob; balance engine now includes service payments; Dashboard gained a period-scoped Service & Repair stat row (revenue/parts/tech/net profit); Services.jsx form redesigned (customer bill vs internal costs, clearly labeled) + Due column. Server + client verified.
- **2026-07-13** — **Phase 6 done.** Installment gained full KYC (customer/parents/guarantor), product+IMEI linkage with real stock deduction on plan creation, barcode+IMEI scan autofill, per-plan/per-instalment payment methods feeding the balance engine, dashboard EMI Receivable (separate from regular Total Due), and a per-instalment printable payment receipt. Server + client verified.
- **2026-07-13** — **Phase 7 done.** Closed the last balance-engine gap: `Purchase.source` + supplier purchases/payments now count as outflow. New `/suppliers/dashboard/summary` (aggregate totals, top-due suppliers, recent purchases) wired into Suppliers.jsx with real-time refresh + "Paid From" selects. Server + client verified.
- **2026-07-13** — **Phase 8 done.** New `/api/reports/advanced` aggregates sales/purchase/profit/expense/balances/customer-due/supplier-due/product-wise sales+profit/stock summary for a date range. `AdvancedReport.jsx` (A4 print, reuses existing print-to-PDF pattern, no new deps) + Finance.jsx date-range picker & "Advanced Report" button. Server + client verified.
- **2026-07-13** — **Phase 9 done.** New `Return` model + `POST /api/returns` (full/partial return) + `POST /api/returns/exchange` (return-out + linked new sale, auto price-diff, pay-more/refund/store-credit) — both transactional, stock-reversing (resellable vs damaged), window-gated (owner override past 3/7/30 days), and feeding the balance engine (refund = outflow). New `ReturnExchangeModal` (from OrderDetailsModal) + `Returns.jsx` history page + Sidebar entry; `Product.returnable`, `Business.settings.returnWindowDays`, `Customer.storeCredit` surfaced in Products/Settings/Customers. Server + client verified.
- **2026-07-13** — **Phase 10 done — all 10 phases now complete.** Dependency-free CSV utility (round-trip tested); full export coverage (Customers/Suppliers/Products/Units/Sales/Purchases/Expenses/Installments/Dues, date-ranged where relevant) + full JSON database backup; CSV import with pre-write validation + per-row error report for Customers/Suppliers/Products/Expenses/IMEI-Serial (upsert-by-natural-key); additive backup restore for the 4 non-relational entities; new `ImportExportLog` audit trail; Express JSON body limit raised 2mb→10mb for bulk safety. New `ImportExport.jsx` page + Sidebar entry. Server + client verified.

- **2026-07-14** — **Barcode fix (post-deploy feedback).** Client reported: printed labels all showed the same number, and IMEI bulk-add rejected input as duplicate. Fixes: (1) `BarcodeLabelSheet` now accepts a `codes[]` array; `LabelPrintModal` for **serial-tracked products prints one UNIQUE label per in-stock device** (barcode = that unit's IMEI/serial) with a mode toggle ("Per device — unique IMEI/Serial" vs "Product barcode (same on all)") — non-tracked products keep product-barcode×qty. (2) `UnitsModal` bulk-add now **auto-dedupes repeated lines** (toast instead of hard error) and gained a **"Generate unique serials"** helper that auto-creates N unique serial-numbered units for items without a real IMEI (e.g. accessories) so each gets its own scannable label. Client build ✓. Committed + pushed to `origin/main`.

**All 15 client requirements from `next promt.txt` are now implemented across Phases 1–10.** See each phase's "Scope decisions/notes" above for the handful of deliberate boundaries (e.g. EMI = 1 item/plan, exchange = 1 replacement item, Sales/Purchase/EMI history export-only not import, store credit not yet spendable at POS) — none are silent gaps, all were called out at the time.

- **2026-07-14** — **Barcode not scanning (post-deploy feedback).** Client reported the new unique-serial labels displayed fine but wouldn't scan at the register. Root cause: generated serials were 16 numeric digits; Code128-B (one symbol per character) squeezed that many symbols into a small label, shrinking the bar width below what a scanner could resolve. Fix: `Barcode.jsx` now encodes purely-numeric values as **Code128-C** (2 digits per symbol — verified ~40% narrower for the same value: a 15-digit ID went from 200 to 123 modules) and falls back to Code128-B for non-numeric text; old printed labels are unaffected (decoders auto-detect the subset). Also shortened generated serials from 16→12 digits to match the product-barcode convention. Separately, POS's scan box only did a unit (IMEI) lookup — it now tries unit-lookup first, then falls back to a product-barcode lookup, so both product barcodes and unique unit codes scan straight into the cart (`addByImei` in `POS.jsx`, now effectively a universal scan-to-cart handler). Client build ✓, committed + pushed.
- **2026-07-15** — **Phase 11 done — 2nd round of client requests.** Split/multi-tender POS payment (`Sale.payments[]`, split-aware balance engine, repeatable payment rows in `POS.jsx`); Add Product gained a Supplier/Dealer field + repeatable multi-item + inline IMEI entry with a new `/products/batch-with-supplier` endpoint that auto-creates the Purchase + Supplier link (zero regression for the plain single-item/no-supplier case); new `/suppliers/:id/products` per-product bought/sold/stock breakdown; partial Fund withdrawal (`Fund.type` add/withdraw); new Balance Transfer feature (`Transfer` model/controller/routes) for moving money between the shop's own payment methods. Server import-chain + client build verified. See the new Phase 11 section above (§3) for full detail and scope notes.
- **2026-07-15** — **Phase 12 done — 3rd round of client requests.** Category filter dropdown on Products (reuses existing `?category=` param) + category field turned into a combobox (datalist of previously-used categories) to stop free-text fragmentation; new `Product.supplier` ref (populated on list/update, auto-set by the Phase 11 batch-with-supplier flow) shown as a subtext under each product's name, with an editable Supplier select on the Edit form. Server import-chain + client build verified.
- **2026-07-16** — **Phase 13 done.** Staff dashboard logins with per-module granular permissions (checkbox grid, editable anytime; owner/superadmin unaffected); one-time password generation/reset for employee logins; deactivating/deleting an employee also deactivates their login. Salary payments now support partial/due tracking (`paidAmount` + `payments[]` ledger) instead of a single paid/due flag, each payment booking its own Expense automatically. Server import-chain + client build verified.
- **2026-07-18** — **Phase 14 done.** Stock Print report (Products page, grouped by supplier, respects the category filter, printable A4). Smart Stock Import: new file-shape sniffer handles this shop's old-software HTML-as-.xls "Company Name" export, real .xlsx/.xls (new `xlsx`+`cheerio` deps), and CSV/TXT — all with fuzzy header aliasing instead of a fixed template. New `/import/smart/preview` + `/import/smart/commit` endpoints find-or-create suppliers and upsert products by name+category. Verified directly against the client's 2 real reference files (552+460 items, 25+17 suppliers extracted correctly) plus a synthetic non-standard CSV. Server import-chain + client build verified.
- **2026-07-18** — **Phase 15 built, then fully removed at client request.** Built "Scan IMEI with AI" (vision-AI photo read + fuzzy product match) then a hardware-scanner variant (IMEI TAC-prefix match against the shop's own units) after the client clarified their actual device — see §3 Phase 15 for the full history. Client then asked to drop the whole feature; reverted cleanly (both endpoints, both controller functions, the vision-AI additions in `aiService.js`, the `DataTable.rowClassName` prop, all related `Products.jsx` state/UI — nothing left behind). Along the way, found and fixed a real bug: Products search never matched IMEI/serial (only name/sku/barcode), so a known in-stock IMEI returned "No data found" — `getProducts` now also looks up matching `PhoneUnit`s. Server import-chain + client build verified after both the removal and the fix.
- **2026-07-14** — **Barcode system scoped per business type (client instruction).** Client asked: General shops should get the *same* unique-per-unit barcode system as Mobile shops (previously general-store products always printed one shared barcode × quantity, since only `business.type==='mobile'` unlocked `trackSerial`/unit-tracking in the UI); Pharmacy should have **no barcode system at all**. Changes (frontend-only, `Product.trackSerial` was already generic in the schema): `Products.jsx` — new `serialEnabled = business.type !== 'pharmacy'` gate controls the barcode field, scan-to-add box, "Print Label" action/button, and the "track by unique code" checkbox (previously `isMobile`-only); `isMobile` is now only used for the phone-specific fields (brand/storage/color/warranty) and wording ("IMEI" vs generic "unique code"). `UnitsModal` takes an `isMobile` prop and shows the full IMEI1/IMEI2/Serial layout for Mobile or a single generic "Unique Code" field/column for General. `LabelPrintModal` takes `isMobile` too, for the same wording split. `POS.jsx`: unit/IMEI search and the "matching units" grid now gate on `supportsUnits = business.type !== 'pharmacy'` instead of `isMobile`, so General-shop unit codes are searchable/scannable at the register too. No backend/model changes were needed. Client build ✓, committed + pushed.
- **2026-07-25** — **Low Stock Alert pagination fix.** Client sent 2 screenshots (no text prompt) showing the Dashboard's "Low Stock Alert" widget and the Products list full of Smart-Import stock (mostly ৳0 price, many 0/low stock counts). Asked a clarifying question since intent wasn't obvious from images alone — client confirmed: the widget was silently capping at a handful of items when there are actually many low/zero-stock products (from the big Smart Import batches), and it should show/paginate all of them instead. Fix: `dashboardController.js` no longer slices `lowStockProducts` to 8 — returns the full list; `Dashboard.jsx` paginates it client-side (8/page, prev/next, item count badge, same pattern as `Employees.jsx`), resetting to page 1 whenever the period filter changes. Server import-chain + client build verified.
- **2026-08-03** — **Phase 26 done — customer due-date reminders + a real notification system.** Client's screenshot flagged the notification bell as a dead decorative icon (it was — `Notification` model + `/api/notifications` existed since an earlier phase, but nothing anywhere ever created a Notification document, and the bell had no onClick/badge/dropdown at all) and asked for a customer due-date field. Added `Customer.dueDate` (cleared automatically once totalDue hits 0, via both due-collection paths). Since this project has no cron/scheduler anywhere, built a lazily-computed, idempotent `ensureNotifications()` (`server/src/services/notificationService.js`) that runs whenever `GET /notifications` is called instead of on a timer — dedupes via a new `dedupeKey` field so the same still-true condition never duplicates, and prunes stale unread low-stock notices once a product is restocked. Low-stock checks are branch-scoped (Product is per-branch since Phase 25); due-date reminders are business-wide (Customer is shared). New `NotificationBell.jsx` replaces the dead bell in `Topbar.jsx` — unread badge, dropdown, mark-all-read, polls every 3 minutes. `Customers.jsx`'s Add-only modal became Add/Edit (it had no edit capability at all before this) with the new Due Date field. Verified across the whole server tree + import-chain + a 5-case dedupe/prune logic test + client build. See §3 Phase 26.
- **2026-08-08** — **Hotfix — `NotificationBell` crashed every logged-in page.** Client reported the Customers page (and, it turned out, every authenticated route — Topbar renders on all of them) went blank after deploying Phase 26. `useRef` had been removed from the import line but a stray `const ref = useRef(null)` declaration was left behind — this project has no ESLint, so `vite build` (transpile-only, no scope/reference checking) never caught it; only the client's own browser console did (`ReferenceError: useRef is not defined`). Removed the dead declaration, also cleaned up a harmless duplicate `Notifications` translation key introduced in the same phase. Lesson written into memory: for this project, "the build succeeded" is not sufficient verification for any change touching component internals — trace every identifier against its import, or actually render the component, before calling it done.
- **2026-08-08** — **Phase 27 done — Sidebar app-version indicator + "Relaunch to update".** New public `GET /api/version` returns the deployed git short-hash + commit timestamp (`server/src/utils/appVersion.js`, computed via `git rev-parse`/`git log`, cached per process — a fresh value appears automatically after every post-deploy `pm2 restart`, no manual version bumping). `Sidebar.jsx` polls it every 3 minutes; the bottom-left footer normally shows `v<hash>` and swaps to a clickable amber "Relaunch to update" the moment a newer commit is detected running server-side while the tab has been open. Prompted directly by the hotfix above — this time every identifier in the touched file was manually traced against its import before considering it verified. See §3 Phase 27.
- **2026-07-29** — **Phase 25 done — Multi-Branch Support.** New `Branch` model; `branch` added to Product/PhoneUnit/Sale/Purchase/Expense/Fund/Transfer/Installment/ServiceJob/Return/DuePayment (separate catalog + separate till per branch, per the client's explicit choice); `User.assignedBranch` locks a staff login to one branch server-side. New `resolveBranch` middleware + `branchFilter` helper (mirrors the existing `tenantFilter` pattern) wired into every branch-scoped route. Idempotent startup migration creates a Main Branch for any pre-existing business. Balances/Dashboard/Advanced-Report/Exports gained an owner-only "all branches combined" toggle. Frontend is header-based (`X-Branch-Id`), so POS/Products/Finance/Suppliers/Installments/Services/Returns needed zero page-level code changes — only a new branch switcher (Topbar), a new Branches management page, and two small additions (Employees' branch-restriction select, Smart Import's target-branch picker). Went through `/plan` first with two Explore agents given the size; the client's "separate catalog per branch" choice is what kept return/EMI/exchange stock-reversal logic unchanged (branch is implied by which Product document a Sale already references). Verified across the whole server tree + a 7-case resolveBranch precedence test + a migration-idempotency simulation + client build; recommended the client test a second branch live before relying on it. See §3 Phase 25.
- **2026-07-27** — **Phase 24 done — Products search now shows buy/sell price up front.** Searching by name renders a card grid above the table with Buy, Sell (discount-aware) and Stock per match, capped at 6, each card opening that product's Edit modal. Imported products with no price say "Price not set yet" instead of showing ৳0, and priced items show per-unit profit. Asked the client to choose between four readings first, since the table already had Buy/Sell columns. Frontend-only. See §3 Phase 24.
- **2026-07-27** — **Phase 23 done — business-type renamed + user deletion in the Admin Panel.** "Mobile Shop Management" is now labelled **"Technology Management System"** (label only — the stored `type: 'mobile'` value and all mobile-module gating are unchanged; the Bangla translation key moved with the English string). New superadmin-only `DELETE /api/admin/businesses/:id` removes the owner login, all staff logins, the business and its data, wiping every collection whose schema has a `business` path (verified: 28 models covered, only `Business` excluded and deleted explicitly) — with guards against deleting a superadmin or the admin's own account. The popup requires typing the business name before the red Delete button arms, and points at Deactivate as the reversible option. See §3 Phase 23.
- **2026-07-26** — **Phase 22 done — supplier due is directly editable.** New `PATCH /suppliers/:id/due` sets the due to an exact figure by moving `totalPurchase` to `totalPaid + target` (the due is a virtual, and real money paid must stay recorded), logging the signed difference as a new `Purchase` kind `'adjustment'` with `paid: 0` — chosen after auditing every `Purchase` aggregation so it can't inflate purchase reports (they filter `kind:'purchase'`) or shift Cash/Bank balances (they sum `paid`). New per-row "Edit due" modal shows the current due, a live increase/decrease hint, a reason note, and an amber warning that this is a correction, not a payment; the ledger badges it as "Due correction" with a signed amount. Record Purchase and Pay due are untouched. Arithmetic verified across 5 supplier states incl. an over-paid one. See §3 Phase 22.
- **2026-07-26** — **Phase 21 done — Smart Import upload no longer times out.** Client supplied the actual failing file (`Smart Phone .xls`, the legacy 552-item HTML-as-.xls report, sitting in the *other* project copy on the Desktop). The parser handled it fine; the real blocker was Phase 16's `classifyRows` doing a per-row `Product.findOne` — 552 sequential Atlas queries on the preview (and ~1100 on commit), which exceeds Nginx's 60s proxy timeout, and the frontend then wrongly reported it as an unreadable file. Rewrote both paths to bulk operations (~6 round-trips regardless of size): catalogue + suppliers loaded once and matched in memory via a shared case-insensitive `productKey`, `insertMany` for new suppliers/products/units, one aggregate + `bulkWrite` for the stock resync. Also added `uploadError()` so a 502/504 says the server timed out instead of blaming the file. See §3 Phase 21.
- **2026-07-26** — **Phase 20 done — Smart Stock Import fixed.** Client couldn't import a file that had only product names. Root cause was the parser's exact-match header aliasing, not the (already name-only) validation: any header it didn't literally know threw "Could not find a Name/Item column" and failed the whole file — and the same bug made **our own Phase-16 migration template** silently drop its `Supplier / Seller Name` and `IMEIs (comma separated)` columns. Now: two-pass (exact → contains) header matching resolved specific-fields-first so "Supplier Name" can't be mistaken for the product name, a row-index blocklist, a transparent first-column fallback (reported as `assumedNameColumn`) instead of rejecting the file, header-less single-column name lists supported (new `parseCSVRows` in `csv.js`), `Discount %` finally read, and the preview now shows exactly which column became which field. Parser harness run over 8 file shapes incl. a legacy-HTML-report regression check. See §3 Phase 20.
- **2026-07-25** — **Phase 19 done.** Expired stock is now warned about and unsellable: new shared `utils/expiry.js` guard rejects expired lines in `createSale` **and** in the exchange's replacement item; POS blocks every add path (cards, scan, keyboard flow, checkout) and shows red "Expired — cannot sell" badges in the suggestion list, product cards and cart lines (covering a held bill resumed after expiry), while ≤30-day items get an amber "expires in Nd" heads-up and stay sellable. Today's date still counts as sellable on both sides, boundary-tested. See §3 Phase 19.
- **2026-07-25** — **Phase 18 done.** POS keyboard flow gained a quantity step: Enter on a suggestion now adds the line with an empty qty box and focuses it, typing the number + Enter returns to the search box, and Shift+Enter (from search or qty) jumps to the customer fields. Customer phone/name are now optional for every shop type (the blocking server check + client toast removed) — with one deliberate exception: a sale that leaves a due still needs a phone or name, since an unattached due can never be collected. Caught a bug in that new guard before shipping (a blank payment amount means "paid in full" at checkout but shows as due on screen, which would have blocked the very walk-in sale this enables) — the guard now uses the payments actually being sent. Also verified the "Expired" badge in the client's Products screenshot is correct behavior, not a bug. See §3 Phase 18.
- **2026-07-25** — **Phase 17 done.** Pharmacy POS is now fully keyboard-operable: the barcode/IMEI scan box is hidden for pharmacy shops (completing the earlier "no barcode system for pharmacy" decision), the product-name search gained an in-stock suggestion dropdown with ↑/↓ + Enter (adds to cart, clears the box, keeps focus for the next item), and Enter on an empty box walks focus through Customer Phone → Name → (NID) → Discount → Payment → Complete Sale button. Customer-phone suggestions became keyboard-navigable too (but never auto-attach a customer on a bare Enter); `PrintWrapper` closes on Esc and hands focus back to the search box so the next sale needs no mouse. Prevented a real hazard while building: the debounced product fetch could let Enter add the *previous* keystroke's match, so suggestions are now re-matched against the live search text. Client build verified; not run against the live production database. See §3 Phase 17.
- **2026-09-06** — **"Sell by" corrected to a manually-typed employee field.** Client clarified that the earlier "Sell by" fix (Phase-11-era `Sale.soldBy` — the logged-in account) doesn't fit this shop: several employees commonly ring up sales on one shared POS login, so the account name never actually said who was at the counter. Added `Sale.soldByName` (plain string) — driven by a new "Sold By (Employee)" free-text box at the top of the POS cart's info section, persisted per business in localStorage (same pattern as held carts) and deliberately **not** cleared by `resetSale`, since one employee rings up many sales in a row without retyping their name; falls back to the login's own name when left blank so a shop that never touches the field sees no change. `ThermalReceipt.jsx` now prints `sale.soldByName` (the existing `soldBy` account ref is kept for audit but no longer drives the receipt line). Server `node --check` + import-chain, client `vite build`, and a full identifier trace of every `soldByName`/`soldByKey`/`setSoldBy` usage in `POS.jsx` all verified; not exercised against a live database (standing limitation).
- **2026-08-11** — **Phase 28 done — session-3 fixes.** Modals no longer close on an outside click (shared `Modal.jsx` + `ConfirmContext.jsx`, so Admin Panel's Create Owner and Add Product are both covered); per-product **stock quantity button** (add/remove/set with a live preview, refused for serial-tracked items whose stock is derived from unit codes); **Money Back** on the invoice for handing back an overpayment (derived amount, own history, subtracted from the till by the balance engine, never touching stock/profit); new **Invoice Search** page + `GET /sales/search` (business-wide lookup, branch-scoped actions); supplier per-product **Sold is now net of returns** (it summed `items.qty`, which a return never reduces); and **EMI made a real sale**: product search-by-name + device picker + universal scan + inline customer creation (the barcode-only picker is why imported stock never linked or stocked out), plus a **Product Price + Extra Profit (৳ or %) = EMI Price** row of linked boxes for the credit markup, a cost basis on the plan, and profit recognised **payment by payment** through the new `services/emiService.js`, surfaced on the Dashboard and Advanced Report, with an editor to backfill the cost on older plans. See §3 Phase 28.
- **2026-07-25** — **Phase 16 done.** New downloadable "Migration Template" (`GET /import/migration/template`) for shops moving from another system: product name + multiple IMEIs in one cell + buy/sell price + warranty + seller name. `smartImport.js` gained brand/storage/color/warranty/IMEIs field aliases. `classifyRows()` labels every row new / existing-add-IMEIs-only / conflict (an IMEI already used elsewhere) before anything is written; `smartImportPreview` returns the full per-row list instead of a sample; `smartImportCommit` takes a `skipRows` list so the owner can accept or decline each row individually — existing products are never overwritten, only given new IMEIs. `ImportExport.jsx`'s preview became a per-row checkbox table with status badges. Caught and fixed a real bug along the way: the template CSV builder didn't quote fields containing commas, which would have silently mis-split the multi-IMEI example on re-import. Server import-chain + client build verified; parser and the template-escaping fix both verified with direct round-trip tests.
- **2026-08-15** — **Phase 29 done — Admin Panel data visibility.** Businesses table gained a Branches column + a `shopsWithBranches` overview stat; new per-shop data browser (`/admin/businesses/:id`, driven off the same model-registry scan `deleteBusiness` uses, so any model with a `business` path is automatically browsable); new exact per-shop MongoDB storage usage via `$bsonSize`, one aggregation per collection grouped by business (a manual "Calculate" button, not auto-run — it walks every document in the database). See §3 Phase 29.
- **2026-08-15/16** — **Phase 30 done — "Scan with Phone".** Replaces the client's dependency on the third-party `barcodetopc.com` bridge: POS/Products show a QR code, any phone scans it with its own camera (no app install) and lands on a public in-app page that reads barcodes/IMEI in-browser and posts them back to a live session the connected tab polls — reusing the existing backend instead of a LAN-local WebSocket-bridge architecture that doesn't fit a hosted SaaS. After live client testing: made the connection persistent + app-wide (Topbar widget, `ScannerContext`, works for both POS and product entry, no timeout while in use) and fixed real scanning-quality bugs (center guide-line to pick between close-together barcodes, a proper "still in view" dedupe instead of resubmitting every ~1.5s, faster decode timing, auto-retry on a black first frame). The only phase verified with an actual phone rather than just logic fixtures. See §3 Phase 30.
- **2026-08-25** — **Phase 31 done — thermal receipt clipping, the real fix (3 rounds).** Client's printed receipts were cut off on the right on every line. Round 1 (paper-width Setting) and round 2 (`@page size` + printable-vs-nominal roll width) both looked right in isolation but still clipped live — round 3 found why: the print-preview modal is `position:fixed`, so "100% width" in `@media print` was resolving against the browser viewport, not the page. Final fix stops printing to any fixed mm width at all — thermal content now renders at 100% of whatever page actually gets used, which cannot overflow it. Lesson for next time: verify a print-layout fix against the live deployed site (measure computed widths via injected JS, read the compiled CSS out of `dist/`), not just by reasoning from source — two of the three rounds here would have looked "done" without that. See §3 Phase 31.
- **2026-08-25** — **Phase 32 done — Stock Transfer between branches.** The feature explicitly deferred at the end of Phase 25. New Sidebar sub-menu under Branches. Because each branch keeps its own catalog, a transfer isn't a stock-number edit — it resolves/creates the destination branch's own product, re-homes serial-tracked `PhoneUnit`s device-by-device with stock re-derived on both sides afterward, and decrements/increments quantity items directly, all in one transaction. New `StockTransfer.jsx` page with a device/barcode scan box (works with the Phase-30 phone scanner too) and transfer history. An 18-case logic fixture verified the algorithm end to end. See §3 Phase 32.
- **2026-09-06** — **Hotfix — Pay Salary threw "Path `branch` is required".** Client reported the paid amount updated correctly but the request still failed. Root cause: Phase 25 made `Expense.branch` required, but the salary-payment code (Phase 13, pre-dating branches) never set it, and `employeeRoutes.js` never chained `resolveBranch` (Employee itself is business-wide by design, so nobody needed `req.branchId` there before) — `employee.save()` succeeded first, then the Expense validation threw, which is exactly the reported symptom. Fixed by chaining `resolveBranch` and passing `branch: req.branchId` into the Expense. While in there, also added the two things the client asked for alongside the bug report: **split/multi-tender salary payments** (one payment can be paid across several methods at once, same pattern as POS's split payment) and a **Salary Payment vs Advance** type toggle, both reflected on the printed `SalarySlip`. Verified with a 20-case logic fixture mirroring `paySalary`'s exact arithmetic, server import-chain, client build.
- **2026-09-06** — **Follow-up — Salary Slip on the POS printer + reprint from history.** `SalarySlip.jsx` was still `print-a4` — most shops running this app have only the one thermal printer already used for every other receipt, so it never actually printed on real hardware. Converted to a thermal receipt (same `thermalWidthClass`/`useThermalPageSize` pattern as the other 6 thermal print components). Employee Profile also had no way to see or reprint past salary payments at all (only the just-made payment's slip ever printed) — added a Salary History section listing every month + every individual payment with a print icon each, reprinting builds a synthetic `{...month, payments:[thatOnePayment]}` record so the real month totals show alongside that specific historical payment (same idea as EMI's per-instalment reprint, Phase 6). No new endpoint needed — `getEmployees` already returns full documents.
- **2026-09-06** — **Service/Repair: removed "Customer Budget", added a real Collect Due system.** Client: the budget field isn't needed, and there was no way to collect a service customer's due at all (flagged since Phase 5 as "paid/paymentMethod are simply mutable fields, no ledger"). Removed `budget` entirely (model/controller/client). Added `ServiceJob.payments[]` (seeded with any up-front `paid` at creation so it always sums correctly) + `POST /services/:id/collect-due`, a `HandCoins` icon in the job list (matching Customers.jsx's existing convention) opening a Collect Due modal, and a new thermal `ServiceDueReceipt`. Caught and fixed a real bug in `balanceService.js` before it could bite: the ServiceJob balance aggregation summed the whole `paid` field grouped by a single `paymentMethod`, which would have mis-attributed an up-front cash payment and a later bkash due-collection on the same job both to whichever method was recorded last — split into a payments[]-unwind (mirroring Sale) with a legacy paid+paymentMethod fallback for jobs with an empty ledger. 16-case logic fixture verified the arithmetic including that exact split-attribution case.
- **2026-09-06** — **"Sell by" on the invoice + customer address at POS + Customers list shows NID/Address.** `Sale.soldBy` had been stored on every sale for a long time, but nothing ever populated it before returning a sale to the client, so the printed receipt had no name to show — added `.populate('soldBy','name')` everywhere a Sale reaches a print component (`createSale`'s own response, `getSale`, `customerHistory`'s sales list); `ThermalReceipt.jsx` prints the client's exact requested wording, `Sell by "name"`. POS gained a Customer Address field (right after Customer Name, in the keyboard Enter-chain, threaded through Hold/Resume) that backfills onto a new-or-existing customer the same way NID capture already does. Customers list now shows NID and Address columns — `GET /customers` already returned full documents, they just weren't rendered.

---

### How to resume after context loss
1. Read this whole file. 2. Check the Phase Plan status markers (§3) for the first non-✅ phase. 3. Re-read that phase's bullet list + §4 conventions. 4. `git log --oneline` and `git status` to see what's committed. 5. Continue; update §3 status + §5 change log when done.
