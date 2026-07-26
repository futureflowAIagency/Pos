// Dependency-free CSV read/write (Excel opens .csv natively, so this covers
// the "Excel/CSV" import-export requirement without adding a binary-xlsx lib).

// columns: [{ key, label, value?(row) }] — `value` overrides plain row[key].
export function toCSV(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = columns.map((c) => esc(c.label || c.key)).join(',');
  const lines = rows.map((r) =>
    columns.map((c) => esc(c.value ? c.value(r) : r[c.key])).join(',')
  );
  return [header, ...lines].join('\r\n');
}

// Robust CSV reader (handles quoted fields with embedded commas/newlines/escaped
// quotes). Returns the raw grid — array of rows, each an array of cell strings.
// Used directly when the caller can't assume the first line is a header row.
export function parseCSVRows(text) {
  const clean = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = ''; rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Same parser, keyed by the header row: array of objects. Blank rows dropped.
export function parseCSV(text) {
  const rows = parseCSVRows(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((v) => String(v).trim() !== ''))
    .map((r) => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
      return obj;
    });
}
