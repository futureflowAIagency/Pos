import * as XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import { parseCSV, parseCSVRows } from './csv.js';

// Fuzzy header aliasing — lets a shop owner upload whatever column names their
// old software (or their own spreadsheet) happens to use, rather than forcing a
// fixed template. Matching runs in two passes: an exact alias hit first, then a
// looser "header contains the alias" pass. Fields are resolved in the order
// listed below and a header can only be claimed once, so a specific column like
// "Supplier Name" is taken by `supplier` before the generic `name` can grab it.
const FIELD_ALIASES = {
  supplier: ['supplier', 'supplier name', 'dealer', 'dealer name', 'company', 'company name', 'vendor', 'seller', 'seller name'],
  purchasePrice: ['purchase price', 'buy price', 'buy', 'cost', 'cost price', 'purchase rate', 'buying price'],
  sellingPrice: ['selling price', 'sell price', 'sell', 'sale price', 'price', 'mrp', 'selling rate', 'retail price'],
  discountPercent: ['discount %', 'discount', 'disc %', 'disc'],
  warrantyBrandMonths: ['brand warranty (months)', 'brand warranty', 'warranty (brand)'],
  warrantyShopMonths: ['shop warranty (months)', 'shop warranty', 'warranty (shop)'],
  imeis: ['imeis', 'imei', 'imei numbers', 'imei / serial', 'imei/serial', 'imei numbers (comma separated)', 'serial numbers', 'serial'],
  barcode: ['barcode', 'bar code'],
  sku: ['sku', 'item code', 'product code', 'code'],
  category: ['category', 'category name', 'cat', 'group', 'type'],
  stock: ['stock', 'stock balance', 'qty', 'quantity', 'balance', 'in stock', 'pcs'],
  brand: ['brand', 'company brand'],
  storage: ['storage', 'ram/rom', 'ram rom', 'variant'],
  color: ['color', 'colour'],
  // most generic — resolved last so it can't steal "Supplier Name"/"Item Code"
  name: ['name', 'item name', 'item', 'product name', 'product', 'model', 'model name', 'description', 'particulars'],
};

const normalizeHeader = (h) => String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');

// A row-number / serial-number column is never the product name.
const INDEX_HEADERS = ['sl', 'sl no', 'sl.no', 'sl. no', 'slno', 'no', 'no.', '#', 'sr', 'sr no', 'sr.no', 'serial no', 'index', 'si', 'si no'];
const isIndexHeader = (h) => INDEX_HEADERS.includes(normalizeHeader(h));

// Maps each known field to the ORIGINAL header string that matched it, so the
// caller can read `row[map.name]` etc. regardless of how the file spelled it.
function mapHeaders(headers) {
  const map = {};
  const used = new Set();
  const fields = Object.entries(FIELD_ALIASES);

  // pass 1 — exact match (highest confidence)
  for (const [field, aliases] of fields) {
    const hit = headers.find((h) => !used.has(h) && aliases.includes(normalizeHeader(h)));
    if (hit != null) { map[field] = hit; used.add(hit); }
  }
  // pass 2 — the header merely contains an alias, e.g. "Phone Name",
  // "Supplier / Seller Name", "IMEIs (comma separated)", "Qty in stock"
  for (const [field, aliases] of fields) {
    if (map[field] != null) continue;
    const hit = headers.find((h) => {
      if (used.has(h) || isIndexHeader(h)) return false;
      const norm = normalizeHeader(h);
      return aliases.some((a) => norm.includes(a));
    });
    if (hit != null) { map[field] = hit; used.add(hit); }
  }
  return map;
}

// Last resort when no column reads like a product name: use the first column
// that isn't a row-number column. The owner reviews every row in the preview
// before anything is written, so a transparent guess beats refusing the file.
function guessNameHeader(headers) {
  return headers.find((h) => String(h ?? '').trim() && !isIndexHeader(h)) ?? null;
}

// Does this look like a header row, or is it already product data? Used for
// files that are just a bare list of names with no header at all.
const looksLikeHeaderCell = (v) => {
  const norm = normalizeHeader(v);
  if (!norm) return false;
  if (isIndexHeader(norm)) return true;
  return Object.values(FIELD_ALIASES).some((aliases) => aliases.some((a) => norm.includes(a)));
};

// Normalizes any array-of-objects (keyed by whatever headers the source file
// used) into our common shape: { supplierName, name, category, stock, barcode,
// sku, purchasePrice, sellingPrice, brand, storage, color, warrantyBrandMonths,
// warrantyShopMonths, imeisRaw }
// `info` (optional) collects what was understood, so the preview can show the
// owner which column became which field — and warn when the name column was a
// guess rather than a recognized header.
function extractTabularObjects(rowObjects, info = {}) {
  if (!rowObjects.length) return [];
  const headers = Object.keys(rowObjects[0]);
  const map = mapHeaders(headers);
  if (map.name == null) {
    // No column reads like a product name (e.g. the owner just typed "Phone" or
    // used a Bangla heading). Take the first non-index column instead of
    // rejecting the whole file — every row is still reviewed in the preview.
    map.name = guessNameHeader(headers);
    if (map.name == null) throw new Error('This file has no readable columns');
    info.assumedNameColumn = map.name;
  }
  info.columnMap = Object.fromEntries(Object.entries(map).filter(([, h]) => h != null));
  info.ignoredColumns = headers.filter((h) => String(h ?? '').trim() && !Object.values(map).includes(h));
  const val = (r, key) => (map[key] != null ? String(r[map[key]] ?? '').trim() : '');
  return rowObjects
    .map((r) => ({
      supplierName: val(r, 'supplier'),
      name: val(r, 'name'),
      category: val(r, 'category'),
      stock: map.stock != null ? r[map.stock] : '0',
      barcode: val(r, 'barcode'),
      sku: val(r, 'sku'),
      purchasePrice: map.purchasePrice != null ? r[map.purchasePrice] : '',
      sellingPrice: map.sellingPrice != null ? r[map.sellingPrice] : '',
      discountPercent: map.discountPercent != null ? r[map.discountPercent] : '',
      brand: val(r, 'brand'),
      storage: val(r, 'storage'),
      color: val(r, 'color'),
      warrantyBrandMonths: map.warrantyBrandMonths != null ? r[map.warrantyBrandMonths] : '',
      warrantyShopMonths: map.warrantyShopMonths != null ? r[map.warrantyShopMonths] : '',
      imeisRaw: val(r, 'imeis'),
    }))
    .filter((r) => r.name);
}

// A file that is nothing but a list of product names — no header row at all
// ("সাপোজ শুধু ফোনের নাম তুলতে চাই"). Only used when every populated row has a
// single value, so there is nothing to misinterpret.
function extractNameOnlyGrid(grid, info = {}) {
  const rows = grid.map((r) => (r || []).map((c) => String(c ?? '').trim()));
  const populated = rows.filter((r) => r.some(Boolean));
  if (!populated.length) return null;
  if (populated.some((r) => r.filter(Boolean).length > 1)) return null; // more than one column
  let names = populated.map((r) => r.find(Boolean));
  if (looksLikeHeaderCell(names[0])) names = names.slice(1); // had a header after all
  if (!names.length) return null;
  info.columnMap = { name: '(single column — no header)' };
  info.ignoredColumns = [];
  return names.map((name) => ({
    supplierName: '', name, category: '', stock: '0', barcode: '', sku: '',
    purchasePrice: '', sellingPrice: '', discountPercent: '', brand: '', storage: '', color: '',
    warrantyBrandMonths: '', warrantyShopMonths: '', imeisRaw: '',
  }));
}

// The shop's old inventory software exports an "Itemwise Stock Report" as an
// HTML page saved with a .xls extension: for each supplier/dealer, a
// "Company Name : X" heading followed by a table of items (Sl No / Category /
// Item Name / Stock balance — column names can vary slightly). This walks the
// document in order, pairing each heading with the table(s) that follow it.
function looksLikeLegacyHtmlReport(text) {
  return /<table[\s>]/i.test(text) && /(company|supplier|dealer)\s*name\s*:/i.test(text);
}

function extractLegacyHtmlReport(text) {
  const $ = cheerio.load(text);
  const markerRe = /(?:company|supplier|dealer)\s*name\s*:\s*(.+)/i;
  const combined = $('span, b, strong, h1, h2, h3, h4, p, table').toArray();

  let currentSupplier = '';
  const rows = [];
  for (const el of combined) {
    const $el = $(el);
    if (el.tagName === 'table') {
      const trs = $el.find('tr').toArray();
      if (!trs.length) continue;
      const header = $(trs[0]).find('th,td').map((i, c) => $(c).text().trim()).get();
      const map = mapHeaders(header);
      if (map.name == null) continue; // not a real data table (e.g. an empty layout table)
      for (const tr of trs.slice(1)) {
        const cells = $(tr).find('th,td').map((i, c) => $(c).text().trim()).get();
        if (!cells.length) continue;
        const idx = header.indexOf(map.name);
        const name = cells[idx];
        if (!name?.trim()) continue;
        rows.push({
          supplierName: currentSupplier,
          name: name.trim(),
          category: map.category ? cells[header.indexOf(map.category)]?.trim() || '' : '',
          stock: map.stock ? cells[header.indexOf(map.stock)] ?? '0' : '0',
          barcode: '', sku: '', purchasePrice: '', sellingPrice: '', discountPercent: '',
          brand: '', storage: '', color: '', warrantyBrandMonths: '', warrantyShopMonths: '', imeisRaw: '',
        });
      }
      continue;
    }
    // non-table element: only care about it if it's a leaf-ish heading carrying the marker
    if ($el.children().length > 0) continue;
    const m = markerRe.exec($el.text().trim());
    if (m) currentSupplier = m[1].trim();
  }
  return rows;
}

// Generic fallback for a plain HTML table export with no supplier grouping —
// takes the largest table on the page and header-maps it like any tabular file.
function extractHtmlTableGeneric(text, info = {}) {
  const $ = cheerio.load(text);
  let best = null, bestLen = 0;
  $('table').each((i, tbl) => {
    const len = $(tbl).find('tr').length;
    if (len > bestLen) { bestLen = len; best = tbl; }
  });
  if (!best) return [];
  const trs = $(best).find('tr').toArray();
  if (!trs.length) return [];
  const header = $(trs[0]).find('th,td').map((i, c) => $(c).text().trim()).get();
  const objRows = trs.slice(1).map((tr) => {
    const cells = $(tr).find('th,td').map((i, c) => $(c).text().trim()).get();
    const obj = {};
    header.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });
  return extractTabularObjects(objRows, info);
}

// Top-level entry point: given a raw uploaded file (buffer + original filename),
// figures out what shape it's in and returns a normalized row list, regardless
// of whether it's really a .csv/.txt, a real binary .xlsx/.xls, or (as with this
// shop's old software) an HTML report saved with a misleading .xls extension.
export function parseUploadedFile(buffer, filename) {
  const ext = (String(filename || '').split('.').pop() || '').toLowerCase();
  const info = {}; // columnMap / assumedNameColumn / ignoredColumns, for the preview
  let text = null;
  try { text = buffer.toString('utf8'); } catch { /* binary content, ignore */ }
  const isHtml = !!text && /<table[\s>]/i.test(text) && /<tr[\s>]/i.test(text);

  if (isHtml && looksLikeLegacyHtmlReport(text)) {
    const rows = extractLegacyHtmlReport(text);
    if (rows.length) return { rows, format: 'legacy-html-report', info };
  }
  if (isHtml) {
    return { rows: extractHtmlTableGeneric(text, info), format: 'html-table', info };
  }

  // A grid (array of rows of cells) is kept alongside the header-keyed objects so
  // a header-less single-column file can still be read as a plain name list.
  let grid = [];
  let objRows = [];
  let format = 'csv';
  if (['xlsx', 'xls'].includes(ext)) {
    format = 'spreadsheet';
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    objRows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
  } else {
    grid = parseCSVRows(text || '');
    objRows = parseCSV(text || '');
  }

  const singleColumn = extractNameOnlyGrid(grid, info);
  if (singleColumn) return { rows: singleColumn, format: `${format} (name list)`, info };
  return { rows: extractTabularObjects(objRows, info), format, info };
}
