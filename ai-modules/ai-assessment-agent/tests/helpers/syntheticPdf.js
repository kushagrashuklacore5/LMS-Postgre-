/**
 * A small, well-formed, SYNTHETIC PDF (Helvetica text), for tests and the browser E2E.
 * Text is wrapped into lines of <= 90 characters and pages of 45 lines (text beyond the page edge is
 * not extractable, like in real PDFs). "\n" starts a new line. Byte offsets in the xref table are
 * computed, so real PDF readers open it.
 */
function syntheticPdf(text = 'Synthetic assignment answer for automated tests.') {
  const lines = [];
  for (const para of String(text).replace(/[\\()]/g, ' ').split('\n')) {
    let rest = para;
    do { lines.push(rest.slice(0, 90)); rest = rest.slice(90); } while (rest.length > 0);
  }
  const pages = [];
  for (let i = 0; i < lines.length; i += 45) pages.push(lines.slice(i, i + 45));

  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (const pageLines of pages) {
    const stream = `BT /F1 11 Tf 14 TL 50 740 Td ${pageLines.map((l) => `(${l}) Tj T*`).join(' ')} ET`;
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    const contentRef = objects.length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentRef} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
    kids.push(`${objects.length} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

module.exports = { syntheticPdf };
