// Which thermal-roll width CSS class a receipt should render with, based on
// the shop's Settings → Receipt Paper Width. Defaults to 80mm — printing an
// 80mm-wide layout on a narrower 58mm printer doesn't wrap or shrink to fit,
// the printer hardware just cuts off everything past its physical paper edge
// on every line, which is why this has to actually match the real printer
// instead of being a fixed size.
export const thermalWidthClass = (business) =>
  business?.settings?.printWidthMm === 58 ? 'print-thermal-58' : 'print-thermal-80';
