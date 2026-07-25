import * as XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import { parseCSV } from './csv.js';

// Fuzzy header aliasing — lets a shop owner upload whatever column names their
// old software happens to use (not a fixed template) and still have the file
// understood correctly. First alias match wins per field.
const FIELD_ALIASES = {
  name: ['name', 'item name', 'item', 'product name', 'product', 'model'],
  category: ['category', 'category name', 'cat', 'type'],
  stock: ['stock', 'stock balance', 'qty', 'quantity', 'balance', 'in stock'],
  supplier: ['supplier', 'supplier name', 'dealer', 'dealer name', 'company', 'company name', 'vendor', 'seller', 'seller name'],
  barcode: ['barcode', 'bar code'],
  sku: ['sku', 'code', 'item code', 'product code'],
  purchasePrice: ['purchase price', 'buy price', 'buy', 'cost', 'cost price'],
  sellingPrice: ['selling price', 'sell price', 'sell', 'sale price', 'price', 'mrp'],
  brand: ['brand'],
  storage: ['storage', 'ram/rom', 'ram rom', 'variant'],
  color: ['color', 'colour'],
  warrantyBrandMonths: ['brand warranty (months)', 'brand warranty', 'warranty (brand)'],
  warrantyShopMonths: ['shop warranty (months)', 'shop warranty', 'warranty (shop)'],
  imeis: ['imeis', 'imei', 'imei numbers', 'imei / serial', 'imei/serial', 'imei numbers (comma separated)'],
};

const normalizeHeader = (h) => String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Maps each known field to the ORIGINAL header string that matched it, so the
// caller can read `row[map.name]` etc. regardless of how the file spelled it.
function mapHeaders(headers) {
  const map = {};
  for (const h of headers) {
    const norm = normalizeHeader(h);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (map[field] != null) continue;
      if (aliases.includes(norm)) map[field] = h;
    }
  }
  return map;
}

// Normalizes any array-of-objects (keyed by whatever headers the source file
// used) into our common shape: { supplierName, name, category, stock, barcode,
// sku, purchasePrice, sellingPrice, brand, storage, color, warrantyBrandMonths,
// warrantyShopMonths, imeisRaw }
function extractTabularObjects(rowObjects) {
  if (!rowObjects.length) return [];
  const headers = Object.keys(rowObjects[0]);
  const map = mapHeaders(headers);
  if (map.name == null) throw new Error('Could not find a Name/Item column in this file');
  return rowObjects
    .map((r) => ({
      supplierName: map.supplier ? String(r[map.supplier] || '').trim() : '',
      name: String(r[map.name] || '').trim(),
      category: map.category ? String(r[map.category] || '').trim() : '',
      stock: map.stock != null ? r[map.stock] : '0',
      barcode: map.barcode ? String(r[map.barcode] || '').trim() : '',
      sku: map.sku ? String(r[map.sku] || '').trim() : '',
      purchasePrice: map.purchasePrice != null ? r[map.purchasePrice] : '',
      sellingPrice: map.sellingPrice != null ? r[map.sellingPrice] : '',
      brand: map.brand ? String(r[map.brand] || '').trim() : '',
      storage: map.storage ? String(r[map.storage] || '').trim() : '',
      color: map.color ? String(r[map.color] || '').trim() : '',
      warrantyBrandMonths: map.warrantyBrandMonths != null ? r[map.warrantyBrandMonths] : '',
      warrantyShopMonths: map.warrantyShopMonths != null ? r[map.warrantyShopMonths] : '',
      imeisRaw: map.imeis ? String(r[map.imeis] || '').trim() : '',
    }))
    .filter((r) => r.name);
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
          barcode: '', sku: '', purchasePrice: '', sellingPrice: '',
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
function extractHtmlTableGeneric(text) {
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
  return extractTabularObjects(objRows);
}

// Top-level entry point: given a raw uploaded file (buffer + original filename),
// figures out what shape it's in and returns a normalized row list, regardless
// of whether it's really a .csv/.txt, a real binary .xlsx/.xls, or (as with this
// shop's old software) an HTML report saved with a misleading .xls extension.
export function parseUploadedFile(buffer, filename) {
  const ext = (String(filename || '').split('.').pop() || '').toLowerCase();
  let text = null;
  try { text = buffer.toString('utf8'); } catch { /* binary content, ignore */ }
  const isHtml = !!text && /<table[\s>]/i.test(text) && /<tr[\s>]/i.test(text);

  if (isHtml && looksLikeLegacyHtmlReport(text)) {
    const rows = extractLegacyHtmlReport(text);
    if (rows.length) return { rows, format: 'legacy-html-report' };
  }
  if (isHtml) {
    return { rows: extractHtmlTableGeneric(text), format: 'html-table' };
  }
  if (['xlsx', 'xls'].includes(ext)) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const objRows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
    return { rows: extractTabularObjects(objRows), format: 'spreadsheet' };
  }
  // CSV / TXT
  const objRows = parseCSV(text || '');
  return { rows: extractTabularObjects(objRows), format: 'csv' };
}
