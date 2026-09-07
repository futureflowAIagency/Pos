// Shared "View Buy Price" gate.
//
// Owner/superadmin always see a product's purchase/buy price; a staff login
// needs the 'view-buy-price' permission explicitly — separate from having
// Products access itself, since an owner may want staff to manage stock
// without seeing what it actually cost.
//
// This lives in its own module (rather than inside productController) because
// the buy price leaks out of several controllers, not just the Products list:
// the barcode scan lookup, the CSV/JSON exports and full backup, the advanced
// report's stock valuation, and the dashboard's low-stock widget all hand back
// product documents. Every one of those must ask the same question, or the
// toggle only hides the number on one screen.
export const canViewBuyPrice = (req) =>
  req.user.role !== 'staff' || (req.user.permissions || []).includes('view-buy-price');

// Redacts purchasePrice on a plain object (call .toObject()/.toJSON() on a
// Mongoose doc first) — null rather than deleting the key, so the client's
// shape stays predictable (a missing vs. hidden field would otherwise look
// the same as "not set" everywhere the UI checks for it).
export const hideBuyPrice = (obj) => { obj.purchasePrice = null; return obj; };
