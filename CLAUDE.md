# CLAUDE.md — Shop ERP / POS SaaS — Project Log & Phase Roadmap

> **Purpose of this file:** A persistent record of everything Claude works on for this
> project. If the chat context is ever lost, read this file to understand what has been
> done, what remains, decisions made, and where each feature lives in the code.
> **Update this file after every completed phase / meaningful change.**

Last updated: **2026-07-25** — all 10 original phases complete; Phase 11–14 complete; Phase 15 (Scan IMEI with AI) was built then fully removed at client request; a real Products-search bug fix landed; **Low Stock Alert pagination fix (2026-07-25) also complete** (see §5 change log)

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

---

### How to resume after context loss
1. Read this whole file. 2. Check the Phase Plan status markers (§3) for the first non-✅ phase. 3. Re-read that phase's bullet list + §4 conventions. 4. `git log --oneline` and `git status` to see what's committed. 5. Continue; update §3 status + §5 change log when done.
