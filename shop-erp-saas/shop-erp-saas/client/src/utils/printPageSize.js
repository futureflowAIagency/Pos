import { useEffect } from 'react';

const STYLE_ID = 'thermal-page-size-style';

// Declares the actual print PAGE size (the paper feed width, e.g. 80mm or
// 58mm — NOT the narrower printable content width, see .print-thermal-80/58
// in index.css) via a live <style> tag. This is the piece that was missing
// before: an element's own CSS `width` only lays out content within whatever
// page size the browser/printer driver already assumes — it does not tell
// the browser what that page size actually IS. Without an explicit @page
// size, printing falls back to the printer driver's own default page (which
// can be a completely different width than our content, e.g. a generic
// Letter/A4 default for a driver that doesn't self-report its real roll
// width), and content sized for a narrower page gets silently clipped past
// whatever that mismatched page's right edge is.
//
// Call from a mounted thermal print component with the shop's nominal roll
// width (business?.settings?.printWidthMm ?? 80). Removes the tag on unmount
// so a print right after (e.g. an A4 report) isn't affected by a stale rule
// left over from an earlier thermal receipt.
export function useThermalPageSize(widthMm) {
  useEffect(() => {
    let tag = document.getElementById(STYLE_ID);
    if (!tag) {
      tag = document.createElement('style');
      tag.id = STYLE_ID;
      document.head.appendChild(tag);
    }
    tag.textContent = `@page { size: ${widthMm}mm auto; margin: 0; }`;
    return () => { tag.remove(); };
  }, [widthMm]);
}
