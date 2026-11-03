import { jsPDF } from 'jspdf';

// US letter, physical size — deliberately inches, not the canvas's own
// 2550x3300px. jsPDF's addImage() places an image into the CURRENT UNIT's
// coordinate space, not pixels, so specifying the page and the image in
// inches sidesteps any ambiguity in how a given jsPDF build maps "px" to
// physical size (historically inconsistent across versions/plugins) —
// the embedded PNG keeps its full 300dpi pixel data either way, this only
// controls what physical page it's stretched to fill.
const PAGE_W_IN = 8.5;
const PAGE_H_IN = 11;

/**
 * Combines two full-page PNG data URLs (front, back — both already
 * rendered at the same pixel size by renderCollage/renderCollageBack)
 * into one two-page, US-letter PDF a coach can print double-sided with a
 * single click from any PDF viewer.
 */
export function buildTwoPagePdf(frontPngDataUrl: string, backPngDataUrl: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format: [PAGE_W_IN, PAGE_H_IN] });
  doc.addImage(frontPngDataUrl, 'PNG', 0, 0, PAGE_W_IN, PAGE_H_IN);
  doc.addPage([PAGE_W_IN, PAGE_H_IN], 'portrait');
  doc.addImage(backPngDataUrl, 'PNG', 0, 0, PAGE_W_IN, PAGE_H_IN);
  return doc;
}
