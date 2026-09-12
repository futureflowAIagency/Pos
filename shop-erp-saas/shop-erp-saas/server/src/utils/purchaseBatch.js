import PurchaseBatch from '../models/PurchaseBatch.js';
import { branchFilter } from '../middleware/tenant.js';

// FIFO-consume `qtyNeeded` units' worth of cost from a plain-qty product's
// purchase batches (oldest `purchaseDate` first), mutating (and saving, within
// the caller's transaction session) whichever batches get touched. Returns a
// qty-weighted-average cost across everything consumed, and the OLDEST
// consumed batch's selling price as the default price to charge.
//
// A product with zero batches (every product that predates this feature, or
// was only ever brought in via Smart Import / plain Add Product) needs no
// special-casing at all — `batches` comes back empty, the loop never runs, and
// the whole qty falls straight into the "shortfall" branch below, which is
// exactly today's flat `product.purchasePrice`/`sellingPrice` behavior.
export async function consumeBatchesFifo(req, session, product, qtyNeeded) {
  const need = Math.max(0, Number(qtyNeeded) || 0);
  const batches = await PurchaseBatch.find(branchFilter(req, { product: product._id, qtyRemaining: { $gt: 0 } }))
    .sort({ purchaseDate: 1, createdAt: 1 })
    .session(session);

  let remaining = need;
  let costTotal = 0;
  let costedQty = 0;
  let sellingPriceBase = null;
  const touched = [];

  for (const b of batches) {
    if (remaining <= 0) break;
    const take = Math.min(b.qtyRemaining, remaining);
    if (take <= 0) continue;
    if (sellingPriceBase === null) sellingPriceBase = b.sellingPrice;
    costTotal += b.purchasePrice * take;
    costedQty += take;
    b.qtyRemaining -= take;
    remaining -= take;
    touched.push(b);
  }

  // Shortfall (includes the "zero batches at all" case): whatever qty couldn't
  // be matched to a batch is costed at today's flat product price instead of
  // failing the sale — the same "never hard-fail, degrade gracefully"
  // convention Smart Import already follows for an unrecognized column.
  if (remaining > 0) {
    costTotal += product.purchasePrice * remaining;
    costedQty += remaining;
    if (sellingPriceBase === null) sellingPriceBase = product.sellingPrice;
  }

  for (const b of touched) await b.save({ session });

  return {
    purchasePrice: costedQty ? Math.round((costTotal / costedQty) * 100) / 100 : product.purchasePrice,
    sellingPriceBase: sellingPriceBase ?? product.sellingPrice,
  };
}

// Resolves the cost + base (pre-discount) selling price for ONE sale/exchange
// line — used identically by saleController.createSale and
// returnController.createExchange so the two can never silently disagree.
//
// Preference order: a specific scanned unit's own stored price (set once when
// that exact device was brought in, and never touched again — this is why old
// stock keeps its old price even after the product's flat fields move on) →
// FIFO-consumed batch cost for a plain-qty line → the product's own flat
// price (identical result for anything that predates this feature).
//
// `unit` must already be the fetched PhoneUnit document (or null/undefined for
// a plain-qty line) — callers already need to load it themselves for
// warranty-stamping/mark-sold logic, so this never double-fetches it.
export async function resolveLineCost(req, session, product, { unit, qty }) {
  if (unit) {
    return {
      purchasePrice: unit.purchasePrice != null ? unit.purchasePrice : product.purchasePrice,
      sellingPriceBase: unit.sellingPrice != null ? unit.sellingPrice : product.sellingPrice,
    };
  }
  return consumeBatchesFifo(req, session, product, qty);
}
