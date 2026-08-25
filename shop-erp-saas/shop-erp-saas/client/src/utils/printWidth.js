// Which thermal-roll width CSS class a receipt should render with, based on
// the shop's Settings → Receipt Paper Width. Defaults to 80mm. Note this
// picks the PRINTABLE-width class (.print-thermal-80 = 72mm content,
// .print-thermal-58 = 48mm content) — see index.css for why it's narrower
// than the nominal roll size.
export const thermalWidthClass = (business) =>
  business?.settings?.printWidthMm === 58 ? 'print-thermal-58' : 'print-thermal-80';

// The shop's nominal thermal roll width in mm (58 or 80) — for declaring the
// actual @page size (see printPageSize.js), which is the paper feed width,
// not the narrower printable content width above.
export const thermalPageWidthMm = (business) =>
  business?.settings?.printWidthMm === 58 ? 58 : 80;
