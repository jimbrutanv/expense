// Minimal, dependency-free CSV builder with correct quoting.
function cell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(cell).join(',')];
  for (const r of rows) lines.push(r.map(cell).join(','));
  // Prepend BOM so Excel opens UTF-8 (₹ etc.) correctly.
  return '﻿' + lines.join('\r\n');
}
