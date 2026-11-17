/** Escapes one CSV cell (RFC 4180) and neutralises spreadsheet formula injection. */
function cell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** columns: [{ key, label }] ; rows: array of plain objects. Output starts with a UTF-8 BOM so Excel reads it correctly. */
function toCsv(columns, rows) {
  const header = columns.map((c) => cell(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => cell(row[c.key])).join(','));
  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}

module.exports = { toCsv, cell };
