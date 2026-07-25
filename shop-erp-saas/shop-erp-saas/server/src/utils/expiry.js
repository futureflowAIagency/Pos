/**
 * Expired stock must never leave the shop (pharmacy/medicine safety).
 * Returns a ready-to-show message when the product is expired, else null.
 * A product whose expiry date is TODAY is still sellable — only a date before
 * today counts as expired, matching the client's `expiryStatus()` badge logic.
 */
export const expiredError = (product) => {
  if (!product?.expiryDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = new Date(product.expiryDate); exp.setHours(0, 0, 0, 0);
  if (exp >= today) return null;
  const on = exp.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${product.name} expired on ${on} — it cannot be sold`;
};
